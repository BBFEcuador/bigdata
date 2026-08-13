import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { promises as fs } from 'node:fs';
import { ImportJobsService } from '../import-jobs.service';
import { UMBRAL_AUSENCIA } from '../imports.constants';
import { SourceRow, readRows } from '../xlsx/xlsx-row-source';
import { RegistroTurismo, parsearTurismo } from './turismo-file.parser';

/** Filas por sentencia de upsert: acota el tamaño de los arrays del `unnest`. */
const LOTE_UPSERT = 5_000;

/**
 * Importador del Catastro Nacional de Turismo.
 *
 * Sigue el camino ligero del catálogo CIIU —leer el XLSX en streaming y hacer
 * un upsert con `unnest`, sin staging ni COPY— porque son ~35.000 filas.
 *
 * Lo que no tiene ningún otro importador es el último paso: el catastro reparte
 * sus RUC entre las TRES poblaciones del proyecto (5.323 compañías, 24.083
 * personas naturales y 452 sociedades no supervisadas), así que el
 * enriquecimiento se propaga a las tres tablas y no sólo a `companias`.
 */
@Injectable()
export class TurismoImportService {
  private readonly logger = new Logger(TurismoImportService.name);

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

  private async run(jobId: string): Promise<void> {
    const job = await this.jobsService.findOne(jobId);
    if (!job) return;

    const t0 = Date.now();

    try {
      await this.jobsService.update(jobId, {
        status: 'parsing',
        startedAt: new Date(),
      });

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
        .update(jobId, {
          status: 'failed',
          errorMessage: mensaje,
          finishedAt: new Date(),
        })
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
    t0: number,
  ): Promise<void> {
    const filas: SourceRow[] = [];
    for await (const fila of readRows(ruta)) filas.push(fila);

    const { registros, rechazos, avisos, duplicados } = parsearTurismo(filas);
    if (registros.length === 0) {
      throw new Error(
        'El archivo no contiene ningún registro turístico válido.',
      );
    }

    const incidencias = [...rechazos, ...avisos].map((i) => ({
      sourceRowNumber: i.fila,
      columna: i.columna ?? null,
      motivo: i.motivo,
      raw: i.raw,
    }));
    if (incidencias.length)
      await this.jobsService.saveRejects(jobId, incidencias);

    await this.jobsService.reportProgress(
      jobId,
      {
        status: 'merging',
        rowsRead: registros.length + rechazos.length,
        rowsCopied: registros.length,
        rowsRejected: rechazos.length,
        rowsWarned: avisos.length,
        duplicados,
        progressPct: 40,
      },
      true,
    );

    const claves = registros.map((r) => r.numeroRegistro);
    const { missing, vivos } = await this.contarAusentes(claves);
    if (
      modo === 'snapshot_completo' &&
      vivos > 0 &&
      missing / vivos > UMBRAL_AUSENCIA
    ) {
      throw new Error(
        `El archivo dejaría fuera ${missing} de ${vivos} registros vigentes ` +
          `(${((missing / vivos) * 100).toFixed(1)}%). Parece un archivo incompleto; ` +
          `no se aplicó ningún cambio. Vuelve a subirlo como carga parcial si es intencional.`,
      );
    }

    let insertadas = 0;
    let actualizadas = 0;
    for (let i = 0; i < registros.length; i += LOTE_UPSERT) {
      const r = await this.upsert(jobId, registros.slice(i, i + LOTE_UPSERT));
      insertadas += r.insertadas;
      actualizadas += r.actualizadas;
      await this.jobsService.reportProgress(jobId, {
        progressPct:
          40 + Math.round((40 * (i + LOTE_UPSERT)) / registros.length),
      });
    }

    const marcadas =
      modo === 'snapshot_completo'
        ? await this.marcarAusentes(jobId, claves)
        : 0;

    await this.jobsService.reportProgress(jobId, { progressPct: 85 }, true);
    await this.clasificarTitulares();
    const enriquecidos = await this.propagarATitulares(jobId);

    const ambiguos = await this.rucsAmbiguos();
    await this.jobsService.update(jobId, {
      status: 'completed',
      progressPct: 100,
      rowsInserted: insertadas,
      rowsUpdated: actualizadas,
      rowsUnchanged: registros.length - insertadas - actualizadas,
      rowsMissing: marcadas,
      avisos: this.resumenAvisos(enriquecidos, ambiguos),
      finishedAt: new Date(),
    });

    this.logger.log(
      `Job ${jobId} completado en ${((Date.now() - t0) / 1000).toFixed(1)}s: ` +
        `${insertadas} nuevos, ${actualizadas} actualizados, ` +
        `${registros.length - insertadas - actualizadas} sin cambios, ${marcadas} ausentes, ` +
        `${rechazos.length} rechazados. Enriquecidos: ` +
        `${enriquecidos.companias} compañías, ${enriquecidos.persona_natural} personas, ` +
        `${enriquecidos.sociedad_no_supervisada} sociedades no supervisadas.`,
    );
  }

  private resumenAvisos(
    enriquecidos: Record<string, number>,
    ambiguos: number,
  ): string | null {
    const partes = [
      `Enlazados: ${enriquecidos.companias} compañías, ` +
        `${enriquecidos.persona_natural} personas naturales, ` +
        `${enriquecidos.sociedad_no_supervisada} sociedades no supervisadas.`,
    ];
    if (ambiguos > 0) {
      partes.push(
        `${ambiguos} RUC del catastro apuntan a más de un expediente en companias y no se ` +
          `enlazaron: elegir uno sería inventar.`,
      );
    }
    return partes.join(' ');
  }

  private async upsert(
    jobId: string,
    items: RegistroTurismo[],
  ): Promise<{ insertadas: number; actualizadas: number }> {
    const filas = await this.dataSource.query(
      `
      WITH entrada AS (
        SELECT * FROM unnest(
          $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::date[], $8::text[],
          $9::text[], $10::text[], $11::text[], $12::text[], $13::text[], $14::text[],
          $15::text[], $16::text[], $17::text[], $18::text[], $19::text[], $20::text[],
          $21::text[], $22::text[], $23::text[], $24::text[], $25::uuid[]
        ) AS t(numero_registro, ruc, codigo_establecimiento, codigo_establecimiento_raw,
               nombre_comercial, fecha_registro, fecha_registro_raw, actividad, clasificacion,
               categoria, categoria_norm, razon_social_propietario, representante_legal,
               provincia, canton, parroquia, tipo_parroquia, direccion, referencia_direccion,
               telefono, correo, sitio_web, estado_registro, row_hash)
      ),
      merged AS (
        INSERT INTO turismo_establecimiento (
          numero_registro, ruc, codigo_establecimiento, codigo_establecimiento_raw,
          nombre_comercial, fecha_registro, fecha_registro_raw, actividad, clasificacion,
          categoria, categoria_norm, razon_social_propietario, representante_legal,
          provincia, canton, parroquia, tipo_parroquia, direccion, referencia_direccion,
          telefono, correo, sitio_web, estado_registro,
          row_hash, primer_job_id, ultimo_job_id, ausente_desde_job
        )
        SELECT e.numero_registro, e.ruc, e.codigo_establecimiento, e.codigo_establecimiento_raw,
               e.nombre_comercial, e.fecha_registro, e.fecha_registro_raw, e.actividad,
               e.clasificacion, e.categoria, e.categoria_norm, e.razon_social_propietario,
               e.representante_legal, e.provincia, e.canton, e.parroquia, e.tipo_parroquia,
               e.direccion, e.referencia_direccion, e.telefono, e.correo, e.sitio_web,
               e.estado_registro, e.row_hash, $1, $1, NULL
        FROM entrada e
        ON CONFLICT (numero_registro) DO UPDATE SET
          ruc = EXCLUDED.ruc,
          codigo_establecimiento = EXCLUDED.codigo_establecimiento,
          codigo_establecimiento_raw = EXCLUDED.codigo_establecimiento_raw,
          nombre_comercial = EXCLUDED.nombre_comercial,
          fecha_registro = EXCLUDED.fecha_registro,
          fecha_registro_raw = EXCLUDED.fecha_registro_raw,
          actividad = EXCLUDED.actividad,
          clasificacion = EXCLUDED.clasificacion,
          categoria = EXCLUDED.categoria,
          categoria_norm = EXCLUDED.categoria_norm,
          razon_social_propietario = EXCLUDED.razon_social_propietario,
          representante_legal = EXCLUDED.representante_legal,
          provincia = EXCLUDED.provincia,
          canton = EXCLUDED.canton,
          parroquia = EXCLUDED.parroquia,
          tipo_parroquia = EXCLUDED.tipo_parroquia,
          direccion = EXCLUDED.direccion,
          referencia_direccion = EXCLUDED.referencia_direccion,
          telefono = EXCLUDED.telefono,
          correo = EXCLUDED.correo,
          sitio_web = EXCLUDED.sitio_web,
          estado_registro = EXCLUDED.estado_registro,
          row_hash = EXCLUDED.row_hash,
          ultimo_job_id = EXCLUDED.ultimo_job_id,
          ausente_desde_job = NULL,
          updated_at = now()
        WHERE turismo_establecimiento.row_hash IS DISTINCT FROM EXCLUDED.row_hash
           OR turismo_establecimiento.ausente_desde_job IS NOT NULL
        RETURNING (xmax = 0) AS insertada
      )
      SELECT
        count(*) FILTER (WHERE insertada)     AS insertadas,
        count(*) FILTER (WHERE NOT insertada) AS actualizadas
      FROM merged
      `,
      [
        jobId,
        items.map((x) => x.numeroRegistro),
        items.map((x) => x.ruc),
        items.map((x) => x.codigoEstablecimiento),
        items.map((x) => x.codigoEstablecimientoRaw),
        items.map((x) => x.nombreComercial),
        items.map((x) => x.fechaRegistro),
        items.map((x) => x.fechaRegistroRaw),
        items.map((x) => x.actividad),
        items.map((x) => x.clasificacion),
        items.map((x) => x.categoria),
        items.map((x) => x.categoriaNorm),
        items.map((x) => x.razonSocialPropietario),
        items.map((x) => x.representanteLegal),
        items.map((x) => x.provincia),
        items.map((x) => x.canton),
        items.map((x) => x.parroquia),
        items.map((x) => x.tipoParroquia),
        items.map((x) => x.direccion),
        items.map((x) => x.referenciaDireccion),
        items.map((x) => x.telefono),
        items.map((x) => x.correo),
        items.map((x) => x.sitioWeb),
        items.map((x) => x.estadoRegistro),
        items.map((x) => x.rowHash),
      ],
    );

    return {
      insertadas: Number(filas[0]?.insertadas ?? 0),
      actualizadas: Number(filas[0]?.actualizadas ?? 0),
    };
  }

  private async contarAusentes(
    claves: string[],
  ): Promise<{ missing: number; vivos: number }> {
    const [r] = await this.dataSource.query(
      `SELECT
         count(*) FILTER (WHERE numero_registro <> ALL($1::text[]))::bigint AS missing,
         count(*)::bigint AS vivos
       FROM turismo_establecimiento
       WHERE ausente_desde_job IS NULL`,
      [claves],
    );
    return { missing: Number(r?.missing ?? 0), vivos: Number(r?.vivos ?? 0) };
  }

  private async marcarAusentes(
    jobId: string,
    claves: string[],
  ): Promise<number> {
    const res = await this.dataSource.query(
      `UPDATE turismo_establecimiento
       SET ausente_desde_job = $1, updated_at = now()
       WHERE ausente_desde_job IS NULL
         AND numero_registro <> ALL($2::text[])`,
      [jobId, claves],
    );
    return Array.isArray(res) && typeof res[1] === 'number' ? res[1] : 0;
  }

  /**
   * Resuelve a qué población pertenece cada RUC del catastro.
   *
   * Se recalcula entero en cada carga, no sólo para las filas tocadas: el
   * padrón del SRI se importa por provincias y de forma continua, así que un
   * RUC que hoy es 'desconocido' puede ser una persona natural en cuanto se
   * cargue su provincia.
   */
  private async clasificarTitulares(): Promise<void> {
    await this.dataSource.query(`
      UPDATE turismo_establecimiento te
      SET tipo_titular = t.tipo, updated_at = now()
      FROM (
        SELECT x.numero_registro,
               CASE
                 WHEN EXISTS (SELECT 1 FROM contribuyentes c
                                WHERE c.tipo = 'companies' AND c.ruc = x.ruc) THEN 'compania'
                 WHEN EXISTS (SELECT 1 FROM contribuyentes p
                                WHERE p.tipo IN ('natural_contable', 'natural_no_contable') AND p.ruc = x.ruc)
                   THEN 'persona_natural'
                 WHEN EXISTS (SELECT 1 FROM contribuyentes s
                                WHERE s.tipo = 'sociedad_no_supervisada' AND s.ruc = x.ruc)
                   THEN 'sociedad_no_supervisada'
                 ELSE 'desconocido'
               END AS tipo
        FROM turismo_establecimiento x
      ) t
      WHERE t.numero_registro = te.numero_registro
        AND te.tipo_titular IS DISTINCT FROM t.tipo
    `);
  }

  /** RUC del catastro que apuntan a más de un expediente y por eso no se enlazan. */
  private async rucsAmbiguos(): Promise<number> {
    const [r] = await this.dataSource.query(`
      SELECT count(*)::bigint AS n FROM (
        SELECT c.ruc FROM contribuyentes c
        WHERE c.tipo = 'companies'
          AND c.ruc IN (SELECT ruc FROM turismo_establecimiento WHERE ausente_desde_job IS NULL)
        GROUP BY c.ruc HAVING count(*) > 1
      ) x
    `);
    return Number(r?.n ?? 0);
  }

  /**
   * Materializa el resumen del catastro en las tres tablas de titulares.
   *
   * Se escribe el agregado en vez de dejar el join por RUC para cada consulta,
   * igual que hizo el padrón del SRI. Y se limpia lo que dejó de estar en el
   * catastro: un establecimiento que se da de baja tiene que dejar de contar,
   * o la ficha seguiría diciendo "registrado en turismo" para siempre.
   */
  private async propagarATitulares(
    jobId: string,
  ): Promise<Record<string, number>> {
    const titulares = [
      { clave: 'companies', salida: 'companias' },
      { clave: 'natural_contable', salida: 'persona_natural' },
      { clave: 'natural_no_contable', salida: 'persona_natural' },
      { clave: 'sociedad_no_supervisada', salida: 'sociedad_no_supervisada' },
    ];
    const out: Record<string, number> = {};

    for (const titular of titulares) {
      // En `companias` un RUC puede apuntar a dos expedientes (8 casos en toda
      // la base). Como no se puede saber cuál de los dos es el del catastro, no
      // se enlaza ninguno: es la misma regla del importador del padrón.
      const filtroAmbiguos =
        titular.clave === 'companies'
          ? `AND (SELECT count(*) FROM contribuyentes c2
                  WHERE c2.tipo = 'companies' AND c2.ruc = a.ruc) = 1`
          : '';

      const res = await this.dataSource.query(
        `
        UPDATE contribuyentes d SET
          turismo_registros = a.n,
          turismo_actividades = a.actividades,
          turismo_clasificaciones = a.clasificaciones,
          turismo_ratificado = a.ratificado,
          turismo_job_id = $1,
          updated_at = now()
        FROM (
          SELECT ruc,
                 count(*)::smallint AS n,
                 array_agg(DISTINCT actividad) AS actividades,
                 array_remove(array_agg(DISTINCT clasificacion), NULL) AS clasificaciones,
                 bool_or(estado_registro = 'RATIFICADO') AS ratificado
          FROM turismo_establecimiento
          WHERE ausente_desde_job IS NULL
          GROUP BY ruc
        ) a
        WHERE d.tipo = $2 AND d.ruc = a.ruc
          ${filtroAmbiguos}
          AND (d.turismo_registros IS DISTINCT FROM a.n
            OR d.turismo_actividades IS DISTINCT FROM a.actividades
            OR d.turismo_clasificaciones IS DISTINCT FROM a.clasificaciones
            OR d.turismo_ratificado IS DISTINCT FROM a.ratificado)
        `,
        [jobId, titular.clave],
      );
      out[titular.salida] =
        (out[titular.salida] ?? 0) +
        (Array.isArray(res) && typeof res[1] === 'number' ? res[1] : 0);

      await this.dataSource.query(`
        UPDATE contribuyentes d SET
          turismo_registros = NULL,
          turismo_actividades = NULL,
          turismo_clasificaciones = NULL,
          turismo_ratificado = NULL,
          updated_at = now()
        WHERE d.tipo = '${titular.clave}' AND d.turismo_registros IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM turismo_establecimiento te
            WHERE te.ruc = d.ruc AND te.ausente_desde_job IS NULL
          )
      `);
    }

    return out;
  }
}
