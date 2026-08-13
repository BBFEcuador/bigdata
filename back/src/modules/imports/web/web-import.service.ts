import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ImportJobsService } from '../import-jobs.service';
import { WebClient } from './web.client';
import { Candidato, candidatos } from './web.dominios';
import { Lectura, leer } from './web.html';

/** Cuántas compañías se reservan por lote. */
const TAMANO_LOTE = 100;

/** Una compañía que falla más de esto se deja estar; no bloquea el recorrido. */
const MAX_INTENTOS = 2;

/**
 * Cuántas páginas se llegan a descargar por compañía.
 *
 * Los candidatos son hasta ocho, pero el DNS descarta casi todos sin coste. De
 * los que resuelven, tres páginas bastan: a partir de ahí lo que se está
 * comprobando son dominios de terceros que casualmente se parecen al nombre.
 */
const MAX_PAGINAS = 3;

/** Quién firma lo que propone el rastreador. Nunca es una persona. */
const AUTOR = 'rastreador';

interface Hallazgo {
  candidato: Candidato;
  url: string;
  lectura: Lectura;
}

/**
 * Búsqueda de la presencia digital de las compañías.
 *
 * ## Qué hace exactamente
 *
 * Para cada compañía conjetura dominios a partir de su nombre comercial, su
 * razón social y el dominio de su correo; comprueba cuáles existen; y de los
 * que existen se lleva el título de la portada y los enlaces a redes sociales.
 *
 * ## Qué NO hace
 *
 * No decide. Todo lo que encuentra entra en `presencia_canal` como
 * `propuesto`, y es una persona quien lo confirma o lo descarta. El rastreador
 * es un generador de trabajo para el revisor, no una fuente de verdad.
 *
 * De ahí la regla que sostiene el módulo entero: **el rastreador jamás
 * sobrescribe una fila que ya existe**. Si alguien confirmó un Instagram, o
 * descartó un dominio por equivocado, el siguiente recorrido tiene que
 * respetarlo — si no, cada rastreo desharía el trabajo del anterior.
 */
@Injectable()
export class WebImportService {
  private readonly logger = new Logger(WebImportService.name);
  private cancelar = false;

