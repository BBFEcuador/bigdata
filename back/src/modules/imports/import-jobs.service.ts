import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ESTADOS_NO_TERMINALES, ImportJob } from './entities/import-job.entity';
import { ImportRowReject } from './entities/import-row-reject.entity';
import {
  MAX_STORED_REJECTS,
  PROGRESS_MIN_INTERVAL_MS,
  REJECT_FLUSH_SIZE,
} from './imports.constants';

/**
 * Lectura/escritura de `import_job` e `import_row_reject`.
 *
 * Usa el pool de TypeORM, que es una conexión DISTINTA de la del import: la del
 * import está ocupada dentro del `COPY` y no puede aceptar consultas.
 */
@Injectable()
export class ImportJobsService {
  private readonly logger = new Logger(ImportJobsService.name);
  private ultimoProgreso = new Map<string, number>();

  constructor(
    @InjectRepository(ImportJob) private readonly jobs: Repository<ImportJob>,
    @InjectRepository(ImportRowReject) private readonly rejects: Repository<ImportRowReject>,
  ) {}

  create(data: Partial<ImportJob>): Promise<ImportJob> {
    return this.jobs.save(this.jobs.create(data));
  }

  findOne(id: string): Promise<ImportJob | null> {
    return this.jobs.findOne({ where: { id } });
  }

  findRecent(limit = 20, kind?: string): Promise<ImportJob[]> {
    return this.jobs.find({
      where: kind ? { kind } : {},
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  findRejects(jobId: string, limit = 200): Promise<ImportRowReject[]> {
    return this.rejects.find({ where: { jobId }, order: { id: 'ASC' }, take: limit });
  }

  update(id: string, patch: Partial<ImportJob>): Promise<unknown> {
    return this.jobs.update({ id }, patch);
  }

  /**
   * Escritura de progreso con throttling.
   *
   * Un import de un millón de filas generaría decenas de miles de UPDATEs si se
   * escribiera en cada lote. Se limita a uno cada `PROGRESS_MIN_INTERVAL_MS` y
   * los errores se tragan: que falle un reporte de progreso jamás debe tumbar
   * una carga que va bien.
   */
  async reportProgress(id: string, patch: Partial<ImportJob>, force = false): Promise<void> {
    const ahora = Date.now();
    const previo = this.ultimoProgreso.get(id) ?? 0;
    if (!force && ahora - previo < PROGRESS_MIN_INTERVAL_MS) return;
    this.ultimoProgreso.set(id, ahora);
    try {
      await this.jobs.update({ id }, patch);
    } catch (err) {
      this.logger.warn(`No se pudo escribir el progreso del job ${id}: ${(err as Error).message}`);
    }
  }

  forgetProgress(id: string): void {
    this.ultimoProgreso.delete(id);
  }

  /** Inserta rechazos por lotes; nunca fila a fila. */
  async saveRejects(
    jobId: string,
    filas: { sourceRowNumber: number; columna?: string | null; motivo: string; raw?: Record<string, unknown> }[],
  ): Promise<void> {
    if (filas.length === 0) return;
    try {
      for (let i = 0; i < filas.length; i += REJECT_FLUSH_SIZE) {
        const lote = filas.slice(i, i + REJECT_FLUSH_SIZE).map((f) => ({
          jobId,
          sourceRowNumber: f.sourceRowNumber,
          columna: f.columna ?? null,
          motivo: f.motivo,
          raw: f.raw ?? {},
        }));
        await this.rejects.insert(lote);
      }
    } catch (err) {
      this.logger.warn(`No se pudieron guardar los rechazos: ${(err as Error).message}`);
    }
  }

  get maxStoredRejects(): number {
    return MAX_STORED_REJECTS;
  }

  /** ¿Hay ya un import en marcha? */
  async hayJobActivo(kind: string): Promise<ImportJob | null> {
    return this.jobs.findOne({ where: { kind, status: In(ESTADOS_NO_TERMINALES) } });
  }

  /**
   * Marca como fallidos los jobs que quedaron a medias, para que el índice único
   * parcial de "un import activo" no bloquee para siempre las cargas siguientes.
   *
   * Sólo toca los que están REALMENTE muertos. Cada job vivo mantiene un lock
   * consultivo de sesión mientras se ejecuta, así que si aquí se consigue tomar
   * ese lock es que nadie lo está corriendo. Sin esta comprobación, arrancar una
   * segunda instancia —o que el modo --watch reinicie el proceso— daría por
   * muerto un import en curso y le borraría la tabla de staging debajo.
   */
  async recuperarJobsInterrumpidos(): Promise<string[]> {
    const colgados = await this.jobs.find({ where: { status: In(ESTADOS_NO_TERMINALES) } });
    const stagingsALimpiar: string[] = [];

    for (const job of colgados) {
      const clave = `import_job:${job.id}`;
      const [{ ok }] = await this.jobs.query(
        'SELECT pg_try_advisory_lock(hashtext($1)::bigint) AS ok',
        [clave],
      );
      if (!ok) {
        this.logger.log(`El job ${job.id} sigue vivo en otro proceso; no se toca.`);
        continue;
      }
      try {
        await this.jobs.update(
          { id: job.id },
          {
            status: 'failed',
            errorMessage: 'Interrumpido por un reinicio del servidor',
            finishedAt: new Date(),
          },
        );
        if (job.stagingTable) stagingsALimpiar.push(job.stagingTable);
      } finally {
        await this.jobs.query('SELECT pg_advisory_unlock(hashtext($1)::bigint)', [clave]);
      }
    }
    return stagingsALimpiar;
  }
}
