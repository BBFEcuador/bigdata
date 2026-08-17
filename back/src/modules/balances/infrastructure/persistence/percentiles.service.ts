import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CONCEPTOS } from '../../../../common/finanzas/conceptos';
import {
  GRUPOS_INDICADOR,
  INDICADORES,
  sqlDeFormula,
} from '../../../../common/finanzas/indicadores';
import { BalancesPercentilesRepository } from '../../application/ports/balances-read.repository';

/**
 * Cuántas empresas hacen falta en una división CIIU para que sea un grupo de
 * pares y no una anécdota.
 *
 * Con menos de esto, la mediana la mueve una sola empresa y el percentil 90 es
 * literalmente "la segunda de tres". Por debajo del umbral se compara contra la
 * sección (la letra), que siempre tiene miles.
 */
const MUESTRA_MINIMA = 30;

/** Cortes que se publican de cada sector. */
const CORTES = [10, 25, 50, 75, 90];

/**
 * Comparación sectorial: el percentil de cada indicador dentro de su sector.
 *
 * ## Por qué está precalculado
 *
 * La pregunta "¿en qué percentil de su sector está esta empresa?" no se puede
 * responder mirando sólo a esa empresa: hay que ordenar a las otras 35.000 de su
 * división. Hacerlo en cada visita significaría evaluar 16 indicadores sobre
 * decenas de miles de balances mientras alguien espera. Se calcula una vez por
 * carga y se guarda.
 *
 * ## Por qué el percentil es exacto y no interpolado
 *
 * Teniendo los cortes p10…p90 del sector se puede estimar la posición de una
 * empresa interpolando entre ellos, y sale gratis. Sale gratis y sale mal: entre
 * el p50 y el p75 de un ratio de liquidez caben órdenes de magnitud, y la
 * interpolación lineal dentro de ese tramo produce un número que parece medido y
 * no lo es. Se guarda el percentil real de cada empresa, calculado con
 * `cume_dist()` sobre su grupo de pares.
 *
 * ## Qué mide el percentil
 *
 * El porcentaje de empresas del sector que quedan por debajo, repartiendo el
 * empate: las estrictamente menores más la mitad de las que valen exactamente lo
 * mismo. El empate no es un caso de borde en estos datos —una cuarta parte del
 * país declara ROE exactamente 0— y contar "menores o iguales" a secas le daría
 * a todas ellas el tope del empate.
 *
 * Sólo cuentan las empresas que tienen el indicador calculado: una empresa sin
 * ingresos no tiene margen neto, y meterla como cero hundiría la mediana del
 * sector inventando márgenes que nadie declaró.
 */
@Injectable()
export class PercentilesService implements BalancesPercentilesRepository {
  private readonly logger = new Logger(PercentilesService.name);

  /** Recálculo en curso, si lo hay. */
  private corriendo: Promise<unknown> | null = null;
  /** Alguien pidió otro mientras corría; se hará uno solo al terminar. */
  private pendiente: string | null = null;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Pide un recálculo sin esperarlo, fusionando las peticiones que se solapen.
   *
   * Es lo que llama el importador de balances al terminar un job. Cargar los
   * cinco ejercicios seguidos son cinco jobs, y cinco recálculos simultáneos de
   * cuatro minutos cada uno se pelearían por las mismas tablas para dejar
   * exactamente el mismo resultado. Aquí sólo hay uno en vuelo: si llega otra
   * petición mientras corre, queda **una** pendiente —da igual cuántas lleguen—
   * y se ejecuta al terminar, ya con todos los datos nuevos dentro.
   *
   * No bloquea al job que lo pide ni lo hace fallar: el import ya terminó bien,
   * y unos percentiles que no se pudieron rehacer son un aviso en el log, no un
   * import fallido.
   */
  solicitar(motivo: string): void {
    if (this.corriendo) {
      this.pendiente = motivo;
      this.logger.log(
        `Recálculo de percentiles encolado (${motivo}); ya hay uno en curso`,
      );
      return;
    }

    this.logger.log(`Recálculo de percentiles lanzado (${motivo})`);
    this.corriendo = this.recalcular()
      .catch((err) => {
        this.logger.error(
          `El recálculo de percentiles falló (${motivo}): ${(err as Error)?.message}. ` +
            `Los percentiles anteriores siguen intactos; relánzalo con "npm run percentiles".`,
        );
      })
      .finally(() => {
        this.corriendo = null;
        const siguiente = this.pendiente;
        this.pendiente = null;
        if (siguiente) this.solicitar(siguiente);
      });
  }

