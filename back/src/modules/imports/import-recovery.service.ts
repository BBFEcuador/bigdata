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
      //
      // La exclusión se hace por el ID DEL JOB embebido en el nombre, no por la
      // columna `staging_table`. Es deliberado: un import puede crear VARIAS
      // tablas de staging (el de balances crea `stg_balance_`,
      // `stg_balance_cuenta_` y `stg_bal_cambiadas_`) y en esa columna sólo cabe
      // una. Filtrando por `staging_table` se borrarían las demás tablas de un
      // job vivo en mitad de su carga.
      //
      // Por el mismo motivo el prefijo es `stg_` a secas y no `stg_companias_`:
      // cualquier importador nuevo queda cubierto sin tocar esto. Se usa
      // `left(...)` en vez de LIKE porque en LIKE el guión bajo es un comodín.
      const huerfanas: { tablename: string }[] = await this.dataSource.query(
        `SELECT tablename FROM pg_tables
         WHERE schemaname = 'public'
           AND left(tablename, 4) = 'stg_'
           AND NOT EXISTS (
             SELECT 1 FROM import_job j
             WHERE j.status IN ('pending','parsing','merging','indexing')
               AND tablename LIKE '%' || replace(j.id::text, '-', '') || '%'
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
