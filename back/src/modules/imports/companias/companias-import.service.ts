import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { ImportJobsService } from '../import-jobs.service';
import { ImportPgSession } from '../pg/import-pg.session';
import { readRows } from '../xlsx/xlsx-row-source';
import { assertRequiredColumns, resolveHeader } from '../transform/header-map';
import { CellWarning, mapRow } from '../transform/row-mapper';
import { serializeCopyRow } from '../transform/copy-text';
import {
  COPY_CHUNK_BYTES,
  MAX_STORED_REJECTS,
  PROGRESS_ROW_INTERVAL,
  UMBRAL_AUSENCIA,
} from '../imports.constants';

/**
 * Importador del Excel de compañías: streaming + COPY a staging + merge.
 *
 * La limpieza de arranque ya no vive aquí; es común a todos los tipos de import
 * y está en `ImportRecoveryService`.
 */
@Injectable()
export class CompaniasImportService {
  private readonly logger = new Logger(CompaniasImportService.name);

  constructor(private readonly jobsService: ImportJobsService) {}

  /** Lanza el import sin bloquear la respuesta HTTP. */
  enqueue(jobId: string): void {
    void this.run(jobId).catch((err) => {
      this.logger.error(`Job ${jobId} falló de forma inesperada: ${err?.message}`, err?.stack);
    });
  }

