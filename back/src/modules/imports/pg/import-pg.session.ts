import {
  SECONDARY_INDEXES,
  copyIntoStagingSql,
  countMissingSql,
  createStagingTableSql,
  markMissingSql,
  mergeChunkSql,
  stagingTableName,
} from './sql/import.sql';
import { MERGE_CHUNKS } from '../imports.constants';
import { CopyWriter, PgCopySession } from './pg-copy.session';

export { CopyWriter };

export interface MergeTotals {
  inserted: number;
  updated: number;
}

/**
 * Conexión dedicada para un job de import de COMPAÑÍAS.
 *
 * La mecánica genérica (conexión, lock consultivo, `COPY` con contrapresión)
 * vive en `PgCopySession`; aquí sólo queda el SQL propio de `companias`.
 */
export class ImportPgSession extends PgCopySession {
  readonly table: string;

  constructor(jobId: string) {
    super(jobId);
    this.table = stagingTableName(jobId);
  }

  async createStaging(): Promise<void> {
    await this.dropTable(this.table);
    await this.client.query(createStagingTableSql(this.table));
  }

  /** Abre el `COPY ... FROM STDIN` contra el staging de compañías. */
  beginCopyIntoStaging(): CopyWriter {
    return this.beginCopy(copyIntoStagingSql(this.table));
  }

  async analyzeStaging(): Promise<void> {
    await this.analyze(this.table);
  }

  /** Cuántos expedientes distintos y cuántos duplicados trae el archivo. */
  async stagingStats(): Promise<{ filas: number; distintos: number }> {
    const { rows } = await this.client.query(
      `SELECT count(*)::bigint AS filas, count(DISTINCT expediente)::bigint AS distintos FROM ${this.table}`,
    );
    return { filas: Number(rows[0].filas), distintos: Number(rows[0].distintos) };
  }

  /**
   * Ejecuta el merge por particiones. Cada partición es su propia transacción:
   * el progreso avanza de verdad, el WAL se libera de forma incremental y un
   * fallo sólo obliga a repetir esa porción.
   */
  async merge(onChunk?: (done: number, total: number) => void): Promise<MergeTotals> {
    const sql = mergeChunkSql(this.table);
    const totals: MergeTotals = { inserted: 0, updated: 0 };

    for (let chunk = 0; chunk < MERGE_CHUNKS; chunk++) {
      const { rows } = await this.client.query(sql, [this.jobId, MERGE_CHUNKS, chunk]);
      totals.inserted += Number(rows[0]?.inserted ?? 0);
      totals.updated += Number(rows[0]?.updated ?? 0);
      onChunk?.(chunk + 1, MERGE_CHUNKS);
    }
    return totals;
  }

  /** Cuántas compañías vivas no vienen en el archivo, y cuántas hay en total. */
  async countMissing(): Promise<{ missing: number; vivas: number }> {
    const { rows } = await this.client.query(countMissingSql(this.table));
    return { missing: Number(rows[0].missing), vivas: Number(rows[0].vivas) };
  }

  async markMissing(): Promise<number> {
    const res = await this.client.query(markMissingSql(this.table), [this.jobId]);
    return res.rowCount ?? 0;
  }

  /**
   * Crea los índices secundarios si aún no existen. En la primera carga es
   * cuando de verdad trabaja; en las siguientes no hace nada.
   * `CONCURRENTLY` no puede ir dentro de una transacción, por eso van sueltos.
   */
  async ensureIndexes(
    onIndex?: (name: string, i: number, total: number) => void,
  ): Promise<string[]> {
    const fallidos: string[] = [];
    for (let i = 0; i < SECONDARY_INDEXES.length; i++) {
      const { name, sql } = SECONDARY_INDEXES[i];
      onIndex?.(name, i + 1, SECONDARY_INDEXES.length);
      try {
        // CREATE INDEX CONCURRENTLY espera a las transacciones en conflicto, y
        // el lock_timeout de la sesión lo haría fallar antes de tiempo.
        await this.client.query('SET lock_timeout = 0');
        await this.client.query(sql);
      } catch (err) {
        // No se tumba un import que ya cargó bien los datos, pero el fallo NO
        // se puede quedar sólo en el log: quedarse con un millón de filas sin
        // índices degrada todas las consultas y nadie se enteraría.
        this.logger.warn(`No se pudo crear el índice ${name}: ${(err as Error).message}`);
        fallidos.push(name);
        // Un CIC fallido deja un índice inválido que hay que retirar; si no,
        // el siguiente intento con IF NOT EXISTS lo da por bueno.
        await this.client
          .query(`DROP INDEX IF EXISTS ${name}`)
          .catch(() => undefined);
      } finally {
        await this.client.query("SET lock_timeout = '30s'").catch(() => undefined);
      }
    }
    return fallidos;
  }

  async vacuumAnalyze(): Promise<void> {
    // VACUUM normal, nunca FULL: FULL reescribe la tabla con un lock exclusivo.
    await this.client.query('VACUUM (ANALYZE) companias');
  }

  async dropStaging(): Promise<void> {
    await this.dropTable(this.table);
  }
}
