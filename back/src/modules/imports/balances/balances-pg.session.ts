import { Client } from 'pg';
import { MERGE_CHUNKS } from '../imports.constants';
import { codigosEcuacion } from '../../../common/finanzas/conceptos';
import { CopyWriter, PgCopySession } from '../pg/pg-copy.session';
import {
  borrarDetalleChunkSql,
  cambiadasTable,
  codigosDesconocidosSql,
  contarAusentesSql,
  contarDescuadresSql,
  contarHuerfanasSql,
  copyIntoBalanceSql,
  copyIntoCuentaSql,
  crearCambiadasSql,
  crearParticionSql,
  createStagingBalanceSql,
  createStagingCuentaSql,
  insertarDetalleChunkSql,
  marcarAusentesSql,
  mergeBalanceChunkSql,
  stagingBalanceTable,
  stagingCuentaTable,
} from './sql/balances.sql';

export interface TotalesBalance {
  inserted: number;
  updated: number;
}

/**
 * Conexión dedicada al import de balances.
 *
 * Dos stagings en vez de uno, porque el archivo viene en formato ancho y se
 * guarda en largo: una línea del .txt produce una cabecera y hasta 622 filas de
 * detalle, y cada destino tiene su propio `COPY` abierto a la vez.
 */
export class BalancesPgSession extends PgCopySession {
  readonly tablaBalance: string;
  readonly tablaCuenta: string;
  readonly tablaCambiadas: string;

  /**
   * Segunda conexión, sólo para el `COPY` del detalle.
   *
   * Postgres admite UN `COPY` activo por sesión. Como cada línea del archivo
   * alimenta a la vez la cabecera y el detalle, hacen falta dos conexiones; la
   * alternativa sería acumular las 151.674 cabeceras en memoria hasta terminar
   * el detalle, y eso vuelve a atar el consumo de memoria al tamaño del
   * archivo, que es justo lo que este importador evita.
   */
  private clienteCuenta: Client;

  constructor(jobId: string) {
    super(jobId);
    this.tablaBalance = stagingBalanceTable(jobId);
    this.tablaCuenta = stagingCuentaTable(jobId);
    this.tablaCambiadas = cambiadasTable(jobId);
  }

  async connect(): Promise<void> {
    await super.connect();
    this.clienteCuenta = await this.crearCliente();
  }

  async createStaging(): Promise<void> {
    await this.dropStaging();
    await this.client.query(createStagingBalanceSql(this.tablaBalance));
    await this.client.query(createStagingCuentaSql(this.tablaCuenta));
  }

  beginCopyBalance(): CopyWriter {
    return this.beginCopy(copyIntoBalanceSql(this.tablaBalance));
  }

  beginCopyCuenta(): CopyWriter {
    return this.beginCopy(copyIntoCuentaSql(this.tablaCuenta), this.clienteCuenta);
  }

  async close(): Promise<void> {
    try {
      await this.clienteCuenta?.end();
    } catch {
      /* ya estaba caída */
    }
    await super.close();
  }

  async analyzeStaging(): Promise<void> {
    await this.analyze(this.tablaBalance);
    await this.analyze(this.tablaCuenta);
  }

  async crearParticion(anio: number): Promise<void> {
    await this.client.query(crearParticionSql(anio));
  }

  /** Códigos del archivo que no están en `categoria_cuenta`. */
  async codigosDesconocidos(): Promise<string[]> {
    const { rows } = await this.client.query(codigosDesconocidosSql(this.tablaCuenta));
    return rows.map((r: { codigo_cuenta: string }) => r.codigo_cuenta);
  }

  async contarHuerfanas(): Promise<number> {
    const { rows } = await this.client.query(contarHuerfanasSql(this.tablaBalance));
    return Number(rows[0]?.huerfanas ?? 0);
  }

