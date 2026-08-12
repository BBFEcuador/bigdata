import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { promises as fs } from 'node:fs';
import { ImportJobsService } from '../import-jobs.service';
import { readSheets } from '../xlsx/xlsx-row-source';
import {
  FilaDigital,
  FilaExportador,
  ResultadoParseoCatastros,
  parsearCatastros,
} from './catastros-file.parser';
import {
  CATASTRO_SERVICIOS_DIGITALES,
  COLUMNA_ANIOS,
  ETIQUETA_CATASTRO,
  TipoCatastro,
} from './catastros.constants';

const LOTE_UPSERT = 5_000;

/** Las tres poblaciones a las que puede pertenecer un RUC. */
const TABLAS_TITULARES = ['companias', 'persona_natural', 'sociedad_no_supervisada'];

/**
 * Importador de los catastros del SRI.
 *
 * Un solo servicio para los cuatro archivos porque el tipo se detecta del
 * contenido, no se pide: el usuario descarga tres ficheros con nombres casi
 * iguales y equivocarse mezclaría dos beneficios tributarios distintos.
 *
 * ## El snapshot es por (catastro, año), no por archivo
 *
 * Cada hoja es la lista completa de un ejercicio, y el archivo trae varios.
 * Marcar como ausente "todo lo que no venga en el archivo" borraría los años
 * que ese archivo no cubre —el de la rebaja de renta llega hasta 2024 y el de
 * IVA hasta 2026—, así que la ausencia se calcula dentro de los años que el
 * propio archivo trae.
 */
@Injectable()
export class CatastrosImportService {
  private readonly logger = new Logger(CatastrosImportService.name);

