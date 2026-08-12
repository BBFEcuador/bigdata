import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ImportJobsService } from './import-jobs.service';

/**
 * Limpieza de arranque, común a todos los tipos de import.
 *
 * Vive aparte de los runners a propósito: es una responsabilidad del módulo,
 * no de un importador concreto, y si estuviera dentro de uno se ejecutaría (o
 * se duplicaría) según qué runners estén registrados.
 */
@Injectable()
export class ImportRecoveryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ImportRecoveryService.name);

  constructor(
    private readonly jobsService: ImportJobsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * Los jobs que quedaron a medias pertenecen a un proceso que ya no existe, y
   * sus tablas de staging son basura. Sin esto, el índice único parcial de "un
   * solo import activo por tipo" dejaría ese tipo bloqueado para siempre tras
   * una caída.
   *
   * `recuperarJobsInterrumpidos()` sólo marca los que están realmente muertos:
   * comprueba el lock consultivo antes de tocar nada.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const stagings = await this.jobsService.recuperarJobsInterrumpidos();
      for (const t of stagings) {
        await this.dataSource.query(`DROP TABLE IF EXISTS ${t}`).catch(() => undefined);
      }

      // Barrido de tablas huérfanas de ejecuciones anteriores, EXCLUYENDO las de
      // jobs que siguen vivos: borrar el staging de un import en curso lo haría
      // fallar a mitad de la carga.
      const huerfanas: { tablename: string }[] = await this.dataSource.query(
        `SELECT tablename FROM pg_tables
         WHERE schemaname='public'
           AND tablename LIKE 'stg_companias_%'
           AND tablename NOT IN (
             SELECT staging_table FROM import_job
             WHERE staging_table IS NOT NULL
               AND status IN ('pending','parsing','merging','indexing')
           )`,
      );
      for (const { tablename } of huerfanas) {
        await this.dataSource.query(`DROP TABLE IF EXISTS ${tablename}`).catch(() => undefined);
      }

      if (stagings.length || huerfanas.length) {
        this.logger.log(
          `Limpieza de arranque: ${stagings.length} job(s) interrumpido(s), ` +
            `${huerfanas.length} tabla(s) de staging huérfanas`,
        );
      }
    } catch (err) {
      this.logger.warn(`Falló la limpieza de arranque: ${(err as Error).message}`);
    }
  }
}
