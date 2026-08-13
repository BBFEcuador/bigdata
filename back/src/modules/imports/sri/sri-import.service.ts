import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { ImportJobsService } from '../import-jobs.service';
import { serializeCopyRow } from '../transform/copy-text';
import { huellaDeFila } from '../../../common/text/hash';
import { abrirLectorDeLineas } from '../../../common/text/lineas';
import {
  COPY_CHUNK_BYTES,
  MAX_STORED_REJECTS,
  PROGRESS_ROW_INTERVAL,
} from '../imports.constants';
import { parsearFilaSri, validarCabecera } from './sri-file.parser';
import { SriPgSession } from './sri-pg.session';

/**
 * Importador del padrón del SRI.
 *
 * Un archivo = una provincia. Los 24 juntos son 2,9 GB y 8.432.317 filas.
 *
 * ## No marca ausentes, nunca
 *
 * Los otros importadores tratan el archivo como la foto completa del registro y
 * marcan lo que no viene. Aquí eso sería un desastre: cada archivo es UNA
 * provincia, así que cargar Azuay marcaría como desaparecidos a los
 * contribuyentes de las otras 23. No hay modo `snapshot_completo` que tenga
 * sentido, y por eso no se implementa en vez de dejarlo como una opción que
 * alguien podría pulsar.
 */
@Injectable()
export class SriImportService {
  private readonly logger = new Logger(SriImportService.name);

  constructor(private readonly jobsService: ImportJobsService) {}

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

    const session = new SriPgSession(jobId);
    const t0 = Date.now();
    let rechazosGuardados = 0;
    // La ruta histórica `/imports/sri` no guarda provincia; la nueva ruta sí.
    // Usar el mismo kind mantiene un único lock para todo el padrón provincial.
    const soloPersonas = Boolean(job.provincia);
    const provincia = job.provincia ?? undefined;