  /**
   * `(clave, valor)` por indicador, para meter en un `CROSS JOIN LATERAL`.
   *
   * Las claves y las fórmulas salen de `INDICADORES`, que es código fuente, no
   * entrada del cliente. Aun así la clave se valida: es lo que impide que un
   * indicador nuevo con un nombre raro se cuele en el SQL sin avisar.
   */
  private lateralIndicadores(col: string): string {
    return INDICADORES.map((i) => {
      if (!/^[a-zA-Z]+$/.test(i.clave)) {
        throw new Error(`Clave de indicador no válida: ${i.clave}`);
      }
      return `('${i.clave}', ${sqlDeFormula(i.formula, col)})`;
    }).join(',\n            ');
  }

  /**
   * Vuelca `CONCEPTOS` en `concepto_cuenta`.
   *
   * La tabla es un espejo de la constante, no una fuente paralela: se borra y se
   * reescribe entera. Si algún día un concepto cambia de código, el espejo
   * cambia con él en el siguiente recálculo y no queda ninguna fila huérfana
   * enlazando una cuenta que ya no significa eso.
   */
  private async sincronizarConceptos(): Promise<number> {
    const filas: [number, string, string][] = [];
    for (const c of CONCEPTOS) {
      for (const [formulario, codigo] of Object.entries(c.codigos)) {
        if (codigo) filas.push([Number(formulario), codigo, c.clave]);
      }
    }

    await this.dataSource.query('TRUNCATE concepto_cuenta');
    const valores = filas
      .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
      .join(', ');
    await this.dataSource.query(
      `INSERT INTO concepto_cuenta (formulario, codigo, clave) VALUES ${valores}`,
      filas.flat(),
    );
    return filas.length;
  }

  /**
   * Las vistas tributarias también dependen de `balance_magnitud`. Si sólo se
   * refresca la vista financiera, el análisis tributario queda vacío o muestra
   * el ejercicio anterior aunque la importación de balances haya terminado.
   * El orden es obligatorio porque cada vista se deriva de la anterior.
   */
  private async refrescarVistasTributarias(): Promise<void> {
    for (const vista of [
      'utilidad_no_distribuida',
      'riesgo_tributario',
      'riesgo_tributario_anio',
      'perfil_riesgo_tributario',
    ]) {
      await this.dataSource.query(`REFRESH MATERIALIZED VIEW ${vista}`);
    }
  }

