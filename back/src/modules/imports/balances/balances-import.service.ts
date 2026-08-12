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
  UMBRAL_AUSENCIA,
} from '../imports.constants';
import {
  FORMULARIOS_SOPORTADOS,
  FORMULARIO_POR_NUM_CUENTAS,
} from './balances.constants';
import { CabeceraBalances, parsearCabecera, parsearFila } from './balances-file.parser';
import { BalancesPgSession } from './balances-pg.session';

/**
 * Importador de balances: streaming del .txt, pivote ancho -> largo y COPY a
 * dos stagings, seguido de un merge idempotente por particiones.
 *
 * Ver `README.md` de este módulo para el detalle de por qué cada pieza es como
 * es. Los puntos que no se pueden tocar sin entenderlos son la contrapresión
 * (heredada de `PgCopySession`), el orden borrar-insertar-sellar dentro de cada
 * chunk y el hecho de que el `row_hash` cubra también los importes.
 */
@Injectable()
export class BalancesImportService {
  private readonly logger = new Logger(BalancesImportService.name);

  constructor(private readonly jobsService: ImportJobsService) {}

  enqueue(jobId: string): void {
    void this.run(jobId).catch((err) => {
      this.logger.error(`Job ${jobId} falló de forma inesperada: ${err?.message}`, err?.stack);
    });
  }