  /** Devuelve -1 si el formulario no tiene definida la ecuación contable. */
  async contarDescuadres(formulario: number): Promise<number> {
    const codigos = codigosEcuacion(formulario);
    if (codigos === null) return -1;
    const { rows } = await this.client.query(contarDescuadresSql(this.tablaCuenta), [
      formulario,
      codigos.activo,
      codigos.pasivo,
      codigos.patrimonio,
    ]);
    return Number(rows[0]?.descuadres ?? 0);
  }

  async contarAusentes(anio: number, formulario: number) {
    const { rows } = await this.client.query(contarAusentesSql(this.tablaBalance), [
      anio,
      formulario,
    ]);
    return { missing: Number(rows[0].missing), vivas: Number(rows[0].vivas) };
  }

  async marcarAusentes(anio: number, formulario: number): Promise<number> {
    const res = await this.client.query(marcarAusentesSql(this.tablaBalance), [
      anio,
      formulario,
      this.jobId,
    ]);
    return res.rowCount ?? 0;
  }

  /**
   * Marca qué balances cambian. Tiene que ejecutarse ANTES del merge: una vez
   * actualizadas las cabeceras, todos los hashes coinciden y no quedaría
   * ninguna diferencia que detectar.
   */
  async marcarCambiadas(): Promise<number> {
    await this.client.query(`DROP TABLE IF EXISTS ${this.tablaCambiadas}`);
    await this.client.query(crearCambiadasSql(this.tablaCambiadas, this.tablaBalance));
    await this.client.query(
      `CREATE INDEX ON ${this.tablaCambiadas} (anio, formulario, expediente)`,
    );
    await this.analyze(this.tablaCambiadas);
    const { rows } = await this.client.query(
      `SELECT count(*)::bigint AS n FROM ${this.tablaCambiadas}`,
    );
    return Number(rows[0].n);
  }

  /**
   * Merge por particiones: cabecera y detalle de cada porción en su propia
   * transacción. Así el progreso avanza de verdad, el WAL se libera de forma
   * incremental y un fallo sólo obliga a repetir esa porción.
   *
   * El orden dentro de cada chunk importa: primero se borra el detalle viejo y
   * se inserta el nuevo, y sólo después se sella la cabecera. Si se hiciera al
   * revés y el proceso muriera en medio, la cabecera diría "este balance ya está
   * actualizado" mientras el detalle seguiría siendo el del año pasado, y la
   * siguiente carga del mismo archivo no lo arreglaría: el hash ya coincidiría.
   */
  async merge(onChunk?: (done: number, total: number) => void): Promise<TotalesBalance> {
    const borrar = borrarDetalleChunkSql(this.tablaCambiadas);
    const insertar = insertarDetalleChunkSql(this.tablaCuenta, this.tablaCambiadas);
    const mergeCabecera = mergeBalanceChunkSql(this.tablaBalance);
    const totales: TotalesBalance = { inserted: 0, updated: 0 };

    for (let chunk = 0; chunk < MERGE_CHUNKS; chunk++) {
      await this.client.query('BEGIN');
      try {
        await this.client.query(borrar, [MERGE_CHUNKS, chunk]);
        await this.client.query(insertar, [MERGE_CHUNKS, chunk]);
        const { rows } = await this.client.query(mergeCabecera, [
          this.jobId,
          MERGE_CHUNKS,
          chunk,
        ]);
        await this.client.query('COMMIT');
        totales.inserted += Number(rows[0]?.inserted ?? 0);
        totales.updated += Number(rows[0]?.updated ?? 0);
      } catch (err) {
        await this.client.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
      onChunk?.(chunk + 1, MERGE_CHUNKS);
    }
    return totales;
  }

  async vacuumAnalyze(anio: number): Promise<void> {
    // Nunca FULL: reescribiría la tabla con un lock exclusivo.
    await this.client.query('VACUUM (ANALYZE) balance');
    await this.client.query(`VACUUM (ANALYZE) balance_cuenta_${anio}`);
  }

  async dropStaging(): Promise<void> {
    await this.dropTable(this.tablaCambiadas);
    await this.dropTable(this.tablaCuenta);
    await this.dropTable(this.tablaBalance);
  }
}