  private async run(jobId: string): Promise<void> {
    const job = await this.jobsService.findOne(jobId);
    if (!job) return;

    const session = new ImportPgSession(jobId);
    const t0 = Date.now();
    let rechazosGuardados = 0;

    try {
      await this.jobsService.update(jobId, { status: 'parsing', startedAt: new Date() });
      await session.connect();

      // Señal de "este job está vivo": mientras la conexión exista, ninguna otra
      // instancia que arranque lo dará por colgado ni le borrará el staging.
      if (!(await session.acquireJobLock())) {
        throw new Error('Otro proceso ya está ejecutando este job.');
      }

      await session.createStaging();
      await this.jobsService.update(jobId, { stagingTable: session.table });

      // ---------- Fase 1: parseo + COPY ----------
      const writer = session.beginCopyIntoStaging();
      let header: ReturnType<typeof resolveHeader> | null = null;
      let leidas = 0;
      let copiadas = 0;
      let rechazadas = 0;
      let avisos = 0;
      let buffer = '';
      const pendientes: {
        sourceRowNumber: number;
        columna?: string | null;
        motivo: string;
        raw?: Record<string, unknown>;
      }[] = [];

      for await (const { rowNumber, cells } of readRows(job.storedPath)) {
        if (!header) {
          // La primera fila no vacía es la cabecera.
          const resuelto = resolveHeader(cells);
          const encontradas = cells
            .filter((c) => c !== null && c !== undefined)
            .map((c) => String(typeof c === 'object' ? (c as any).text ?? '' : c));
          assertRequiredColumns(resuelto, encontradas);
          header = resuelto;
          if (resuelto.missingColumns.length) {
            this.logger.warn(
              `Columnas ausentes en el archivo (se cargarán como NULL): ${resuelto.missingColumns.join(', ')}`,
            );
          }
          continue;
        }

        leidas++;
        const mapped = mapRow(rowNumber, cells, header);

        if (mapped.kind === 'reject') {
          rechazadas++;
          if (rechazosGuardados + pendientes.length < MAX_STORED_REJECTS) {
            pendientes.push({
              sourceRowNumber: mapped.rowNumber,
              motivo: mapped.reason,
              raw: mapped.raw,
            });
          }
          continue;
        }

        if (mapped.warnings.length) {
          avisos += mapped.warnings.length;
          this.acumularAvisos(mapped.warnings, pendientes, rechazosGuardados);
        }

        buffer += serializeCopyRow(mapped.values);
        copiadas++;

        if (buffer.length >= COPY_CHUNK_BYTES) {
          await writer.write(buffer); // <- aquí vive la contrapresión
          buffer = '';
        }

        if (pendientes.length >= 500) {
          const lote = pendientes.splice(0);
          await this.jobsService.saveRejects(jobId, lote);
          rechazosGuardados += lote.length;
        }

        if (leidas % PROGRESS_ROW_INTERVAL === 0) {
          await this.jobsService.reportProgress(jobId, {
            rowsRead: leidas,
            rowsCopied: copiadas,
            rowsRejected: rechazadas,
            rowsWarned: avisos,
            progressPct: this.pctParseo(leidas),
          });
        }
      }

      if (buffer) await writer.write(buffer);
      const copyRowCount = await writer.finish();

      if (!header) throw new Error('El archivo no tiene una fila de cabecera legible.');
      if (copyRowCount !== copiadas) {
        throw new Error(
          `Descuadre en el COPY: Postgres aceptó ${copyRowCount} filas y se enviaron ${copiadas}.`,
        );
      }
      if (pendientes.length) {
        await this.jobsService.saveRejects(jobId, pendientes.splice(0));
      }

      await this.jobsService.reportProgress(
        jobId,
        {
          rowsRead: leidas,
          rowsCopied: copiadas,
          rowsRejected: rechazadas,
          rowsWarned: avisos,
          progressPct: 70,
          status: 'merging',
        },
        true,
      );

      // ---------- Fase 2: merge ----------
      await session.analyzeStaging();
      const stats = await session.stagingStats();
      const duplicados = stats.filas - stats.distintos;

      const { missing, vivas } = await session.countMissing();

      // Salvaguarda: un archivo truncado subido como snapshot completo marcaría
      // media base como ausente de un solo golpe. Mejor fallar y no tocar nada.
      if (job.modo === 'snapshot_completo' && vivas > 0 && missing / vivas > UMBRAL_AUSENCIA) {
        throw new Error(
          `El archivo dejaría fuera ${missing} de ${vivas} compañías vigentes ` +
            `(${((missing / vivas) * 100).toFixed(1)}%). Parece un archivo incompleto; ` +
            `no se aplicó ningún cambio. Vuelve a subirlo como carga parcial si es intencional.`,
        );
      }

      const totales = await session.merge((hechos, total) => {
        void this.jobsService.reportProgress(jobId, {
          progressPct: 70 + Math.round((hechos / total) * 20),
        });
      });

      const marcadas =
        job.modo === 'snapshot_completo' ? await session.markMissing() : 0;

      // ---------- Fase 3: índices y limpieza ----------
      await this.jobsService.reportProgress(jobId, { status: 'indexing', progressPct: 92 }, true);
      const indicesFallidos = await session.ensureIndexes();
      await session.vacuumAnalyze();

      const sinCambios = copiadas - totales.inserted - totales.updated - duplicados;

      await this.jobsService.update(jobId, {
        status: 'completed',
        avisos: indicesFallidos.length
          ? `No se pudieron crear estos índices: ${indicesFallidos.join(', ')}. ` +
            `Los datos están cargados, pero las consultas irán lentas hasta crearlos.`
          : null,
        progressPct: 100,
        rowsRead: leidas,
        rowsCopied: copiadas,
        rowsRejected: rechazadas,
        rowsWarned: avisos,
        rowsInserted: totales.inserted,
        rowsUpdated: totales.updated,
        rowsUnchanged: Math.max(0, sinCambios),
        rowsMissing: marcadas,
        duplicados,
        finishedAt: new Date(),
      });

      this.logger.log(
        `Job ${jobId} completado en ${((Date.now() - t0) / 1000).toFixed(1)}s: ` +
          `${totales.inserted} nuevas, ${totales.updated} actualizadas, ` +
          `${Math.max(0, sinCambios)} sin cambios, ${marcadas} ausentes, ${rechazadas} rechazadas`,
      );
    } catch (err) {
      const mensaje = (err as Error)?.message ?? String(err);
      this.logger.error(`Job ${jobId} falló: ${mensaje}`);
      await this.jobsService
        .update(jobId, { status: 'failed', errorMessage: mensaje, finishedAt: new Date() })
        .catch(() => undefined);
    } finally {
      await session.dropStaging();
      await session.close();
      this.jobsService.forgetProgress(jobId);
      // El archivo subido ya no hace falta; son cientos de MB por carga.
      await fs.unlink(job.storedPath).catch(() => undefined);
    }
  }

  /**
   * El total de filas no se conoce hasta el final, así que el porcentaje de la
   * fase de parseo se aproxima con una curva asintótica sobre las filas leídas.
   * El frontend muestra además el número de filas, que es más informativo.
   */
  private pctParseo(leidas: number): number {
    // Calibrada para llegar a ~66% con un millón de filas, que es el tamaño
    // habitual del archivo. Con archivos mayores se acerca a 70 sin pasarse.
    return Math.min(69, Math.round(70 * (1 - Math.exp(-leidas / 350_000))));
  }

  private acumularAvisos(
    warnings: CellWarning[],
    destino: { sourceRowNumber: number; columna?: string | null; motivo: string }[],
    yaGuardados: number,
  ): void {
    for (const w of warnings) {
      if (yaGuardados + destino.length >= MAX_STORED_REJECTS) return;
      destino.push({ sourceRowNumber: w.rowNumber, columna: w.column, motivo: w.reason });
    }
  }
}