    try {
      await this.jobsService.update(jobId, {
        status: 'parsing',
        startedAt: new Date(),
      });
      await session.connect();

      if (!(await session.acquireJobLock())) {
        throw new Error('Otro proceso ya está ejecutando este job.');
      }

      await session.createStaging();
      await this.jobsService.update(jobId, { stagingTable: session.tabla });

      // ---------- Fase 1: parseo y COPY ----------
      const { encoding, lineas } = await abrirLectorDeLineas(job.storedPath);
      const writer = session.beginCopyStaging();

      let numeroLinea = 0;
      let leidas = 0;
      let copiadas = 0;
      let rechazadas = 0;
      let reparadas = 0;
      let buffer = '';
      let cabeceraVista = false;
      const pendientes: {
        sourceRowNumber: number;
        motivo: string;
        raw?: Record<string, unknown>;
      }[] = [];

      for await (const linea of lineas) {
        numeroLinea++;

        if (!cabeceraVista) {
          const { faltan } = validarCabecera(linea);
          if (faltan.length) {
            throw new Error(
              `La cabecera del archivo no es la del padrón del SRI. Faltan: ${faltan.join(', ')}.`,
            );
          }
          cabeceraVista = true;
          continue;
        }
        if (linea === '') continue;

        leidas++;
        const { fila, motivo, reparada } = parsearFilaSri(linea);

        if (fila === null) {
          rechazadas++;
          if (rechazosGuardados + pendientes.length < MAX_STORED_REJECTS) {
            pendientes.push({
              sourceRowNumber: numeroLinea,
              motivo: motivo ?? 'fila_invalida',
              raw: { linea: linea.slice(0, 300) },
            });
          }
          continue;
        }
        if (reparada) reparadas++;

        // Dos hashes: uno de los datos del contribuyente —que se repiten en
        // todas sus filas— y otro del establecimiento. Así un local que cambia
        // no fuerza a reescribir la ficha del contribuyente, ni al revés.
        const hashContribuyente = huellaDeFila([
          fila.ruc,
          fila.razonSocial,
          fila.jurisdiccion,
          fila.estadoContribuyente,
          fila.claseContribuyente,
          fila.fechaInicioActividades,
          fila.fechaActualizacion,
          fila.fechaSuspensionDefinitiva,
          fila.fechaReinicioActividades,
          fila.obligadoContabilidad,
          fila.agenteRetencion,
          fila.contribuyenteEspecial,
        ]);
        const hashEstablecimiento = huellaDeFila([
          fila.ruc,
          fila.numeroEstablecimiento,
          fila.nombreComercial,
          fila.estadoEstablecimiento,
          fila.provincia,
          fila.canton,
          fila.parroquia,
          fila.codigoCiiu,
          fila.actividad,
        ]);

        buffer += serializeCopyRow([
          fila.ruc,
          fila.razonSocial,
          fila.jurisdiccion,
          fila.estadoContribuyente,
          fila.claseContribuyente,
          fila.fechaInicioActividades,
          fila.fechaActualizacion,
          fila.fechaSuspensionDefinitiva,
          fila.fechaReinicioActividades,
          fila.obligadoContabilidad,
          fila.tipoContribuyente,
          fila.numeroEstablecimiento,
          fila.nombreComercial,
          fila.estadoEstablecimiento,
          fila.provincia,
          fila.canton,
          fila.parroquia,
          fila.codigoCiiu,
          fila.actividad,
          fila.agenteRetencion,
          fila.contribuyenteEspecial,
          hashContribuyente,
          hashEstablecimiento,
        ]);
        copiadas++;

        if (buffer.length >= COPY_CHUNK_BYTES) {
          await writer.write(buffer); // <- contrapresión
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
            progressPct: this.pctParseo(leidas),
          });
        }
      }

      if (buffer) await writer.write(buffer);
      const filasCopy = await writer.finish();

      if (!cabeceraVista) throw new Error('El archivo está vacío.');
      if (copiadas === 0)
        throw new Error('El archivo no contiene ninguna fila válida.');
      if (filasCopy !== copiadas) {
        throw new Error(
          `Descuadre en el COPY: Postgres aceptó ${filasCopy} filas y se enviaron ${copiadas}.`,
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
          progressPct: 55,
          status: 'merging',
        },
        true,
      );

      // ---------- Fase 2: clasificación y merge ----------
      await session.prepararStaging();
      const stats = await session.estadisticas(soloPersonas, provincia);
      if (soloPersonas && stats.personas === 0) {
        throw new Error(
          `El archivo no contiene personas naturales para la provincia "${provincia}".`,
        );
      }
      const ambiguos = soloPersonas ? [] : await session.rucAmbiguos();

      const personas = await session.mergePersonas(provincia);
      await this.jobsService.reportProgress(jobId, { progressPct: 70 });

      const noSupervisadas = soloPersonas
        ? { insertadas: 0, actualizadas: 0 }
        : await session.mergeSociedadesNoSupervisadas(provincia);
      await this.jobsService.reportProgress(jobId, { progressPct: 80 });

      const enriquecidas = soloPersonas
        ? 0
        : await session.enriquecerCompanias();
      await this.jobsService.reportProgress(jobId, { progressPct: 88 });

      const establecimientos = await session.mergeEstablecimientos(
        soloPersonas,
        provincia,
      );

      await this.jobsService.reportProgress(
        jobId,
        { status: 'indexing', progressPct: 95 },
        true,
      );
      await session.vacuumAnalyze();

      await this.jobsService.update(jobId, {
        status: 'completed',
        progressPct: 100,
        avisos: this.componerAvisos({
          encoding,
          stats,
          ambiguos,
          enriquecidas,
          reparadas,
          establecimientos,
        }),
        rowsRead: leidas,
        rowsCopied: copiadas,
        rowsRejected: rechazadas,
        rowsWarned: reparadas,
        rowsInserted: personas.insertadas + noSupervisadas.insertadas,
        rowsUpdated: personas.actualizadas + noSupervisadas.actualizadas,
        finishedAt: new Date(),
      });

      this.logger.log(
        `Job ${jobId} completado en ${((Date.now() - t0) / 1000).toFixed(1)}s: ` +
          `${stats.personas} personas naturales, ${stats.sociedades} sociedades ` +
          `(${stats.sociedadesSupercias} en Supercias), ` +
          `${establecimientos.insertadas} establecimientos nuevos`,
      );
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
      await session.dropStaging().catch(() => undefined);
      await session.close();
      this.jobsService.forgetProgress(jobId);
      await fs.unlink(job.storedPath).catch(() => undefined);
    }
  }

  /** El total de filas por provincia varía de 27.000 a 1,3 M; curva hasta 55. */
  private pctParseo(leidas: number): number {
    return Math.min(54, Math.round(55 * (1 - Math.exp(-leidas / 300_000))));
  }

  private componerAvisos(d: {
    encoding: string;
    stats: {
      filas: number;
      rucs: number;
      personas: number;
      sociedades: number;
      sociedadesSupercias: number;
    };
    ambiguos: string[];
    enriquecidas: number;
    reparadas: number;
    establecimientos: { insertadas: number; actualizadas: number };
  }): string {
    const s = d.stats;
    const partes = [
      `${s.rucs} contribuyentes en ${s.filas} establecimientos: ` +
        `${s.personas} personas naturales y ${s.sociedades} sociedades ` +
        `(${s.sociedadesSupercias} con expediente en Supercias, ` +
        `${s.sociedades - s.sociedadesSupercias} no supervisadas).`,
      `${d.enriquecidas} compañías enriquecidas con datos del SRI.`,
    ];
    if (d.encoding !== 'utf-8')
      partes.push(`Archivo leído como ${d.encoding}.`);
    if (d.reparadas) {
      partes.push(
        `${d.reparadas} filas traían una barra vertical dentro de un campo entrecomillado ` +
          `y se repararon; sin eso habrían entrado con todas las columnas corridas.`,
      );
    }
    if (d.ambiguos.length) {
      partes.push(
        `${d.ambiguos.length} RUC apuntan a más de un expediente y NO se enlazaron ` +
          `(${d.ambiguos.slice(0, 5).join(', ')}): elegir uno sería inventar.`,
      );
    }
    return partes.join(' ');
  }
}