  /**
   * Reconstruye magnitudes, cortes sectoriales y percentiles por empresa.
   *
   * Se ejecuta entero o no se ejecuta: entre borrar los percentiles viejos y
   * escribir los nuevos hay minutos, y sin transacción una pantalla abierta en
   * ese hueco mostraría una empresa sin sector en vez de esperar.
   *
   * El refresco de `balance_magnitud` NO va con `CONCURRENTLY`, al revés que el
   * del perfil comercial. Aquí es deliberado: la vista sólo la lee este
   * recálculo —las pantallas leen las dos tablas de resultado—, así que
   * bloquearla no le quita nada a nadie, y `CONCURRENTLY` tarda bastante más.
   */
  async recalcular(): Promise<{
    conceptos: number;
    balances: number;
    empresas: number;
    cortes: number;
    ms: number;
  }> {
    const t0 = Date.now();
    const conceptos = await this.sincronizarConceptos();

    await this.dataSource.query('REFRESH MATERIALIZED VIEW balance_magnitud');
    await this.refrescarVistasTributarias();
    const [{ n: balances }] = await this.dataSource.query(
      'SELECT count(*)::int AS n FROM balance_magnitud',
    );
    this.logger.log(
      `Magnitudes: ${balances} balances traducidos a ${conceptos} conceptos`,
    );

    const percentiles = CORTES.map(
      (p) =>
        `percentile_cont(${p / 100}) WITHIN GROUP (ORDER BY valor) AS p${p}`,
    ).join(',\n               ');

    let cortes = 0;
    let empresas = 0;

    await this.dataSource.transaction(async (m) => {
      // Los dos INSERT ordenan millones de filas. Con el `work_mem` por defecto
      // eso se va a disco y tarda varias veces más; se sube sólo para esta
      // transacción.
      await m.query(`SET LOCAL work_mem = '256MB'`);

      // ------------------------------------------------------ cortes del sector
      //
      // Cada empresa entra en los tres ejes a la vez: su división, su sección y
      // el total nacional. No es redundante — el total es el único punto de
      // apoyo cuando alguien pregunta si un sector entero está mal o si es el
      // país el que está mal.
      await m.query('DELETE FROM indicador_percentil');
      await m.query(
        `
        INSERT INTO indicador_percentil (anio, nivel, sector, indicador, n, p10, p25, p50, p75, p90, promedio)
        WITH largo AS (
          SELECT bm.anio, bm.division, bm.seccion, i.clave, i.valor
            FROM balance_magnitud bm
            CROSS JOIN LATERAL (VALUES
            ${this.lateralIndicadores('bm.magnitudes')}
            ) AS i(clave, valor)
           WHERE i.valor IS NOT NULL
        ),
        ejes AS (
          SELECT l.anio, e.nivel, e.sector, l.clave, l.valor
            FROM largo l
            CROSS JOIN LATERAL (VALUES
              ('division', l.division),
              ('seccion', l.seccion),
              ('total', '*')
            ) AS e(nivel, sector)
           WHERE e.sector IS NOT NULL
        )
        SELECT anio, nivel, sector, clave, count(*)::int,
               ${percentiles},
               avg(valor)
          FROM ejes
         GROUP BY anio, nivel, sector, clave
        `,
      );
      // Contado sobre la tabla y no sobre el resultado del INSERT: un INSERT sin
      // RETURNING no devuelve filas, y leer su longitud daba 0 siempre.
      [{ n: cortes }] = await m.query(
        'SELECT count(*)::int AS n FROM indicador_percentil',
      );

      // --------------------------------------------- percentil de cada empresa
      //
      // El grupo de pares se decide una vez por empresa y año, por el tamaño de
      // su división, y no indicador por indicador: si la liquidez se comparara
      // contra la división y el margen contra la sección, las dos cifras de la
      // misma fila estarían midiendo contra poblaciones distintas sin que se
      // note en pantalla.
      await m.query('DELETE FROM indicador_empresa');
      await m.query(
        `
        INSERT INTO indicador_empresa (anio, expediente, nivel, sector, valores, percentiles)
        WITH tam AS (
          SELECT anio, division, count(*)::int AS n
            FROM balance_magnitud
           WHERE division IS NOT NULL
           GROUP BY anio, division
        ),
        grupo AS (
          SELECT bm.anio, bm.expediente, bm.magnitudes,
                 CASE WHEN coalesce(t.n, 0) >= $1 THEN 'division' ELSE 'seccion' END AS nivel,
                 CASE WHEN coalesce(t.n, 0) >= $1 THEN bm.division ELSE bm.seccion END AS sector
            FROM balance_magnitud bm
            LEFT JOIN tam t ON t.anio = bm.anio AND t.division = bm.division
        ),
        largo AS (
          SELECT g.anio, g.expediente, g.nivel, g.sector, i.clave, i.valor
            FROM grupo g
            CROSS JOIN LATERAL (VALUES
            ${this.lateralIndicadores('g.magnitudes')}
            ) AS i(clave, valor)
           -- Sin sector no hay grupo de pares. Son 84 balances sin rama en todo
           -- el archivo: se quedan fuera de la comparación, no se inventan.
           WHERE g.sector IS NOT NULL AND i.valor IS NOT NULL
        ),
        posicion AS (
          SELECT anio, expediente, nivel, sector, clave, valor,
                 -- Percentil con reparto del empate: las que están por debajo
                 -- más la mitad de las que están exactamente igual.
                 --
                 -- Los empates aquí no son un caso raro: una cuarta parte del
                 -- país declara ROE exactamente 0. Contando "menores o iguales"
                 -- a secas, todas esas empresas se llevarían el tope del empate
                 -- y saldrían en el percentil 48 estando en el cero, con la
                 -- media de percentiles del sector en 56 en vez de en 50.
                 round(
                   100 * (
                     (rank() OVER (PARTITION BY anio, nivel, sector, clave ORDER BY valor) - 1)
                     + count(*) OVER (PARTITION BY anio, nivel, sector, clave, valor) / 2.0
                   ) / count(*) OVER (PARTITION BY anio, nivel, sector, clave)
                 )::int AS percentil
            FROM largo
        )
        SELECT anio, expediente, min(nivel), min(sector),
               jsonb_object_agg(clave, valor),
               jsonb_object_agg(clave, percentil)
          FROM posicion
         GROUP BY anio, expediente
        `,
        [MUESTRA_MINIMA],
      );
      [{ n: empresas }] = await m.query(
        'SELECT count(*)::int AS n FROM indicador_empresa',
      );
    });

    const ms = Date.now() - t0;
    this.logger.log(
      `Percentiles sectoriales: ${cortes} cortes y ${empresas} empresas en ${(ms / 1000).toFixed(1)}s`,
    );
    return { conceptos, balances, empresas, cortes, ms };
  }