  constructor(
    private readonly jobsService: ImportJobsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  enqueue(jobId: string): void {
    void this.run(jobId).catch((err) => {
      this.logger.error(
        `Job ${jobId} falló de forma inesperada: ${err?.message}`,
        err?.stack,
      );
    });
  }

  detener(): void {
    this.cancelar = true;
  }

  /**
   * Siembra la lista de trabajo con las compañías vigentes.
   *
   * Idempotente: al reejecutarlo entran las compañías nuevas sin reiniciar lo
   * ya revisado. Se excluyen las marcadas como ausentes en el último padrón:
   * rastrear la web de una compañía que ya no aparece es gastar peticiones en
   * lo que nadie va a llamar.
   */
  async sembrar(): Promise<number> {
    const res = await this.dataSource.query(`
      INSERT INTO web_consulta (expediente, ruc)
      SELECT expediente, ruc FROM contribuyentes
       WHERE tipo = 'companies' AND ausente_desde_job IS NULL
      ON CONFLICT (expediente) DO NOTHING
    `);
    return Array.isArray(res) && typeof res[1] === 'number' ? res[1] : 0;
  }

  private async run(jobId: string): Promise<void> {
    const job = await this.jobsService.findOne(jobId);
    if (!job) return;

    this.cancelar = false;
    const t0 = Date.now();
    const client = new WebClient();

    let hechas = 0;
    let conSitio = 0;
    let sinSitio = 0;
    let errores = 0;
    let propuestas = 0;

    try {
      await this.jobsService.update(jobId, {
        status: 'parsing',
        startedAt: new Date(),
      });

      const sembradas = await this.sembrar();
      const total = await this.contarPendientes();
      this.logger.log(
        `Job ${jobId}: ${sembradas} compañías nuevas, ${total} pendientes`,
      );

      for (;;) {
        if (this.cancelar) {
          this.logger.warn(
            `Job ${jobId} detenido a petición; se reanuda por las pendientes.`,
          );
          break;
        }

        const lote = await this.tomarLote();
        if (lote.length === 0) break;

        for (const fila of lote) {
          if (this.cancelar) break;
          try {
            const n = await this.revisar(client, fila, jobId);
            hechas++;
            propuestas += n;
            if (n > 0) conSitio++;
            else sinSitio++;
          } catch (err) {
            errores++;
            await this.marcarError(
              fila.expediente,
              jobId,
              (err as Error).message,
            );
          }
        }

        await this.jobsService.reportProgress(jobId, {
          rowsRead: hechas,
          rowsCopied: propuestas,
          rowsRejected: errores,
          progressPct:
            total > 0 ? Math.min(99, Math.round((hechas / total) * 100)) : 0,
        });
      }

      await this.jobsService.update(jobId, {
        status: 'completed',
        progressPct: 100,
        rowsRead: hechas,
        rowsCopied: propuestas,
        rowsRejected: errores,
        avisos:
          `${conSitio} compañías con presencia encontrada, ${sinSitio} sin nada, ` +
          `${errores} con error. ${propuestas} propuestas a revisar. ` +
          `Quedan ${await this.contarPendientes()} pendientes. ` +
          `Nada de esto está confirmado: hay que validarlo desde /presencia.`,
        finishedAt: new Date(),
      });

      const horas = ((Date.now() - t0) / 3_600_000).toFixed(1);
      this.logger.log(
        `Job ${jobId} terminado en ${horas} h: ${hechas} compañías`,
      );
    } catch (err) {
      const mensaje = (err as Error)?.message ?? String(err);
      this.logger.error(`Job ${jobId} falló: ${mensaje}`);
      await this.jobsService
        .update(jobId, {
          status: 'failed',
          errorMessage: mensaje,
          rowsRead: hechas,
          avisos: `Se revisaron ${hechas} compañías antes del fallo. El progreso está guardado.`,
          finishedAt: new Date(),
        })
        .catch(() => undefined);
    } finally {
      this.jobsService.forgetProgress(jobId);
    }
  }

  /**
   * Revisa una compañía: conjetura, comprueba y propone.
   *
   * Devuelve cuántas propuestas nuevas se guardaron.
   */
  private async revisar(
    client: WebClient,
    fila: FilaTrabajo,
    jobId: string,
  ): Promise<number> {
    const lista = candidatos({
      nombre: fila.nombre,
      nombreComercial: fila.nombre_comercial,
      correo: fila.correo,
    });

    await this.guardarCandidatos(fila.expediente, lista);

    const hallazgos: Hallazgo[] = [];
    const nombres = [fila.nombre_comercial, fila.nombre].filter(
      Boolean,
    ) as string[];

    for (const candidato of lista) {
      if (hallazgos.length >= MAX_PAGINAS) break;

      const r = await client.portada(candidato.dominio);
      if (!r.ok) {
        await this.anotarCandidato(fila.expediente, candidato.dominio, {
          resuelveDns: r.resuelveDns,
          status: r.status,
          motivo: r.motivo,
        });
        continue;
      }

      const lectura = leer(r.html ?? '', nombres);
      await this.anotarCandidato(fila.expediente, candidato.dominio, {
        resuelveDns: true,
        status: r.status,
        urlFinal: r.urlFinal,
        titulo: lectura.titulo,
        motivo: lectura.aparcado ? 'aparcado' : null,
      });

      // Un dominio en venta o una portada por defecto de Apache no es una web
      // de empresa. Filtrarlo no es "decidir": es no llenar de ruido la cola de
      // quien luego tiene que revisar esto a mano.
      if (lectura.aparcado) continue;

      hallazgos.push({
        candidato,
        url: r.urlFinal ?? `https://${candidato.dominio}/`,
        lectura,
      });

      // No hace falta seguir probando si ya tenemos lo mejor que puede salir:
      // el dominio del correo (que se propone sin condiciones) o una página que
      // menciona a la compañía. Cualquier otro candidato sería peor.
      if (candidato.origen === 'correo' || lectura.nombreEnPagina) break;
    }

    const n = await this.proponer(fila, hallazgos);
    await this.dataSource.query(
      `UPDATE web_consulta
          SET estado = $2, candidatos = $3, hallazgos = $4, revisado_en = now(),
              job_id = $5, ultimo_error = NULL, updated_at = now()
        WHERE expediente = $1`,
      [
        fila.expediente,
        hallazgos.length > 0 ? 'ok' : 'sin_sitio',
        lista.length,
        n,
        jobId,
      ],
    );
    return n;
  }

  /**
   * Guarda las propuestas: el sitio elegido y sus redes.
   *
   * El `ON CONFLICT DO NOTHING` es la pieza crítica del módulo. Un `DO UPDATE`
   * aquí volvería a poner en 'propuesto' lo que una persona ya confirmó o
   * descartó, y cada rastreo desharía el trabajo del anterior sin que nadie se
   * diera cuenta hasta que el revisor viera los mismos casos por tercera vez.
   */
  private async proponer(
    fila: FilaTrabajo,
    hallazgos: Hallazgo[],
  ): Promise<number> {
    if (hallazgos.length === 0) return 0;

    const mejor = elegir(hallazgos);
    if (!mejor) return 0;

    let guardadas = 0;
    await this.dataSource.transaction(async (m) => {
      guardadas += await insertar(
        m,
        fila.expediente,
        'web',
        origen(mejor.url),
        null,
        {
          titulo: mejor.lectura.titulo,
          descripcion: mejor.lectura.descripcion,
          nombre_en_pagina: mejor.lectura.nombreEnPagina,
          regla: mejor.candidato.origen,
          dominio: mejor.candidato.dominio,
        },
      );

      for (const s of mejor.lectura.sociales) {
        guardadas += await insertar(
          m,
          fila.expediente,
          s.red,
          s.url,
          s.handle,
          {
            desde: mejor.candidato.dominio,
          },
        );
      }
    });
    return guardadas;
  }

  /** Reparto por estado y cuánto queda por revisar a mano. */
  async estado() {
    const filas = await this.dataSource.query(
      `SELECT estado, count(*)::int AS n FROM web_consulta GROUP BY estado`,
    );
    const porEstado = Object.fromEntries(
      filas.map((f: { estado: string; n: number }) => [f.estado, Number(f.n)]),
    );
    const canales = await this.dataSource.query(
      `SELECT canal, revision, count(*)::int AS n
         FROM presencia_canal GROUP BY canal, revision ORDER BY canal, revision`,
    );
    const [motivos] = await this.dataSource.query(`
      SELECT count(*) FILTER (WHERE motivo = 'sin_dns')::int   AS sin_dns,
             count(*) FILTER (WHERE motivo = 'aparcado')::int  AS aparcados,
             count(*) FILTER (WHERE motivo IS NULL AND revisado_en IS NOT NULL)::int AS con_pagina,
             count(*)::int AS total
        FROM web_candidato
    `);
    return {
      porEstado,
      pendientes: await this.contarPendientes(),
      candidatos: motivos,
      canales,
    };
  }

  private async contarPendientes(): Promise<number> {
    const [r] = await this.dataSource.query(
      `SELECT count(*)::int AS n FROM web_consulta
        WHERE estado = 'pendiente' OR (estado = 'error' AND intentos < $1)`,
      [MAX_INTENTOS],
    );
    return Number(r?.n ?? 0);
  }

  /**
   * Reserva el siguiente lote y trae de paso lo que hace falta para conjeturar.
   *
   * `FOR UPDATE SKIP LOCKED` permite correr dos procesos a la vez sin que se
   * pisen. El `JOIN` con `perfil_comercial` es por el correo: su dominio es el
   * candidato que más acierta, con diferencia.
   */
  private async tomarLote(): Promise<FilaTrabajo[]> {
    return this.dataSource.query(
      `WITH siguiente AS (
         SELECT w.expediente FROM web_consulta w
          WHERE w.estado = 'pendiente' OR (w.estado = 'error' AND w.intentos < $2)
          ORDER BY w.expediente
          LIMIT $1
          FOR UPDATE SKIP LOCKED
       ), reservadas AS (
         UPDATE web_consulta c
            SET intentos = c.intentos + 1, updated_at = now()
           FROM siguiente s
          WHERE c.expediente = s.expediente
         RETURNING c.expediente
       )
       SELECT r.expediente,
              co.nombre,
              co.sri_nombre_comercial AS nombre_comercial,
              p.correo
         FROM reservadas r
         JOIN contribuyentes co ON co.expediente = r.expediente AND co.tipo = 'companies'
         LEFT JOIN perfil_comercial p
                ON p.tipo_sujeto = 'compania' AND p.clave = r.expediente`,
      [TAMANO_LOTE, MAX_INTENTOS],
    );
  }

  /** Deja constancia de qué dominios se conjeturaron, antes de probarlos. */
  private async guardarCandidatos(
    expediente: string,
    lista: Candidato[],
  ): Promise<void> {
    for (const c of lista) {
      await this.dataSource.query(
        `INSERT INTO web_candidato (expediente, dominio, origen, orden)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (expediente, dominio) DO NOTHING`,
        [expediente, c.dominio, c.origen, c.orden],
      );
    }
  }

  private async anotarCandidato(
    expediente: string,
    dominio: string,
    datos: {
      resuelveDns: boolean;
      status?: number;
      urlFinal?: string;
      titulo?: string | null;
      motivo?: string | null;
    },
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE web_candidato
          SET resuelve_dns = $3, http_status = $4, url_final = $5, titulo = $6,
              motivo = $7, revisado_en = now()
        WHERE expediente = $1 AND dominio = $2`,
      [
        expediente,
        dominio,
        datos.resuelveDns,
        datos.status ?? null,
        datos.urlFinal ?? null,
        datos.titulo ?? null,
        datos.motivo ?? null,
      ],
    );
  }

  private async marcarError(
    expediente: string,
    jobId: string,
    mensaje: string,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE web_consulta
          SET estado = 'error', ultimo_error = $2, job_id = $3, updated_at = now()
        WHERE expediente = $1`,
      [expediente, mensaje.slice(0, 500), jobId],
    );
  }
}

