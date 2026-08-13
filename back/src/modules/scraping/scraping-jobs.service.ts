import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import {
  EVENTOS_EN_DETALLE,
  LIMITE_LISTADO,
  LIMITE_MASIVO,
  MAX_INTENTOS,
  USUARIO_SISTEMA,
  calcularBackoffMs,
} from './scraping.constants';
import {
  AccionUsuario,
  ETIQUETA_ESTADO,
  EstadoScraping,
  ORIGENES_ACCION,
} from './scraping.estados';
import { ETIQUETA_SUJETO, ORIGEN_SUJETO, TipoSujeto } from './scraping.sujetos';

/**
 * Todo el SQL de los jobs de scraping.
 *
 * Sin entidades de TypeORM, como `presencia` y `segmentos`: las consultas que
 * importan aquí —el claim con `SKIP LOCKED`, los UPDATE guardados, el upsert
 * por hash— no se expresan con el query builder sin pelearse con él.
 *
 * ## La regla que sostiene todo esto
 *
 * **Ninguna transición se hace leyendo y luego escribiendo.** Cada acción es un
 * solo `UPDATE ... WHERE estado IN (...)`, y lo que decide si valía es el
 * número de filas afectadas. Un `SELECT` previo para comprobar el estado es una
 * carrera con el despachador: entre la lectura y la escritura, el job puede
 * haber sido reclamado, pausado o haber terminado.
 */

export interface JobReclamado {
  id: string;
  tipo_sujeto: TipoSujeto;
  clave: string;
  fuente: string;
  parametros: Record<string, unknown>;
  checkpoint: Record<string, unknown>;
  intentos: number;
  max_intentos: number;
}

export interface OrdenDelLatido {
  estado: EstadoScraping;
  accion_solicitada: 'pausar' | 'cancelar' | null;
}

/**
 * Las filas de un `query()`, venga como venga.
 *
 * `UPDATE ... RETURNING` devuelve `[filas, nAfectadas]` y `INSERT ... RETURNING`
 * devuelve las filas sueltas. Destructurar a ciegas acierta en un caso y
 * devuelve basura en el otro — el mismo tropiezo que documenta
 * `presencia.service.ts`.
 */
function filas<T = any>(res: unknown): T[] {
  if (!Array.isArray(res)) return [];
  if (res.length === 2 && Array.isArray(res[0]) && typeof res[1] === 'number') {
    return res[0] as T[];
  }
  return res as T[];
}

