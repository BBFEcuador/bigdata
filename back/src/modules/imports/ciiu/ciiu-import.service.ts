import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { promises as fs } from 'node:fs';
import { ImportJobsService } from '../import-jobs.service';
import { UMBRAL_AUSENCIA } from '../imports.constants';
import { SourceRow, readRows } from '../xlsx/xlsx-row-source';
import { parsearCiiu } from './ciiu-file.parser';
import { ActividadJerarquica, construirJerarquiaCiiu } from './jerarquia-ciiu';

/**
 * Importador del catálogo CIIU.
 *
 * Lee el XLSX con el mismo lector en streaming que el importador de compañías,
 * pero de ahí en adelante sigue el camino ligero del catálogo de cuentas: son
 * ~3.000 filas, así que un único upsert con `unnest` basta y sobra. Sin
 * staging, sin COPY, sin merge por particiones.
 */
@Injectable()
export class CiiuImportService {
  private readonly logger = new Logger(CiiuImportService.name);

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
    const filas: SourceRow[] = [];
    for await (const fila of readRows(ruta)) filas.push(fila);

    const { actividades, rechazos, duplicados } = parsearCiiu(filas);
    if (actividades.length === 0) {
      throw new Error(
        'El archivo no contiene ninguna actividad válida. Se esperaba la hoja del ' +
          'catálogo CIIU con el código en la columna A y el nombre repartido en las ' +
          'columnas B a G.',
      );
    }

    const { actividades: jerarquia, discrepancias } = construirJerarquiaCiiu(actividades);

    // Las discrepancias no invalidan la fila: se cargan igual y quedan
    // registradas para que se puedan revisar contra el archivo original.
    const incidencias = [
      ...rechazos.map((r) => ({
        sourceRowNumber: r.fila,
        motivo: r.motivo,
        raw: r.raw as Record<string, unknown>,
      })),
      ...discrepancias.map((d) => ({
        sourceRowNumber: d.fila,
        columna: 'nivel',
        motivo:
          `nivel_discrepante: el nombre está en la columna de nivel ${d.nivelColumna} ` +
          `pero el código "${d.codigo}" corresponde al nivel ${d.nivelLongitud}`,
        raw: { codigo: d.codigo } as Record<string, unknown>,
      })),
    ];
    if (incidencias.length) await this.jobsService.saveRejects(jobId, incidencias);

    await this.jobsService.reportProgress(
      jobId,
      {
        status: 'merging',
        rowsRead: actividades.length + rechazos.length,
        rowsCopied: jerarquia.length,
        rowsRejected: rechazos.length,
        rowsWarned: discrepancias.length,
        duplicados,
        progressPct: 50,
        avisos: discrepancias.length
          ? `${discrepancias.length} fila(s) con el nombre en una columna de nivel que no ` +
            `corresponde a la longitud del código. Se aplicó el nivel del código.`
          : null,
      },
      true,
    );

    const { missing, vivas } = await this.contarAusentes(jerarquia.map((x) => x.codigo));
    if (modo === 'snapshot_completo' && vivas > 0 && missing / vivas > UMBRAL_AUSENCIA) {
      throw new Error(
        `El archivo dejaría fuera ${missing} de ${vivas} actividades vigentes ` +
          `(${((missing / vivas) * 100).toFixed(1)}%). Parece un archivo incompleto; ` +
          `no se aplicó ningún cambio. Vuelve a subirlo como carga parcial si es intencional.`,
      );
    }

    const { insertadas, actualizadas } = await this.upsert(jobId, jerarquia);
    const marcadas =
      modo === 'snapshot_completo'
        ? await this.marcarAusentes(jobId, jerarquia.map((x) => x.codigo))
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
        `${jerarquia.length - insertadas - actualizadas} sin cambios, ${marcadas} ausentes, ` +
        `${rechazos.length} rechazadas, ${discrepancias.length} discrepancias de nivel`,
    );
  }

  private async upsert(
    jobId: string,
    items: ActividadJerarquica[],
  ): Promise<{ insertadas: number; actualizadas: number }> {
    const filas = await this.dataSource.query(
      `
      WITH entrada AS (
        SELECT * FROM unnest(
          $2::text[], $3::text[], $4::text[], $5::text[], $6::smallint[],
          $7::text[], $8::boolean[], $9::smallint[], $10::text[], $11::uuid[]
        ) AS t(codigo, nombre, codigo_supercias, codigo_padre, nivel,
               nivel_nombre, es_hoja, longitud, aplicacion, row_hash)
      ),
      merged AS (
        INSERT INTO actividad_ciiu (
          codigo, nombre, codigo_supercias, codigo_padre, nivel, nivel_nombre,
          es_hoja, longitud, aplicacion,
          row_hash, primer_job_id, ultimo_job_id, ausente_desde_job
        )
        SELECT e.codigo, e.nombre, e.codigo_supercias, e.codigo_padre, e.nivel,
               e.nivel_nombre, e.es_hoja, e.longitud, e.aplicacion,
               e.row_hash, $1, $1, NULL
        FROM entrada e
        ON CONFLICT (codigo) DO UPDATE SET
          nombre = EXCLUDED.nombre,
          codigo_supercias = EXCLUDED.codigo_supercias,
          codigo_padre = EXCLUDED.codigo_padre,
          nivel = EXCLUDED.nivel,
          nivel_nombre = EXCLUDED.nivel_nombre,
          es_hoja = EXCLUDED.es_hoja,
          longitud = EXCLUDED.longitud,
          aplicacion = EXCLUDED.aplicacion,
          row_hash = EXCLUDED.row_hash,
          ultimo_job_id = EXCLUDED.ultimo_job_id,
          ausente_desde_job = NULL,
          updated_at = now()
        WHERE actividad_ciiu.row_hash IS DISTINCT FROM EXCLUDED.row_hash
           OR actividad_ciiu.ausente_desde_job IS NOT NULL
        RETURNING (xmax = 0) AS insertada
      )
      SELECT
        count(*) FILTER (WHERE insertada)     AS insertadas,
        count(*) FILTER (WHERE NOT insertada) AS actualizadas
      FROM merged
      `,
      [
        jobId,
        items.map((x) => x.codigo),
        items.map((x) => x.nombre),
        items.map((x) => x.codigoSupercias),
        items.map((x) => x.codigoPadre),
        items.map((x) => x.nivel),
        items.map((x) => x.nivelNombre),
        items.map((x) => x.esHoja),
        items.map((x) => x.longitud),
        items.map((x) => x.aplicacion),
        items.map((x) => x.rowHash),
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
       FROM actividad_ciiu
       WHERE ausente_desde_job IS NULL`,
      [codigos],
    );
    return { missing: Number(r?.missing ?? 0), vivas: Number(r?.vivas ?? 0) };
  }

  private async marcarAusentes(jobId: string, codigos: string[]): Promise<number> {
    const res = await this.dataSource.query(
      `UPDATE actividad_ciiu
       SET ausente_desde_job = $1, updated_at = now()
       WHERE ausente_desde_job IS NULL
         AND codigo <> ALL($2::text[])`,
      [jobId, codigos],
    );
    return Array.isArray(res) && typeof res[1] === 'number' ? res[1] : 0;
  }
}