  private async run(jobId: string): Promise<void> {
    const job = await this.jobsService.findOne(jobId);
    if (!job) return;

    const session = new BalancesPgSession(jobId);
    const t0 = Date.now();
    let anio = 0;
    let rechazosGuardados = 0;

    try {
      await this.jobsService.update(jobId, { status: 'parsing', startedAt: new Date() });
      await session.connect();

      if (!(await session.acquireJobLock())) {
        throw new Error('Otro proceso ya está ejecutando este job.');
      }

      await session.createStaging();
      await this.jobsService.update(jobId, { stagingTable: session.tablaBalance });

      // ---------- Fase 1: parseo, pivote y COPY ----------
      const { encoding, lineas } = await abrirLectorDeLineas(job.storedPath);
      this.logger.log(`Job ${jobId}: archivo decodificado como ${encoding}`);

      const escritorBalance = session.beginCopyBalance();
      const escritorCuenta = session.beginCopyCuenta();

      let cabecera: CabeceraBalances | null = null;
      let formulario = 0;
      let numeroLinea = 0;
      let leidas = 0;
      let copiadas = 0;
      let celdas = 0;
      let rechazadas = 0;
      let avisos = 0;
      let bufBalance = '';
      let bufCuenta = '';
      const pendientes: {
        sourceRowNumber: number;
        columna?: string | null;
        motivo: string;
        raw?: Record<string, unknown>;
      }[] = [];

      for await (const linea of lineas) {
        numeroLinea++;

        if (cabecera === null) {
          const resultado = parsearCabecera(linea);
          if (resultado.cabecera === null) {
            throw new Error(
              'No se pudo interpretar la cabecera del archivo: ' +
                resultado.problemas.map((p) => p.motivo).join(', ') +
                '. Se esperaba un .txt separado por tabuladores con AÑO, EXPEDIENTE ' +
                'y las columnas CUENTA_*.',
            );
          }
          cabecera = resultado.cabecera;
          formulario = this.detectarFormulario(cabecera.cuentas.length);
          if (resultado.problemas.length) {
            avisos += resultado.problemas.length;
            this.logger.warn(
              `Cabecera con avisos: ${resultado.problemas.map((p) => p.motivo).join(', ')}`,
            );
          }
          continue;
        }

        if (linea === '') continue; // línea en blanco al final del archivo

        leidas++;
        const { fila, cuentas, rechazos } = parsearFila(linea, cabecera);

        if (rechazos.length) {
          rechazadas += fila === null ? 1 : 0;
          avisos += fila === null ? 0 : rechazos.length;
          for (const r of rechazos) {
            if (rechazosGuardados + pendientes.length >= MAX_STORED_REJECTS) break;
            pendientes.push({
              sourceRowNumber: numeroLinea,
              columna: r.columna,
              motivo: r.motivo,
            });
          }
        }

        if (fila === null) continue;

        if (anio === 0) {
          anio = fila.anio;
        } else if (fila.anio !== anio) {
          // Un archivo mezcla de años rompería el reemplazo por partición y la
          // salvaguarda de ausentes, que razonan sobre un único (año, formulario).
          throw new Error(
            `El archivo mezcla ejercicios: se esperaba ${anio} y la línea ${numeroLinea} ` +
              `trae ${fila.anio}. Cada archivo debe contener un solo año.`,
          );
        }

        // El hash cubre la identidad Y todos los importes. Es lo que permite
        // saltarse el detalle completo de una empresa cuyo balance no cambió.
        const rowHash = huellaDeFila([
          fila.anio,
          formulario,
          fila.expediente,
          fila.ruc,
          fila.nombre,
          fila.rama_actividad,
          fila.descripcion_rama,
          fila.ciiu,
          ...cuentas.map((c) => `${c.codigo}=${c.valor}`),
        ]);

        bufBalance += serializeCopyRow([
          String(numeroLinea),
          String(fila.anio),
          String(formulario),
          fila.expediente,
          fila.ruc,
          fila.nombre,
          fila.rama_actividad,
          fila.descripcion_rama,
          fila.ciiu,
          rowHash,
        ]);
        copiadas++;

        for (const c of cuentas) {
          bufCuenta += serializeCopyRow([
            String(fila.anio),
            String(formulario),
            fila.expediente,
            c.codigo,
            c.valor,
          ]);
        }
        celdas += cuentas.length;

        // Se vacía cada buffer por separado: son dos conexiones distintas y cada
        // una tiene su propia contrapresión.
        if (bufBalance.length >= COPY_CHUNK_BYTES) {
          await escritorBalance.write(bufBalance);
          bufBalance = '';
        }
        if (bufCuenta.length >= COPY_CHUNK_BYTES) {
          await escritorCuenta.write(bufCuenta);
          bufCuenta = '';
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

      if (bufBalance) await escritorBalance.write(bufBalance);
      if (bufCuenta) await escritorCuenta.write(bufCuenta);
      const filasBalance = await escritorBalance.finish();
      const filasCuenta = await escritorCuenta.finish();

      if (cabecera === null) throw new Error('El archivo está vacío.');
      if (copiadas === 0) throw new Error('El archivo no contiene ninguna fila válida.');
      if (filasBalance !== copiadas || filasCuenta !== celdas) {
        throw new Error(
          `Descuadre en el COPY: Postgres aceptó ${filasBalance} cabeceras y ${filasCuenta} ` +
            `celdas; se enviaron ${copiadas} y ${celdas}.`,
        );
      }
      if (pendientes.length) {
        await this.jobsService.saveRejects(jobId, pendientes.splice(0));
        rechazosGuardados += pendientes.length;
      }

      await this.jobsService.reportProgress(
        jobId,
        {
          rowsRead: leidas,
          rowsCopied: copiadas,
          rowsRejected: rechazadas,
          rowsWarned: avisos,
          progressPct: 60,
          status: 'merging',
        },
        true,
      );

      // ---------- Fase 2: comprobaciones y merge ----------
      await session.crearParticion(anio);
      await session.analyzeStaging();

      const desconocidos = await session.codigosDesconocidos();
      const huerfanas = await session.contarHuerfanas();
      const descuadres = await session.contarDescuadres();

      const { missing, vivas } = await session.contarAusentes(anio, formulario);
      if (job.modo === 'snapshot_completo' && vivas > 0 && missing / vivas > UMBRAL_AUSENCIA) {
        throw new Error(
          `El archivo dejaría fuera ${missing} de ${vivas} balances vigentes de ${anio} ` +
            `(${((missing / vivas) * 100).toFixed(1)}%). Parece un archivo incompleto; ` +
            `no se aplicó ningún cambio. Vuelve a subirlo como carga parcial si es intencional.`,
        );
      }

      const cambiadas = await session.marcarCambiadas();
      const totales = await session.merge((hechos, total) => {
        void this.jobsService.reportProgress(jobId, {
          progressPct: 60 + Math.round((hechos / total) * 32),
        });
      });

      const marcadas =
        job.modo === 'snapshot_completo' ? await session.marcarAusentes(anio, formulario) : 0;

      await this.jobsService.reportProgress(jobId, { status: 'indexing', progressPct: 95 }, true);
      await session.vacuumAnalyze(anio);

      await this.jobsService.update(jobId, {
        status: 'completed',
        progressPct: 100,
        avisos: this.componerAvisos({
          encoding,
          formulario,
          anio,
          celdas,
          desconocidos,
          huerfanas,
          descuadres,
        }),
        rowsRead: leidas,
        rowsCopied: copiadas,
        rowsRejected: rechazadas,
        rowsWarned: avisos,
        rowsInserted: totales.inserted,
        rowsUpdated: totales.updated,
        rowsUnchanged: Math.max(0, copiadas - cambiadas),
        rowsMissing: marcadas,
        finishedAt: new Date(),
      });

      this.logger.log(
        `Job ${jobId} completado en ${((Date.now() - t0) / 1000).toFixed(1)}s: ` +
          `${anio}/formulario ${formulario}, ${copiadas} balances, ${celdas} celdas, ` +
          `${totales.inserted} nuevos, ${totales.updated} actualizados, ` +
          `${Math.max(0, copiadas - cambiadas)} sin cambios, ${marcadas} ausentes`,
      );
    } catch (err) {
      const mensaje = (err as Error)?.message ?? String(err);
      this.logger.error(`Job ${jobId} falló: ${mensaje}`);
      await this.jobsService
        .update(jobId, { status: 'failed', errorMessage: mensaje, finishedAt: new Date() })
        .catch(() => undefined);
    } finally {
      await session.dropStaging().catch(() => undefined);
      await session.close();
      this.jobsService.forgetProgress(jobId);
      await fs.unlink(job.storedPath).catch(() => undefined);
    }
  }

  /**
   * El formulario sale del plan de cuentas del encabezado, nunca del nombre del
   * archivo. Cargar un formulario distinto del 1 sin su catálogo mezclaría
   * códigos que significan cosas diferentes, así que se rechaza de entrada en
   * vez de entrar mal.
   */
  private detectarFormulario(numCuentas: number): number {
    const formulario = FORMULARIO_POR_NUM_CUENTAS[numCuentas];
    if (formulario === undefined) {
      throw new Error(
        `Plan de cuentas desconocido: el archivo trae ${numCuentas} cuentas y los ` +
          `formularios conocidos tienen ${Object.keys(FORMULARIO_POR_NUM_CUENTAS).join(', ')}.`,
      );
    }
    if (!FORMULARIOS_SOPORTADOS.includes(formulario)) {
      throw new Error(
        `El archivo es del formulario ${formulario} (${numCuentas} cuentas), que todavía ` +
          `no está soportado. Sus códigos NO significan lo mismo que los del formulario 1: ` +
          `cargarlo mezclaría cuentas distintas bajo el mismo código.`,
      );
    }
    return formulario;
  }

  /** El total de líneas no se conoce hasta el final; curva asintótica hasta 60. */
  private pctParseo(leidas: number): number {
    return Math.min(59, Math.round(60 * (1 - Math.exp(-leidas / 60_000))));
  }

  private componerAvisos(d: {
    encoding: string;
    formulario: number;
    anio: number;
    celdas: number;
    desconocidos: string[];
    huerfanas: number;
    descuadres: number;
  }): string {
    const partes = [`Ejercicio ${d.anio}, formulario ${d.formulario}, ${d.celdas} celdas con valor.`];
    if (d.encoding === 'latin1') partes.push('Archivo leído como Latin-1 (no era UTF-8).');
    if (d.desconocidos.length) {
      partes.push(
        `Códigos no presentes en el catálogo (no se cargaron): ${d.desconocidos.join(', ')}.`,
      );
    }
    if (d.huerfanas) {
      partes.push(
        `${d.huerfanas} balances de expedientes que no están en el directorio de compañías. ` +
          `Se cargaron igual: son empresas que presentaron balance pero no figuran en el directorio.`,
      );
    }
    if (d.descuadres) {
      partes.push(
        `${d.descuadres} balances no cumplen ACTIVO = PASIVO + PATRIMONIO. ` +
          `Se cargaron, pero quedan marcados para excluirlos de los indicadores.`,
      );
    }
    return partes.join(' ');
  }
}
