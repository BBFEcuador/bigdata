import { Logger } from '@nestjs/common';
import { Client } from 'pg';
import { once } from 'node:events';
// OJO: este proyecto NO tiene `esModuleInterop`. Un import por defecto
// (`import copyFrom from 'pg-copy-streams'`) compila pero en runtime emite
// `mod.default`, que es `undefined`. Debe ser un import de namespace.
import * as copyStreams from 'pg-copy-streams';
import {
  SECONDARY_INDEXES,
  SESSION_TUNING,
  copyIntoStagingSql,
  countMissingSql,
  createStagingTableSql,
  dropStagingTableSql,
  markMissingSql,
  mergeChunkSql,
  stagingTableName,
} from './sql/import.sql';
import { MERGE_CHUNKS } from '../imports.constants';

export interface MergeTotals {
  inserted: number;
  updated: number;
}

/**
 * Conexión dedicada para un job de import.
 *
 * Es un `pg.Client` propio y no una conexión del pool de TypeORM por dos
 * motivos: el `COPY` mantiene la conexión ocupada en una sentencia durante
 * minutos, y los ajustes de sesión (`synchronous_commit = off`, etc.) no deben
 * filtrarse al resto de la aplicación.
 */
export class ImportPgSession {
  private readonly logger = new Logger(ImportPgSession.name);
  private client: Client;
  readonly table: string;

  constructor(private readonly jobId: string) {
    this.table = stagingTableName(jobId);
  }

  async connect(): Promise<void> {
    this.client = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT, 10) || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'app_db',
    });
    await this.client.connect();
    for (const stmt of SESSION_TUNING) {
      await this.client.query(stmt);
    }
  }

  /**
   * Toma un lock consultivo a nivel de SESIÓN mientras dura el job.
   *
   * Postgres lo libera solo cuando la conexión se cierra —incluido el caso en
   * que el proceso muere—, que es justo la semántica que hace falta: al
   * arrancar, otra instancia puede distinguir "este job está vivo en otro
   * proceso" de "este job quedó colgado" simplemente intentando tomar el lock.
   */
  async acquireJobLock(): Promise<boolean> {
    const { rows } = await this.client.query(
      'SELECT pg_try_advisory_lock(hashtext($1)::bigint) AS ok',
      [`import_job:${this.jobId}`],
    );
    return rows[0]?.ok === true;
  }

  async createStaging(): Promise<void> {
    await this.client.query(dropStagingTableSql(this.table));
    await this.client.query(createStagingTableSql(this.table));
  }

  /**
   * Abre el `COPY ... FROM STDIN` y devuelve un escritor que respeta la
   * contrapresión.
   *
   * Este es EL punto donde este tipo de importadores se cae por falta de
   * memoria. `write()` devuelve `false` cuando el buffer del socket está lleno;
   * si se ignora, el parser de Excel sigue produciendo filas a más velocidad de
   * la que Postgres las consume y la diferencia se acumula, sin límite y sin
   * síntoma visible salvo que "el COPY tiene una fuga de memoria".
   *
   * Al esperar el evento `drain` desde dentro del `for await` que recorre las
   * filas, se suspende toda la cadena de arriba —incluidas la descompresión del
   * ZIP y el parseo del XML— porque el iterador no se vuelve a consultar hasta
   * volver del await.
   */
  beginCopy(): CopyWriter {
    const stream: any = this.client.query(
      (copyStreams as any).from(copyIntoStagingSql(this.table)),
    );

    // El error debe capturarse ANTES del bucle: si la conexión se corta a mitad,
    // un `await once(stream, 'drain')` se quedaría esperando para siempre.
    //
    // Se registra UNA sola promesa de rechazo en vez de un `once(stream,'error')`
    // dentro de cada espera: con cientos de miles de `drain`, esa segunda forma
    // añadiría un listener por iteración y acabaría en un aviso de fuga.
    let failure: Error | null = null;
    let rejectOnError: (err: Error) => void;
    const errorPromise = new Promise<never>((_, reject) => {
      rejectOnError = reject;
    });
    errorPromise.catch(() => undefined); // evita un unhandledRejection si nadie la espera
    stream.on('error', (err: Error) => {
      failure = err;
      rejectOnError(err);
    });

    return {
      async write(text: string): Promise<void> {
        if (failure) throw failure;
        if (!stream.write(text)) {
          await Promise.race([once(stream, 'drain'), errorPromise]);
        }
      },
      async finish(): Promise<number> {
        if (failure) throw failure;
        stream.end();
        await Promise.race([once(stream, 'finish'), errorPromise]);
        if (failure) throw failure;
        return Number(stream.rowCount ?? 0);
      },
    };
  }

  /**
   * Sin esto el planner no tiene estadísticas del staging (reltuples = -1 en
   * PG16) y elige un nested loop sobre la PK para el merge, convirtiendo un
   * hash join de un minuto en horas. Cuesta un par de segundos.
   */
  async analyzeStaging(): Promise<void> {
    await this.client.query(`ANALYZE ${this.table}`);
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
    try {
      await this.client.query(dropStagingTableSql(this.table));
    } catch (err) {
      this.logger.warn(`No se pudo borrar el staging ${this.table}: ${(err as Error).message}`);
    }
  }

  async close(): Promise<void> {
    try {
      await this.client?.end();
    } catch {
      /* la conexión ya estaba caída */
    }
  }
}

export interface CopyWriter {
  write(text: string): Promise<void>;
  finish(): Promise<number>;
}