  /**
   * Posición sectorial de una compañía, un año por columna.
   *
   * Devuelve el valor del indicador, el percentil que ocupa y los cortes del
   * sector, para que la pantalla pueda decir "1,4 veces, percentil 62, la
   * mediana del sector es 1,1" sin hacer una segunda llamada.
   */
  async sectorial(expediente: string) {
    const [cabecera] = await this.dataSource.query(
      `SELECT ruc, nombre, rama_actividad, descripcion_rama, ciiu
         FROM balance
        WHERE expediente = $1 AND ausente_desde_job IS NULL
        ORDER BY anio DESC
        LIMIT 1`,
      [expediente],
    );
    if (!cabecera) {
      throw new NotFoundException(
        `No hay balances del expediente ${expediente}`,
      );
    }

    const filas = await this.dataSource.query(
      `SELECT ie.anio, ie.nivel, ie.sector, ie.valores, ie.percentiles,
              a.nombre AS sector_nombre,
              (SELECT jsonb_object_agg(p.indicador, jsonb_build_object(
                        'n', p.n, 'p10', p.p10, 'p25', p.p25,
                        'p50', p.p50, 'p75', p.p75, 'p90', p.p90))
                 FROM indicador_percentil p
                WHERE p.anio = ie.anio AND p.nivel = ie.nivel AND p.sector = ie.sector
              ) AS cortes
         FROM indicador_empresa ie
         LEFT JOIN actividad_ciiu a ON a.codigo = ie.sector
        WHERE ie.expediente = $1
        ORDER BY ie.anio`,
      [expediente],
    );

    const anios = filas.map((f: any) => Number(f.anio));
    const num = (v: unknown) =>
      v === null || v === undefined ? null : Number(v);

    return {
      expediente,
      ruc: cabecera.ruc,
      nombre: cabecera.nombre,
      ramaActividad: cabecera.rama_actividad,
      descripcionRama: cabecera.descripcion_rama,
      ciiu: cabecera.ciiu,
      anios,
      /** Contra quién se comparó cada año. Puede cambiar de año a año. */
      sectores: filas.map((f: any) => ({
        anio: Number(f.anio),
        nivel: f.nivel,
        codigo: f.sector,
        nombre: f.sector_nombre,
      })),
      grupos: GRUPOS_INDICADOR,
      indicadores: INDICADORES.map((def) => ({
        clave: def.clave,
        etiqueta: def.etiqueta,
        grupo: def.grupo,
        formato: def.formato,
        mejor: def.mejor,
        valores: filas.map((f: any) => num(f.valores?.[def.clave])),
        percentiles: filas.map((f: any) => num(f.percentiles?.[def.clave])),
        // Un corte por año, del sector que se usó ese año.
        cortes: filas.map((f: any) => {
          const c = f.cortes?.[def.clave];
          if (!c) return null;
          return {
            n: Number(c.n),
            p10: num(c.p10),
            p25: num(c.p25),
            p50: num(c.p50),
            p75: num(c.p75),
            p90: num(c.p90),
          };
        }),
      })),
    };
  }

  /**
   * Cortes de un sector completo, sin mirar a ninguna empresa.
   *
   * Es la misma tabla vista por el otro lado: sirve para responder "cómo está el
   * sector" antes de tener una compañía en la mano.
   */
  async sector(anio: number, codigo: string) {
    const nivel = /^[A-Z][0-9]{2}$/.test(codigo)
      ? 'division'
      : codigo === '*'
        ? 'total'
        : 'seccion';

    const filas = await this.dataSource.query(
      `SELECT indicador, n, p10, p25, p50, p75, p90, promedio
         FROM indicador_percentil
        WHERE anio = $1 AND nivel = $2 AND sector = $3`,
      [anio, nivel, codigo],
    );
    if (filas.length === 0) {
      throw new NotFoundException(
        `No hay percentiles de ${codigo} para ${anio}`,
      );
    }

    const [ciiu] = await this.dataSource.query(
      `SELECT nombre FROM actividad_ciiu WHERE codigo = $1`,
      [codigo],
    );
    const porClave = new Map(filas.map((f: any) => [f.indicador, f]));

    return {
      anio,
      nivel,
      codigo,
      nombre: codigo === '*' ? 'Todas las actividades' : (ciiu?.nombre ?? null),
      grupos: GRUPOS_INDICADOR,
      indicadores: INDICADORES.filter((def) => porClave.has(def.clave)).map(
        (def) => {
          const f = porClave.get(def.clave) as any;
          return {
            clave: def.clave,
            etiqueta: def.etiqueta,
            grupo: def.grupo,
            formato: def.formato,
            mejor: def.mejor,
            n: Number(f.n),
            p10: Number(f.p10),
            p25: Number(f.p25),
            p50: Number(f.p50),
            p75: Number(f.p75),
            p90: Number(f.p90),
            promedio: Number(f.promedio),
          };
        },
      ),
    };
  }
}
