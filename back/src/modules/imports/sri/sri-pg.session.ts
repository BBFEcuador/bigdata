import { CopyWriter, PgCopySession } from '../pg/pg-copy.session';
import {
  copyIntoSriSql,
  createStagingSriSql,
  enriquecerCompaniasSql,
  estadisticasSql,
  indicesStagingSql,
  mergeEstablecimientosSql,
  mergePersonasSql,
  mergeSociedadesNoSupervisadasSql,
  rucAmbiguosSql,
  stagingSriTable,
} from './sql/sri.sql';

export interface Totales {
  insertadas: number;
  actualizadas: number;
}

const totales = (
  fila: Record<string, string> | undefined,
  k1: string,
  k2: string,
): Totales => ({
  insertadas: Number(fila?.[k1] ?? 0),
  actualizadas: Number(fila?.[k2] ?? 0),
});

/** Conexión dedicada al import del padrón del SRI. */
export class SriPgSession extends PgCopySession {
  readonly tabla: string;

  constructor(jobId: string) {
    super(jobId);
    this.tabla = stagingSriTable(jobId);
  }

  async createStaging(): Promise<void> {
    await this.dropTable(this.tabla);
    await this.client.query(createStagingSriSql(this.tabla));
  }

  beginCopyStaging(): CopyWriter {
    return this.beginCopy(copyIntoSriSql(this.tabla));
  }

  /**
   * Índices y estadísticas del staging. Sin `ANALYZE`, el planner cree que la
   * tabla está vacía (reltuples = -1 en PG16) y elige nested loops para los
   * merges, convirtiendo minutos en horas.
   */
  async prepararStaging(): Promise<void> {
    for (const sql of indicesStagingSql(this.tabla)) {
      await this.client.query(sql);
    }
    await this.analyze(this.tabla);
  }

  async estadisticas(soloPersonas = false, provincia?: string) {
    const { rows } = await this.client.query(
      estadisticasSql(this.tabla, soloPersonas, provincia),
      provincia ? [provincia] : [],
    );
    const r = rows[0] ?? {};
    return {
      filas: Number(r.filas ?? 0),
      rucs: Number(r.rucs ?? 0),
      personas: Number(r.personas ?? 0),
      sociedades: Number(r.sociedades ?? 0),
      sociedadesSupercias: Number(r.sociedades_supercias ?? 0),
    };
  }

  async rucAmbiguos(): Promise<string[]> {
    const { rows } = await this.client.query(rucAmbiguosSql(this.tabla));
    return rows.map((r: { ruc: string }) => r.ruc);
  }

  async mergePersonas(provincia?: string): Promise<Totales> {
    // Un RUC puede cambiar de obligado a no obligado entre dos padrones. La
    // clasificación forma parte de la identidad lógica y debe quedar una sola
    // vez en la población correcta.
    await this.client.query(
      `
      DELETE FROM contribuyentes c
       USING (
         SELECT DISTINCT ON (ruc) ruc,
                CASE WHEN obligado_contabilidad IS TRUE
                     THEN 'natural_contable' ELSE 'natural_no_contable' END AS tipo
           FROM ${this.tabla}
          WHERE tipo_contribuyente = 'PERSONA NATURAL'
            ${provincia ? 'AND upper(trim(provincia)) = upper(trim($1))' : ''}
          ORDER BY ruc, numero_establecimiento
       ) s
       WHERE c.ruc = s.ruc
         AND c.tipo IN ('natural_contable', 'natural_no_contable')
         AND c.tipo <> s.tipo
    `,
      provincia ? [provincia] : [],
    );
    const { rows } = await this.client.query(
      mergePersonasSql(this.tabla, provincia),
      provincia ? [this.jobId, provincia] : [this.jobId],
    );
    return totales(rows[0], 'insertadas', 'actualizadas');
  }

  async mergeSociedadesNoSupervisadas(provincia?: string): Promise<Totales> {
    const { rows } = await this.client.query(
      mergeSociedadesNoSupervisadasSql(this.tabla, provincia),
      provincia ? [this.jobId, provincia] : [this.jobId],
    );
    return totales(rows[0], 'insertadas', 'actualizadas');
  }

  async enriquecerCompanias(): Promise<number> {
    const res = await this.client.query(enriquecerCompaniasSql(this.tabla), [
      this.jobId,
    ]);
    return res.rowCount ?? 0;
  }

  async mergeEstablecimientos(
    soloPersonas = false,
    provincia?: string,
  ): Promise<Totales> {
    const { rows } = await this.client.query(
      mergeEstablecimientosSql(this.tabla, soloPersonas, provincia),
      provincia ? [this.jobId, provincia] : [this.jobId],
    );
    return totales(rows[0], 'insertados', 'actualizados');
  }

  async vacuumAnalyze(): Promise<void> {
    for (const t of ['contribuyentes', 'establecimiento']) {
      await this.client.query(`VACUUM (ANALYZE) ${t}`);
    }
  }

  async dropStaging(): Promise<void> {
    await this.dropTable(this.tabla);
  }
}