  constructor(
    private readonly jobsService: ImportJobsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  enqueue(jobId: string, tipoForzado?: TipoCatastro): void {
    void this.run(jobId, tipoForzado).catch((err) => {
      this.logger.error(`Job ${jobId} falló de forma inesperada: ${err?.message}`, err?.stack);
    });
  }

  private async run(jobId: string, tipoForzado?: TipoCatastro): Promise<void> {
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
        await this.procesar(jobId, job.storedPath, job.modo, tipoForzado, t0);
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

  private async procesar(
    jobId: string,
    ruta: string,
    modo: string,
    tipoForzado: TipoCatastro | undefined,
    t0: number,
  ): Promise<void> {
    const hojas = await readSheets(ruta);
    const res = parsearCatastros(hojas, tipoForzado);

    const incidencias = [...res.rechazos, ...res.avisos].map((i) => ({
      sourceRowNumber: i.fila,
      columna: i.columna ?? null,
      motivo: i.motivo,
      raw: i.raw,
    }));
    if (incidencias.length) await this.jobsService.saveRejects(jobId, incidencias);

    const total = res.exportadores.length + res.digitales.length;
    await this.jobsService.reportProgress(
      jobId,
      {
        status: 'merging',
        rowsRead: total + res.rechazos.length,
        rowsCopied: total,
        rowsRejected: res.rechazos.length,
        rowsWarned: res.avisos.length,
        duplicados: res.duplicados,
        progressPct: 40,
      },
      true,
    );

    const { insertadas, actualizadas, marcadas } =
      res.tipo === CATASTRO_SERVICIOS_DIGITALES
        ? await this.cargarDigitales(jobId, res.digitales, modo)
        : await this.cargarExportadores(jobId, res, modo);

    await this.jobsService.reportProgress(jobId, { progressPct: 85 }, true);

    const enriquecidos =
      res.tipo === CATASTRO_SERVICIOS_DIGITALES ? {} : await this.propagarATitulares(jobId, res.tipo);

    await this.jobsService.update(jobId, {
      status: 'completed',
      progressPct: 100,
      rowsInserted: insertadas,
      rowsUpdated: actualizadas,
      rowsUnchanged: total - insertadas - actualizadas,
      rowsMissing: marcadas,
      avisos: this.resumen(res, enriquecidos),
      finishedAt: new Date(),
    });

    this.logger.log(
      `Job ${jobId} (${res.tipo}) completado en ${((Date.now() - t0) / 1000).toFixed(1)}s: ` +
        `${insertadas} nuevas, ${actualizadas} actualizadas, ${marcadas} ausentes, ` +
        `${res.rechazos.length} rechazadas.`,
    );
  }

  private resumen(res: ResultadoParseoCatastros, enriquecidos: Record<string, number>): string {
    const partes = [ETIQUETA_CATASTRO[res.tipo] + '.'];
    if (res.anios.length) partes.push(`Ejercicios cargados: ${res.anios.join(', ')}.`);
    if (Object.keys(enriquecidos).length) {
      partes.push(
        `Enlazados: ${enriquecidos.companias ?? 0} compañías, ` +
          `${enriquecidos.persona_natural ?? 0} personas naturales, ` +
          `${enriquecidos.sociedad_no_supervisada ?? 0} sociedades no supervisadas.`,
      );
    }
    if (res.notas.length) partes.push(res.notas.join(' · '));
    return partes.join(' ');
  }

  // --------------------------------------------------------- exportadores

  private async cargarExportadores(
    jobId: string,
    res: ResultadoParseoCatastros,
    modo: string,
  ): Promise<{ insertadas: number; actualizadas: number; marcadas: number }> {
    let insertadas = 0;
    let actualizadas = 0;

    for (let i = 0; i < res.exportadores.length; i += LOTE_UPSERT) {
      const r = await this.upsertExportadores(jobId, res.exportadores.slice(i, i + LOTE_UPSERT));
      insertadas += r.insertadas;
      actualizadas += r.actualizadas;
      await this.jobsService.reportProgress(jobId, {
        progressPct: 40 + Math.round((40 * (i + LOTE_UPSERT)) / res.exportadores.length),
      });
    }

    // La ausencia se calcula SÓLO dentro de los años que trae el archivo: una
    // carga del catastro 2020-2024 no puede dar por desaparecido a nadie de 2026.
    const marcadas =
      modo === 'snapshot_completo'
        ? await this.marcarAusentesExportadores(jobId, res)
        : 0;

    return { insertadas, actualizadas, marcadas };
  }

  private async upsertExportadores(
    jobId: string,
    items: FilaExportador[],
  ): Promise<{ insertadas: number; actualizadas: number }> {
    const filas = await this.dataSource.query(
      `
      WITH entrada AS (
        SELECT * FROM unnest(
          $2::text[], $3::smallint[], $4::text[], $5::text[], $6::text[], $7::text[],
          $8::text[], $9::text[], $10::boolean[], $11::smallint[], $12::uuid[]
        ) AS t(catastro, anio, ruc, razon_social, jurisdiccion, provincia,
               tipo_contribuyente, clase_contribuyente, obligado_contabilidad,
               anio_fiscal_analizado, row_hash)
      ),
      merged AS (
        INSERT INTO catastro_sri (
          catastro, anio, ruc, razon_social, jurisdiccion, provincia,
          tipo_contribuyente, clase_contribuyente, obligado_contabilidad,
          anio_fiscal_analizado, row_hash, primer_job_id, ultimo_job_id, ausente_desde_job
        )
        SELECT e.catastro, e.anio, e.ruc, e.razon_social, e.jurisdiccion, e.provincia,
               e.tipo_contribuyente, e.clase_contribuyente, e.obligado_contabilidad,
               e.anio_fiscal_analizado, e.row_hash, $1, $1, NULL
        FROM entrada e
        ON CONFLICT (catastro, anio, ruc) DO UPDATE SET
          razon_social = EXCLUDED.razon_social,
          jurisdiccion = EXCLUDED.jurisdiccion,
          provincia = EXCLUDED.provincia,
          tipo_contribuyente = EXCLUDED.tipo_contribuyente,
          clase_contribuyente = EXCLUDED.clase_contribuyente,
          obligado_contabilidad = EXCLUDED.obligado_contabilidad,
          anio_fiscal_analizado = EXCLUDED.anio_fiscal_analizado,
          row_hash = EXCLUDED.row_hash,
          ultimo_job_id = EXCLUDED.ultimo_job_id,
          ausente_desde_job = NULL,
          updated_at = now()
        WHERE catastro_sri.row_hash IS DISTINCT FROM EXCLUDED.row_hash
           OR catastro_sri.ausente_desde_job IS NOT NULL
        RETURNING (xmax = 0) AS insertada
      )
      SELECT
        count(*) FILTER (WHERE insertada)     AS insertadas,
        count(*) FILTER (WHERE NOT insertada) AS actualizadas
      FROM merged
      `,
      [
        jobId,
        items.map((x) => x.catastro),
        items.map((x) => x.anio),
        items.map((x) => x.ruc),
        items.map((x) => x.razonSocial),
        items.map((x) => x.jurisdiccion),
        items.map((x) => x.provincia),
        items.map((x) => x.tipoContribuyente),
        items.map((x) => x.claseContribuyente),
        items.map((x) => x.obligadoContabilidad),
        items.map((x) => x.anioFiscalAnalizado),
        items.map((x) => x.rowHash),
      ],
    );

    return {
      insertadas: Number(filas[0]?.insertadas ?? 0),
      actualizadas: Number(filas[0]?.actualizadas ?? 0),
    };
  }

  private async marcarAusentesExportadores(
    jobId: string,
    res: ResultadoParseoCatastros,
  ): Promise<number> {
    const claves = res.exportadores.map((x) => `${x.anio}|${x.ruc}`);
    const r = await this.dataSource.query(
      `UPDATE catastro_sri
       SET ausente_desde_job = $1, updated_at = now()
       WHERE catastro = $2
         AND anio = ANY($3::smallint[])
         AND ausente_desde_job IS NULL
         AND (anio::text || '|' || ruc) <> ALL($4::text[])`,
      [jobId, res.tipo, res.anios, claves],
    );
    return Array.isArray(r) && typeof r[1] === 'number' ? r[1] : 0;
  }

  /**
   * Materializa en los titulares el array de años en que cada RUC estuvo en el
   * catastro.
   *
   * Un array y no un booleano: "exportó de 2020 a 2022 y dejó de hacerlo" es una
   * señal comercial distinta de "no exportó nunca", y un booleano las confunde.
   */
  private async propagarATitulares(
    jobId: string,
    tipo: TipoCatastro,
  ): Promise<Record<string, number>> {
    const columna = COLUMNA_ANIOS[tipo];
    if (!columna) return {};
    const out: Record<string, number> = {};

    for (const tabla of TABLAS_TITULARES) {
      // Igual que en el padrón del SRI: un RUC que apunta a dos expedientes no
      // se enlaza con ninguno, porque elegir uno sería inventar.
      const filtroAmbiguos =
        tabla === 'companias'
          ? `AND (SELECT count(*) FROM companias c2 WHERE c2.ruc = a.ruc) = 1`
          : '';

      const res = await this.dataSource.query(
        `
        UPDATE ${tabla} d SET
          ${columna} = a.anios,
          catastros_job_id = $1,
          updated_at = now()
        FROM (
          SELECT ruc, array_agg(DISTINCT anio ORDER BY anio) AS anios
          FROM catastro_sri
          WHERE catastro = $2 AND ausente_desde_job IS NULL
          GROUP BY ruc
        ) a
        WHERE d.ruc = a.ruc
          ${filtroAmbiguos}
          AND d.${columna} IS DISTINCT FROM a.anios
        `,
        [jobId, tipo],
      );
      out[tabla] = Array.isArray(res) && typeof res[1] === 'number' ? res[1] : 0;

      // Y se limpia el que dejó de estar: si no, un RUC que salió del catastro
      // seguiría marcado como exportador para siempre.
      await this.dataSource.query(
        `
        UPDATE ${tabla} d SET ${columna} = NULL, updated_at = now()
        WHERE d.${columna} IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM catastro_sri cs
            WHERE cs.ruc = d.ruc AND cs.catastro = $1 AND cs.ausente_desde_job IS NULL
          )
        `,
        [tipo],
      );
    }

    return out;
  }

  // ---------------------------------------------------- servicios digitales

  private async cargarDigitales(
    jobId: string,
    items: FilaDigital[],
    modo: string,
  ): Promise<{ insertadas: number; actualizadas: number; marcadas: number }> {
    const filas = await this.dataSource.query(
      `
      WITH entrada AS (
        SELECT * FROM unnest(
          $2::text[], $3::text[], $4::text[], $5::text[], $6::boolean[], $7::boolean[],
          $8::date[], $9::date[], $10::uuid[]
        ) AS t(proveedor, descripcion, referencia, marca_servicios_comision,
               domiciliado_o_ep, registrado_sri, fecha_registro, fecha_fin_registro, row_hash)
      ),
      merged AS (
        INSERT INTO catastro_servicio_digital (
          proveedor, descripcion, referencia, marca_servicios_comision,
          domiciliado_o_ep, registrado_sri, fecha_registro, fecha_fin_registro,
          row_hash, primer_job_id, ultimo_job_id, ausente_desde_job
        )
        SELECT e.proveedor, e.descripcion, e.referencia, e.marca_servicios_comision,
               e.domiciliado_o_ep, e.registrado_sri, e.fecha_registro, e.fecha_fin_registro,
               e.row_hash, $1, $1, NULL
        FROM entrada e
        ON CONFLICT (proveedor) DO UPDATE SET
          descripcion = EXCLUDED.descripcion,
          referencia = EXCLUDED.referencia,
          marca_servicios_comision = EXCLUDED.marca_servicios_comision,
          domiciliado_o_ep = EXCLUDED.domiciliado_o_ep,
          registrado_sri = EXCLUDED.registrado_sri,
          fecha_registro = EXCLUDED.fecha_registro,
          fecha_fin_registro = EXCLUDED.fecha_fin_registro,
          row_hash = EXCLUDED.row_hash,
          ultimo_job_id = EXCLUDED.ultimo_job_id,
          ausente_desde_job = NULL,
          updated_at = now()
        WHERE catastro_servicio_digital.row_hash IS DISTINCT FROM EXCLUDED.row_hash
           OR catastro_servicio_digital.ausente_desde_job IS NOT NULL
        RETURNING (xmax = 0) AS insertada
      )
      SELECT
        count(*) FILTER (WHERE insertada)     AS insertadas,
        count(*) FILTER (WHERE NOT insertada) AS actualizadas
      FROM merged
      `,
      [
        jobId,
        items.map((x) => x.proveedor),
        items.map((x) => x.descripcion),
        items.map((x) => x.referencia),
        items.map((x) => x.marcaServiciosComision),
        items.map((x) => x.domiciliadoOEp),
        items.map((x) => x.registradoSri),
        items.map((x) => x.fechaRegistro),
        items.map((x) => x.fechaFinRegistro),
        items.map((x) => x.rowHash),
      ],
    );

    let marcadas = 0;
    if (modo === 'snapshot_completo') {
      const r = await this.dataSource.query(
        `UPDATE catastro_servicio_digital
         SET ausente_desde_job = $1, updated_at = now()
         WHERE ausente_desde_job IS NULL AND proveedor <> ALL($2::text[])`,
        [jobId, items.map((x) => x.proveedor)],
      );
      marcadas = Array.isArray(r) && typeof r[1] === 'number' ? r[1] : 0;
    }

    return {
      insertadas: Number(filas[0]?.insertadas ?? 0),
      actualizadas: Number(filas[0]?.actualizadas ?? 0),
      marcadas,
    };
  }
}