interface FilaTrabajo {
  expediente: string;
  nombre: string;
  nombre_comercial: string | null;
  correo: string | null;
}

/**
 * Cuál de las páginas encontradas se propone, si es que alguna.
 *
 * Dos varas de medir distintas, y la asimetría está medida contra 100
 * compañías cuya web ya conocíamos:
 *
 * - **El dominio de un correo se propone sin más.** Acertó 32 de 40 (80 %). No
 *   se adivinó: lo escribió la propia empresa en un formulario oficial.
 * - **Lo derivado del nombre sólo si la página la menciona.** Es una conjetura,
 *   y sin esa condición acertaba 11 de 87 — una cola de revisión con ocho de
 *   cada nueve fichas equivocadas, que ningún comercial va a trabajar dos días
 *   seguidos.
 *
 * Devolver `undefined` —encontrar página y no proponer nada— es un resultado
 * legítimo y frecuente: significa "esto existe pero no hay motivo para creer
 * que sea suyo". El candidato queda anotado con su motivo por si algún día se
 * afina la regla.
 */
function elegir(hallazgos: Hallazgo[]): Hallazgo | undefined {
  return (
    hallazgos.find((h) => h.candidato.origen === 'correo') ??
    hallazgos.find((h) => h.lectura.nombreEnPagina)
  );
}

/** El origen de una URL, que es lo que se guarda como "el sitio". */
function origen(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return url;
  }
}

/** Inserta una propuesta si no había ya una fila para ese valor. Devuelve 1 o 0. */
async function insertar(
  m: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  expediente: string,
  canal: string,
  valor: string,
  handle: string | null,
  indicios: Record<string, unknown>,
): Promise<number> {
  const res = (await m.query(
    `INSERT INTO presencia_canal
       (expediente, canal, valor, handle, revision, fuente, indicios, creado_por, actualizado_por)
     VALUES ($1,$2,$3,$4,'propuesto',$5,$6::jsonb,$7,$7)
     ON CONFLICT (expediente, canal, valor) DO NOTHING
     RETURNING id`,
    [expediente, canal, valor, handle, AUTOR, JSON.stringify(indicios), AUTOR],
  )) as unknown[];
  return Array.isArray(res) && res.length > 0 ? 1 : 0;
}