@Injectable()
export class ScrapingJobsService {
  private readonly logger = new Logger(ScrapingJobsService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // ------------------------------------------------------------------- altas

  /**
   * Un job para un sujeto: compañía, persona natural o sociedad no supervisada.
   *
   * La existencia se comprueba contra la tabla de origen de cada población y NO
   * contra `perfil_comercial`: la vista es materializada y se reconstruye cada
   * media hora larga, así que un sujeto recién importado no estaría en ella
   * todavía y se rechazaría un job perfectamente válido.
   *
   * Tampoco hay clave foránea: así el error es «no existe la compañía X» y no
   * un 23503 opaco, y el historial de un job sobrevive a que el sujeto
   * desaparezca del padrón.
   */
  async crear(datos: {
    tipoSujeto: TipoSujeto;
    clave: string;
    fuente: string;
    prioridad?: number;
    parametros?: Record<string, unknown>;
    maxIntentos?: number;
    usuario: string;
  }) {
    await this.exigirSujeto(datos.tipoSujeto, datos.clave);

    try {
      const [job] = filas(
        await this.dataSource.query(
          `INSERT INTO scraping_job
             (tipo_sujeto, clave, fuente, prioridad, parametros, max_intentos, solicitado_por)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
           RETURNING *`,
          [
            datos.tipoSujeto,
            datos.clave,
            datos.fuente,
            datos.prioridad ?? 0,
            JSON.stringify(datos.parametros ?? {}),
            datos.maxIntentos ?? MAX_INTENTOS,
            datos.usuario,
          ],
        ),
      );
      await this.evento(job.id, {
        tipoSujeto: job.tipo_sujeto,
        clave: job.clave,
        accion: 'creado',
        estadoDespues: 'encolado',
        usuario: datos.usuario,
      });
      return job;
    } catch (e: any) {
      // 23505 = el índice único parcial `idx_scraping_job_activo`. Es la
      // respuesta correcta y no un error nuestro: ya hay un job vivo para ese
      // sujeto y esa fuente, incluso si está pausado.
      if (e?.code === '23505') {
        throw new ConflictException(
          `Ya hay un job activo de "${datos.fuente}" para ${ETIQUETA_SUJETO[datos.tipoSujeto]} ` +
            `${datos.clave}.`,
        );
      }
      throw e;
    }
  }

  /** 404 con el nombre de la población, en vez de un error de integridad. */
  private async exigirSujeto(tipo: TipoSujeto, clave: string) {
    const origen = ORIGEN_SUJETO[tipo];
    // Cinturón: el DTO ya valida el tipo, pero esto se interpola en el SQL y no
    // puede depender de que el validador siga puesto dentro de seis meses.
    if (!origen)
      throw new BadRequestException(`Tipo de sujeto desconocido: ${tipo}`);
    const { tabla, columna, filtro } = origen;
    const [fila] = await this.dataSource.query(
      `SELECT 1 FROM ${tabla} WHERE ${filtro} AND ${columna} = $1`,
      [clave],
    );
    if (!fila) {
      throw new NotFoundException(
        `No existe ${ETIQUETA_SUJETO[tipo]} ${clave}`,
      );
    }
  }

  /**
   * Encola muchos sujetos de golpe, de UNA población.
   *
   * Se siembra desde `perfil_comercial` y no desde las tres tablas de origen:
   * es la única que tiene a las tres poblaciones con la misma forma, con
   * provincia y vigencia ya calculadas. Aquí sí compensa que sea materializada
   * —un barrido masivo no necesita a los importados hace diez minutos—,
   * mientras que el alta de uno solo sí, y por eso va contra el origen.
   *
   * `ON CONFLICT ... DO NOTHING` repitiendo el predicado del índice parcial:
   * los sujetos que ya tienen un job vivo se saltan en silencio, que es lo que
   * hace que se pueda relanzar el barrido sin pensar por dónde iba.
   */
  async crearMasivo(datos: {
    tipoSujeto: TipoSujeto;
    fuente: string;
    claves?: string[];
    provincia?: string;
    limite?: number;
    prioridad?: number;
    usuario: string;
  }) {
    const limite = Math.min(datos.limite ?? LIMITE_MASIVO, LIMITE_MASIVO);
    // Los mismos parámetros para el INSERT y para el recuento de pedidos: si se
    // separaran, un filtro añadido en un sitio y no en el otro daría un número
    // de omitidos silenciosamente falso.
    const filtro = `p.tipo_sujeto = $1
                    AND ($2::text[] IS NULL OR p.clave = ANY($2::text[]))
                    AND ($3::text IS NULL OR p.provincia = $3)`;
    const paramsFiltro = [
      datos.tipoSujeto,
      datos.claves?.length ? datos.claves : null,
      datos.provincia ?? null,
      limite,
    ];

    const creados = filas(
      await this.dataSource.query(
        `INSERT INTO scraping_job (tipo_sujeto, clave, fuente, prioridad, max_intentos, solicitado_por)
         SELECT p.tipo_sujeto, p.clave, $5, $6, $7, $8
           FROM perfil_comercial p
          WHERE ${filtro}
          ORDER BY p.clave
          LIMIT $4
         ON CONFLICT (tipo_sujeto, clave, fuente)
              WHERE estado IN ('encolado','corriendo','pausado')
         DO NOTHING
         RETURNING id`,
        [
          ...paramsFiltro,
          datos.fuente,
          datos.prioridad ?? 0,
          MAX_INTENTOS,
          datos.usuario,
        ],
      ),
    );

    if (creados.length > 0) {
      await this.dataSource.query(
        `INSERT INTO scraping_job_evento
           (job_id, tipo_sujeto, clave, accion, estado_despues, usuario, detalle)
         SELECT j.id, j.tipo_sujeto, j.clave, 'creado', 'encolado', $2, 'Alta masiva'
           FROM scraping_job j WHERE j.id = ANY($1::uuid[])`,
        [creados.map((c) => c.id), datos.usuario],
      );
    }

    // `pedidos` no es `creados`: la diferencia son los que ya tenían un job
    // vivo. Devolverla evita que quien lanza el barrido crea que se perdieron
    // filas por el camino.
    const [{ pedidos }] = await this.dataSource.query(
      `SELECT count(*)::int AS pedidos
         FROM (SELECT p.clave FROM perfil_comercial p
                WHERE ${filtro} ORDER BY p.clave LIMIT $4) t`,
      paramsFiltro,
    );

    return { creados: creados.length, omitidos: pedidos - creados.length };
  }

  // ---------------------------------------------------------------- consulta

  /**
   * El listado de la pantalla.
   *
   * Pagina por cursor `(creado_en, id)` y no por OFFSET: la lista se mueve sola
   * mientras el despachador trabaja, y con OFFSET cada refresco se saltaría
   * filas o repetiría otras.
   */
  async listar(q: {
    estado?: EstadoScraping;
    fuente?: string;
    tipoSujeto?: TipoSujeto;
    clave?: string;
    q?: string;
    desde?: string;
    limite?: number;
  }) {
    const limite = Math.min(q.limite ?? 50, LIMITE_LISTADO);
    const cursor = q.desde ? q.desde.split('|') : null;
    const busqueda = q.q?.trim() || null;

    const datos = await this.dataSource.query(
      `SELECT j.id, j.tipo_sujeto, j.clave, p.nombre, p.ruc,
              j.fuente, j.estado, j.accion_solicitada,
              j.prioridad, j.intentos, j.max_intentos, j.proximo_intento_en,
              j.paso, j.progreso_pct, j.resumen, j.ultimo_error, j.reclamado_por,
              j.latido_en, j.iniciado_en, j.finalizado_en, j.solicitado_por,
              j.creado_en, j.actualizado_en,
              -- El cursor sale de aquí YA EN TEXTO, con los microsegundos que
              -- guarda Postgres. Construirlo en JavaScript desde creado_en lo
              -- pasaría por un Date, que sólo llega al milisegundo: el alta
              -- masiva escribe cientos de filas con el mismo now(), y al
              -- truncar, la página siguiente se saltaba todas las que caían
              -- dentro del milisegundo redondeado.
              --
              -- Con 'T' y 'Z' en vez del formato por defecto, que lleva un
              -- espacio y un '+00', para que viaje por la query string sin
              -- depender de cómo escape cada capa.
              to_char(j.creado_en AT TIME ZONE 'UTC',
                      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_ts
         FROM scraping_job j
         -- El nombre sale de perfil_comercial y no de companias: es la única
         -- que tiene a las tres poblaciones. Aquí sí vale que sea
         -- materializada —es texto para pintar, no una decisión—, y como mucho
         -- un sujeto recién importado sale sin nombre durante un rato.
         LEFT JOIN perfil_comercial p
                ON p.tipo_sujeto = j.tipo_sujeto AND p.clave = j.clave
        WHERE ($1::scraping_job_estado IS NULL OR j.estado = $1)
          AND ($2::text IS NULL OR j.fuente = $2)
          AND ($3::text IS NULL OR j.clave = $3)
          AND ($8::text IS NULL OR j.tipo_sujeto = $8)
          -- Clave exacta y RUC por prefijo antes que el nombre: los dos
          -- primeros usan índice, y quien teclea dígitos casi siempre busca uno
          -- de ellos. El ILIKE con comodín por delante no puede usar índice, y
          -- por eso está el último de los tres.
          AND ($6::text IS NULL OR j.clave = $6 OR p.ruc LIKE $6 || '%'
               OR p.nombre ILIKE '%' || $6 || '%')
          AND ($4::timestamptz IS NULL OR (j.creado_en, j.id) < ($4::timestamptz, $5::uuid))
        ORDER BY j.creado_en DESC, j.id DESC
        LIMIT $7`,
      [
        q.estado ?? null,
        q.fuente ?? null,
        q.clave ?? null,
        cursor?.[0] ?? null,
        cursor?.[1] ?? null,
        busqueda,
        limite + 1,
        q.tipoSujeto ?? null,
      ],
    );

    // Se pide una fila de más que el límite: si vuelve, es que hay página
    // siguiente. Es una comparación en vez de un `count(*)` sobre millones.
    const hayMas = datos.length > limite;
    const pagina = hayMas ? datos.slice(0, limite) : datos;
    const ultimo = pagina.at(-1);

    return {
      // `cursor_ts` es de uso interno; fuera va sólo en `siguiente`.
      filas: pagina.map(
        ({ cursor_ts, ...fila }: Record<string, unknown>) => fila,
      ),
      hayMas,
      siguiente: hayMas && ultimo ? `${ultimo.cursor_ts}|${ultimo.id}` : null,
      // El resumen respeta la búsqueda y la fuente, pero NO el estado: las
      // fichas SON el selector de estado, y si se filtraran a sí mismas todas
      // marcarían cero menos la elegida.
      resumen: await this.resumen({
        fuente: q.fuente,
        clave: q.clave,
        tipoSujeto: q.tipoSujeto,
        q: busqueda,
      }),
    };
  }

  /** Cuántos hay en cada estado. Alimenta las fichas del encabezado. */
  async resumen(
    filtro: {
      fuente?: string;
      clave?: string;
      tipoSujeto?: TipoSujeto;
      q?: string | null;
    } = {},
  ) {
    const filasResumen = await this.dataSource.query(
      `SELECT j.estado, count(*)::int AS n
         FROM scraping_job j
         LEFT JOIN perfil_comercial p
                ON p.tipo_sujeto = j.tipo_sujeto AND p.clave = j.clave
        WHERE ($1::text IS NULL OR j.fuente = $1)
          AND ($2::text IS NULL OR j.clave = $2)
          AND ($4::text IS NULL OR j.tipo_sujeto = $4)
          AND ($3::text IS NULL OR j.clave = $3 OR p.ruc LIKE $3 || '%'
               OR p.nombre ILIKE '%' || $3 || '%')
        GROUP BY j.estado`,
      [
        filtro.fuente ?? null,
        filtro.clave ?? null,
        filtro.q ?? null,
        filtro.tipoSujeto ?? null,
      ],
    );
    const porEstado: Record<string, number> = {
      encolado: 0,
      corriendo: 0,
      pausado: 0,
      completado: 0,
      fallido: 0,
      cancelado: 0,
    };
    for (const f of filasResumen) porEstado[f.estado] = f.n;
    return { porEstado };
  }

  async obtener(id: string) {
    const [job] = await this.dataSource.query(
      `SELECT j.*, p.nombre, p.ruc
         FROM scraping_job j
         LEFT JOIN perfil_comercial p
                ON p.tipo_sujeto = j.tipo_sujeto AND p.clave = j.clave
        WHERE j.id = $1`,
      [id],
    );
    if (!job) throw new NotFoundException(`No existe el job ${id}`);

    const eventos = await this.dataSource.query(
      `SELECT accion, estado_antes, estado_despues, usuario, detalle, en
         FROM scraping_job_evento WHERE job_id = $1 ORDER BY en DESC, id DESC LIMIT $2`,
      [id, EVENTOS_EN_DETALLE],
    );

    return { ...job, eventos };
  }

  async resultados(id: string) {
    return this.dataSource.query(
      `SELECT r.tipo, r.documento, r.contenido, r.hash, r.obtenido_en
         FROM scraping_resultado r
        WHERE r.job_id = $1
        ORDER BY r.tipo, r.documento`,
      [id],
    );
  }

  /** El historial de rastreo de un sujeto, para su ficha. */
  async porSujeto(tipoSujeto: TipoSujeto, clave: string) {
    return this.dataSource.query(
      `SELECT id, fuente, estado, intentos, progreso_pct, ultimo_error, creado_en, finalizado_en
         FROM scraping_job
        WHERE tipo_sujeto = $1 AND clave = $2
        ORDER BY creado_en DESC LIMIT 20`,
      [tipoSujeto, clave],
    );
  }

  // ------------------------------------------------ acciones del despachador

  /**
   * Reserva hasta `cuantos` jobs para este proceso.
   *
   * Dos detalles que no son adorno:
   *
   * - `accion_solicitada IS NULL` en el WHERE. Si el claim se llevara jobs con
   *   una orden pendiente, una pausa pedida un instante antes se perdería. Y
   *   por lo mismo, el claim NO borra la orden.
   * - `intentos` se incrementa AL RECLAMAR, no al fallar. Un job que tumba el
   *   proceso —OOM, un bucle infinito— volvería si no a la cola con los mismos
   *   intentos y lo tumbaría otra vez, para siempre. El precio es que un
   *   reinicio del servidor consume un intento de cada job en vuelo.
   */
  async reclamar(cuantos: number, identidad: string): Promise<JobReclamado[]> {
    return filas<JobReclamado>(
      await this.dataSource.query(
        `WITH siguiente AS (
           SELECT id FROM scraping_job
            WHERE estado = 'encolado'
              AND accion_solicitada IS NULL
              AND proximo_intento_en <= now()
              AND intentos < max_intentos
            ORDER BY prioridad DESC, proximo_intento_en, creado_en
            LIMIT $1
            FOR UPDATE SKIP LOCKED
         )
         UPDATE scraping_job j
            SET estado = 'corriendo',
                intentos = j.intentos + 1,
                reclamado_por = $2,
                iniciado_en = COALESCE(j.iniciado_en, now()),
                latido_en = now(),
                ultimo_error = NULL,
                actualizado_en = now()
           FROM siguiente s
          WHERE j.id = s.id
        RETURNING j.id, j.tipo_sujeto, j.clave, j.fuente, j.parametros, j.checkpoint,
                  j.intentos, j.max_intentos`,
        [cuantos, identidad],
      ),
    );
  }

  /**
   * Escribe el avance y lee la orden del usuario en el mismo viaje.
   *
   * No se throttlea como el `reportProgress` de los importadores: allí eran
   * decenas de miles de lotes por job, aquí son unos pocos pasos por compañía y
   * cada uno rodea una petición HTTP que cuesta mil veces más.
   */
  async latido(
    id: string,
    avance: {
      pct?: number;
      paso?: string;
      checkpoint?: Record<string, unknown>;
    },
  ): Promise<OrdenDelLatido | null> {
    const [fila] = filas<OrdenDelLatido>(
      await this.dataSource.query(
        `UPDATE scraping_job
            SET latido_en = now(),
                progreso_pct = COALESCE($2::smallint, progreso_pct),
                paso = COALESCE($3::text, paso),
                checkpoint = COALESCE($4::jsonb, checkpoint),
                actualizado_en = now()
          WHERE id = $1
        RETURNING estado, accion_solicitada`,
        [
          id,
          avance.pct ?? null,
          avance.paso ?? null,
          avance.checkpoint ? JSON.stringify(avance.checkpoint) : null,
        ],
      ),
    );
    return fila ?? null;
  }

  /** Terminó bien. */
  async completar(job: JobReclamado, resumen: Record<string, unknown>) {
    await this.cerrar(job, 'completado', 'completado', {
      resumen,
      progresoPct: 100,
    });
  }

  /**
   * Terminó mal.
   *
   * Si quedan intentos y el error no es definitivo, vuelve a la cola con
   * backoff en vez de morir: la mayoría de los fallos de red son transitorios y
   * rendirse a la primera dejaría media población sin rastrear.
   */
  async fallar(job: JobReclamado, error: string, permanente: boolean) {
    const quedan = job.intentos < job.max_intentos;
    if (permanente || !quedan) {
      await this.cerrar(job, 'fallido', 'fallido', {
        error,
        detalle: permanente
          ? 'Error permanente: no se reintenta'
          : 'Intentos agotados',
      });
      return;
    }

    const esperaMs = calcularBackoffMs(job.intentos);
    await this.dataSource.query(
      `UPDATE scraping_job
          SET estado = 'encolado', accion_solicitada = NULL, reclamado_por = NULL,
              ultimo_error = $2, proximo_intento_en = now() + ($3 || ' milliseconds')::interval,
              actualizado_en = now()
        WHERE id = $1 AND estado = 'corriendo'`,
      [job.id, error, String(esperaMs)],
    );
    await this.evento(job.id, {
      tipoSujeto: job.tipo_sujeto,
      clave: job.clave,
      accion: 'reintento_programado',
      estadoAntes: 'corriendo',
      estadoDespues: 'encolado',
      usuario: USUARIO_SISTEMA,
      detalle:
        `Intento ${job.intentos}/${job.max_intentos} falló: ${error}. ` +
        `Reintenta en ${Math.round(esperaMs / 1000)} s.`,
    });
  }

  /** El worker vio `accion_solicitada` y obedeció. */
  async detenerPorOrden(job: JobReclamado, estado: 'pausado' | 'cancelado') {
    await this.cerrar(job, estado, estado, {
      // La orden se limpia al cumplirla: si se quedara puesta, reanudar el job
      // lo pausaría otra vez en el primer latido.
      limpiarAccion: true,
      detalle:
        estado === 'pausado' ? 'Pausado a petición' : 'Cancelado a petición',
    });
  }

  private async cerrar(
    job: JobReclamado,
    estado: EstadoScraping,
    accion: string,
    opciones: {
      resumen?: Record<string, unknown>;
      error?: string;
      progresoPct?: number;
      limpiarAccion?: boolean;
      detalle?: string;
    },
  ) {
    await this.dataSource.query(
      `UPDATE scraping_job
          SET estado = $2::scraping_job_estado,
              accion_solicitada = NULL,
              reclamado_por = NULL,
              finalizado_en = now(),
              progreso_pct = COALESCE($3::smallint, progreso_pct),
              resumen = COALESCE($4::jsonb, resumen),
              ultimo_error = $5,
              actualizado_en = now()
        WHERE id = $1 AND estado = 'corriendo'`,
      [
        job.id,
        estado,
        opciones.progresoPct ?? null,
        opciones.resumen ? JSON.stringify(opciones.resumen) : null,
        opciones.error ?? null,
      ],
    );
    await this.evento(job.id, {
      tipoSujeto: job.tipo_sujeto,
      clave: job.clave,
      accion,
      estadoAntes: 'corriendo',
      estadoDespues: estado,
      usuario: USUARIO_SISTEMA,
      detalle: opciones.detalle ?? opciones.error ?? null,
    });
  }

  // --------------------------------------------------- acciones del usuario

  /**
   * Pausar, reanudar, cancelar o reintentar.
   *
   * Una sola sentencia por acción, con el estado de origen en el `WHERE`. Si no
   * afecta a ninguna fila, se mira por qué: el job no existe (404) o está en un
   * estado desde el que la acción no tiene sentido (409, **diciendo cuál**, que
   * es la diferencia entre entender el rechazo y tener que recargar).
   */
  async accionar(id: string, accion: AccionUsuario, usuario: string) {
    const afectadas = filas(
      await this.dataSource.query(this.sqlAccion(accion), [id]),
    );

    if (afectadas.length === 0) {
      const [job] = await this.dataSource.query(
        `SELECT estado FROM scraping_job WHERE id = $1`,
        [id],
      );
      if (!job) throw new NotFoundException(`No existe el job ${id}`);
      throw new ConflictException(
        `El job está ${ETIQUETA_ESTADO[job.estado as EstadoScraping]} y no se puede ` +
          `${accion} desde ahí (se puede desde: ${ORIGENES_ACCION[accion]
            .map((e) => ETIQUETA_ESTADO[e])
            .join(', ')}).`,
      );
    }

    const job = afectadas[0];
    await this.evento(id, {
      tipoSujeto: job.tipo_sujeto,
      clave: job.clave,
      accion: this.nombreEvento(accion, job.estado),
      estadoAntes: job.estado_antes,
      estadoDespues: job.estado,
      usuario,
    });
    return job;
  }

  private sqlAccion(accion: AccionUsuario): string {
    // `estado AS estado_antes` sale del `old` implícito: en Postgres, el
    // RETURNING de un UPDATE ve la fila NUEVA, así que el estado anterior se
    // captura con una subconsulta lateral antes de escribir.
    const anterior = `(SELECT estado FROM scraping_job WHERE id = $1) AS estado_antes`;

    switch (accion) {
      case 'pausar':
        // Si todavía nadie lo reclamó, la pausa es inmediata: no hay worker a
        // quien pedírsela. Y así el claim —que exige accion_solicitada IS
        // NULL— ya no puede llevárselo mientras tanto.
        return `UPDATE scraping_job
                   SET accion_solicitada = CASE WHEN estado = 'corriendo'
                                                THEN 'pausar'::scraping_job_accion END,
                       estado = CASE WHEN estado = 'encolado'
                                     THEN 'pausado'::scraping_job_estado ELSE estado END,
                       finalizado_en = CASE WHEN estado = 'encolado' THEN now() ELSE finalizado_en END,
                       actualizado_en = now()
                 WHERE id = $1 AND estado IN ('encolado','corriendo')
                RETURNING *, ${anterior}`;

      case 'cancelar':
        return `UPDATE scraping_job
                   SET accion_solicitada = CASE WHEN estado = 'corriendo'
                                                THEN 'cancelar'::scraping_job_accion END,
                       estado = CASE WHEN estado IN ('encolado','pausado')
                                     THEN 'cancelado'::scraping_job_estado ELSE estado END,
                       finalizado_en = CASE WHEN estado IN ('encolado','pausado')
                                            THEN now() ELSE finalizado_en END,
                       actualizado_en = now()
                 WHERE id = $1 AND estado IN ('encolado','corriendo','pausado')
                RETURNING *, ${anterior}`;

      case 'reanudar':
        // Vuelve a la COLA, nunca directo a 'corriendo': si escribiera
        // 'corriendo' no habría nadie ejecutándolo, y reanudar quinientos de
        // golpe se saltaría el tope de workers. El checkpoint se conserva.
        return `UPDATE scraping_job
                   SET estado = 'encolado', accion_solicitada = NULL, finalizado_en = NULL,
                       proximo_intento_en = now(), ultimo_error = NULL, actualizado_en = now()
                 WHERE id = $1 AND estado = 'pausado'
                RETURNING *, ${anterior}`;

      case 'reintentar':
        // Empieza de cero: intentos a 0 y checkpoint limpio. Reintentar lo que
        // ya se rindió es una decisión nueva, no la continuación de la vieja.
        return `UPDATE scraping_job
                   SET estado = 'encolado', accion_solicitada = NULL, intentos = 0,
                       checkpoint = '{}'::jsonb, progreso_pct = 0, paso = NULL,
                       proximo_intento_en = now(), ultimo_error = NULL,
                       finalizado_en = NULL, actualizado_en = now()
                 WHERE id = $1 AND estado IN ('fallido','cancelado')
                RETURNING *, ${anterior}`;
    }
  }

  private nombreEvento(accion: AccionUsuario, estadoFinal: string): string {
    if (accion === 'pausar')
      return estadoFinal === 'pausado' ? 'pausado' : 'pausa_solicitada';
    if (accion === 'cancelar') {
      return estadoFinal === 'cancelado'
        ? 'cancelado'
        : 'cancelacion_solicitada';
    }
    return accion === 'reanudar' ? 'reanudado' : 'reintentado';
  }

  // -------------------------------------------------------------- resultados

  /**
   * Guarda un documento. Devuelve `true` si era nuevo o distinto.
   *
   * El `WHERE` del `DO UPDATE` compara el hash: si el contenido no cambió, no
   * se reescribe la fila. Eso convierte «lo volvimos a bajar» y «cambió» en dos
   * cosas distintas, que es la única señal que interesa de un rastreo periódico.
   */
  async guardarResultado(datos: {
    jobId: string;
    tipoSujeto: TipoSujeto;
    clave: string;
    fuente: string;
    tipo: string;
    /** Desambigua varios documentos del mismo tipo. '' si sólo hay uno. */
    documento?: string;
    contenido: Record<string, unknown>;
  }): Promise<boolean> {
    const json = JSON.stringify(datos.contenido);
    const res = filas(
      await this.dataSource.query(
        // El JSON viaja como texto y se castea en cada sitio: si el parámetro
        // se usara primero como ::jsonb, Postgres deduciría ese tipo para él y
        // el md5 fallaría con "function md5(jsonb) does not exist".
        `INSERT INTO scraping_resultado
           (job_id, tipo_sujeto, clave, fuente, tipo, documento, contenido, hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7::text::jsonb, md5($7::text))
         ON CONFLICT (tipo_sujeto, clave, fuente, tipo, documento) DO UPDATE
            SET contenido = EXCLUDED.contenido, hash = EXCLUDED.hash,
                job_id = EXCLUDED.job_id, obtenido_en = now()
          WHERE scraping_resultado.hash IS DISTINCT FROM EXCLUDED.hash
        RETURNING id`,
        [
          datos.jobId,
          datos.tipoSujeto,
          datos.clave,
          datos.fuente,
          datos.tipo,
          datos.documento ?? '',
          json,
        ],
      ),
    );
    return res.length > 0;
  }

  // -------------------------------------------------------------- auditoría

  async evento(
    jobId: string,
    e: {
      tipoSujeto: TipoSujeto;
      clave: string;
      accion: string;
      estadoAntes?: EstadoScraping | null;
      estadoDespues?: EstadoScraping | null;
      usuario: string;
      detalle?: string | null;
    },
    runner?: QueryRunner,
  ) {
    const sql = `INSERT INTO scraping_job_evento
                   (job_id, tipo_sujeto, clave, accion, estado_antes, estado_despues,
                    usuario, detalle)
                 VALUES ($1,$2,$3,$4,$5::scraping_job_estado,$6::scraping_job_estado,$7,$8)`;
    const params = [
      jobId,
      e.tipoSujeto,
      e.clave,
      e.accion,
      e.estadoAntes ?? null,
      e.estadoDespues ?? null,
      e.usuario,
      e.detalle ?? null,
    ];
    try {
      await (runner
        ? runner.query(sql, params)
        : this.dataSource.query(sql, params));
    } catch (err) {
      // La auditoría no puede tumbar un job. Si falla, se registra y se sigue:
      // perder una línea de histórico es malo, perder el trabajo es peor.
      this.logger.warn(
        `No se pudo escribir el evento "${e.accion}" del job ${jobId}: ${err}`,
      );
    }
  }
}
