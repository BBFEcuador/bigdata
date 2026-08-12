import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { promises as fs } from 'node:fs';
import { ImportJobsService } from '../import-jobs.service';
import { UMBRAL_AUSENCIA } from '../imports.constants';
import { decodificarTexto } from '../../../common/text/encoding';
import { parsearCatalogo } from './catalogo-file.parser';
import { CuentaJerarquica, construirJerarquia } from './jerarquia';

/**
 * Importador del catálogo de cuentas.
 *
 * A diferencia del de compañías, aquí NO hay streaming, ni tabla de staging, ni
 * COPY, ni merge por particiones: el archivo son unas 600 líneas y 25 KB. Toda
 * esa maquinaria existe para que un millón de filas quepa en memoria acotada;
 * aplicarla a este caso sólo añadiría piezas que pueden fallar.
 *
 * Lo que sí se conserva es el ciclo de vida del job, para que la experiencia de
 * uso (202 + jobId, progreso, contadores, rechazos, idempotencia) sea idéntica.
 */
@Injectable()
export class CatalogoImportService {
  private readonly logger = new Logger(CatalogoImportService.name);

  constructor(
    private readonly jobsService: ImportJobsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  enqueue(jobId: string): void {
    void this.run(jobId).catch((err) => {
      this.logger.error(`Job ${jobId} falló de forma inesperada: ${err?.message}`, err?.stack);
    });
  }

  private async run(jobId: string): Promise<void> {
    const job = await this.jobsService.findOne(jobId);
    if (!job) return;

    const t0 = Date.now();

    try {
      await this.jobsService.update(jobId, { status: 'parsing', startedAt: new Date() });

      // Lock consultivo de sesión: marca el job como vivo para que el barrido de
      // arranque de otra instancia no lo dé por colgado.
      const clave = `import_job:${jobId}`;
      const [{ ok }] = await this.dataSource.query(
        'SELECT pg_try_advisory_lock(hashtext($1)::bigint) AS ok',
        [clave],
      );
      if (!ok) throw new Error('Otro proceso ya está ejecutando este job.');

      try {
        await this.procesar(jobId, job.storedPath, job.modo, t0);
      } finally {
        await this.dataSource
          .query('SELECT pg_advisory_unlock(hashtext($1)::bigint)', [clave])
          .catch(() => undefined);
      }
    } catch (err) {
      const mensaje = (err as Error)?.message ?? String(err);
      this.logger.error(`Job ${jobId} falló: ${mensaje}`);
      await this.jobsService
        .update(jobId, { status: 'failed', errorMessage: mensaje, finishedAt: new Date() })
        .catch(() => undefined);
    } finally {
      this.jobsService.forgetProgress(jobId);
      await fs.unlink(job.storedPath).catch(() => undefined);
    }
  }

  private async procesar(jobId: string, ruta: string, modo: string, t0: number): Promise<void> {
    // 25 KB: leerlo entero es lo correcto aquí.
    const buffer = await fs.readFile(ruta);
    const { texto, encoding } = decodificarTexto(buffer);

    // El encoding detectado se registra: si algún día llega un archivo en otra
    // codificación, se ve aquí en vez de descubrirlo por nombres corruptos.
    this.logger.log(`Job ${jobId}: archivo decodificado como ${encoding}`);

    const { cuentas, rechazos, duplicados } = parsearCatalogo(texto);
    if (cuentas.length === 0) {
      throw new Error(
        'El archivo no contiene ninguna cuenta válida. ' +
          'Se esperaba un texto con "código<TAB>nombre" por línea.',
      );
    }

    if (rechazos.length) {
      await this.jobsService.saveRejects(
        jobId,
        rechazos.map((r) => ({
          sourceRowNumber: r.linea,
          motivo: r.motivo,
          raw: { linea: r.raw },
        })),
      );
    }

    const jerarquia = construirJerarquia(cuentas);

    await this.jobsService.reportProgress(
      jobId,
      {
        status: 'merging',
        rowsRead: cuentas.length + rechazos.length,
        rowsCopied: cuentas.length,
        rowsRejected: rechazos.length,
        duplicados,
        progressPct: 50,
        avisos: encoding === 'latin1' ? 'Archivo leído como Latin-1 (no era UTF-8).' : null,
      },
      true,
    );

    // Salvaguarda contra un archivo truncado subido como snapshot completo.
    const { missing, vivas } = await this.contarAusentes(jerarquia.map((c) => c.codigo));
    if (modo === 'snapshot_completo' && vivas > 0 && missing / vivas > UMBRAL_AUSENCIA) {
      throw new Error(
        `El archivo dejaría fuera ${missing} de ${vivas} cuentas vigentes ` +
          `(${((missing / vivas) * 100).toFixed(1)}%). Parece un archivo incompleto; ` +
          `no se aplicó ningún cambio. Vuelve a subirlo como carga parcial si es intencional.`,
      );
    }

    const { insertadas, actualizadas } = await this.upsert(jobId, jerarquia);

    const marcadas =
      modo === 'snapshot_completo'
        ? await this.marcarAusentes(jobId, jerarquia.map((c) => c.codigo))
        : 0;

    await this.jobsService.update(jobId, {
      status: 'completed',
      progressPct: 100,
      rowsInserted: insertadas,
      rowsUpdated: actualizadas,
      rowsUnchanged: jerarquia.length - insertadas - actualizadas,
      rowsMissing: marcadas,
      finishedAt: new Date(),
    });

    this.logger.log(
      `Job ${jobId} completado en ${((Date.now() - t0) / 1000).toFixed(1)}s: ` +
        `${insertadas} nuevas, ${actualizadas} actualizadas, ` +
        `${jerarquia.length - insertadas - actualizadas} sin cambios, ` +
        `${marcadas} ausentes, ${rechazos.length} rechazadas`,
    );
  }

  /**
   * Un único INSERT con arrays. `unnest` convierte las columnas paralelas en
   * filas, así que las ~600 cuentas viajan en una sola sentencia y un solo
   * viaje de red, sin tabla intermedia.
   *
   * El `WHERE` del DO UPDATE es lo que hace la reimportación gratuita: si el
   * hash no cambió no se escribe la fila. La segunda condición resucita una
   * cuenta que había desaparecido y vuelve con datos idénticos — sin ella, el
   * guard del hash la saltaría y quedaría marcada como ausente para siempre.
   */
  private async upsert(
    jobId: string,
    cuentas: CuentaJerarquica[],
  ): Promise<{ insertadas: number; actualizadas: number }> {
    const filas = await this.dataSource.query(
      `
      WITH entrada AS (
        SELECT * FROM unnest(
          $2::text[], $3::text[], $4::text[], $5::smallint[], $6::boolean[], $7::smallint[], $8::uuid[]
        ) AS t(codigo, nombre, codigo_padre, nivel, es_hoja, longitud, row_hash)
      ),
      merged AS (
        INSERT INTO categoria_cuenta (
          codigo, nombre, codigo_padre, nivel, es_hoja, longitud,
          row_hash, primer_job_id, ultimo_job_id, ausente_desde_job
        )
        SELECT e.codigo, e.nombre, e.codigo_padre, e.nivel, e.es_hoja, e.longitud,
               e.row_hash, $1, $1, NULL
        FROM entrada e
        ON CONFLICT (codigo) DO UPDATE SET
          nombre = EXCLUDED.nombre,
          codigo_padre = EXCLUDED.codigo_padre,
          nivel = EXCLUDED.nivel,
          es_hoja = EXCLUDED.es_hoja,
          longitud = EXCLUDED.longitud,
          row_hash = EXCLUDED.row_hash,
          ultimo_job_id = EXCLUDED.ultimo_job_id,
          ausente_desde_job = NULL,
          updated_at = now()
        WHERE categoria_cuenta.row_hash IS DISTINCT FROM EXCLUDED.row_hash
           OR categoria_cuenta.ausente_desde_job IS NOT NULL
        RETURNING (xmax = 0) AS insertada
      )
      SELECT
        count(*) FILTER (WHERE insertada)     AS insertadas,
        count(*) FILTER (WHERE NOT insertada) AS actualizadas
      FROM merged
      `,
      [
        jobId,
        cuentas.map((c) => c.codigo),
        cuentas.map((c) => c.nombre),
        cuentas.map((c) => c.codigoPadre),
        cuentas.map((c) => c.nivel),
        cuentas.map((c) => c.esHoja),
        cuentas.map((c) => c.longitud),
        cuentas.map((c) => c.rowHash),
      ],
    );

    return {
      insertadas: Number(filas[0]?.insertadas ?? 0),
      actualizadas: Number(filas[0]?.actualizadas ?? 0),
    };
  }

  private async contarAusentes(codigos: string[]): Promise<{ missing: number; vivas: number }> {
    const [r] = await this.dataSource.query(
      `SELECT
         count(*) FILTER (WHERE codigo <> ALL($1::text[]))::bigint AS missing,
         count(*)::bigint AS vivas
       FROM categoria_cuenta
       WHERE ausente_desde_job IS NULL`,
      [codigos],
    );
    return { missing: Number(r?.missing ?? 0), vivas: Number(r?.vivas ?? 0) };
  }

  private async marcarAusentes(jobId: string, codigos: string[]): Promise<number> {
    const res = await this.dataSource.query(
      `UPDATE categoria_cuenta
       SET ausente_desde_job = $1, updated_at = now()
       WHERE ausente_desde_job IS NULL
         AND codigo <> ALL($2::text[])`,
      [jobId, codigos],
    );
    // node-postgres devuelve [filas, rowCount] en los UPDATE vía query().
    return Array.isArray(res) && typeof res[1] === 'number' ? res[1] : 0;
  }
}
