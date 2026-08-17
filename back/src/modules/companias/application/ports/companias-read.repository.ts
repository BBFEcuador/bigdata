export const COMPANIAS_READ_REPOSITORY = Symbol('COMPANIAS_READ_REPOSITORY');

export const POBLACIONES_COMPANIAS = [
  'companies',
  'natural_contable',
  'natural_no_contable',
  'sociedad_no_supervisada',
] as const;

export type PoblacionCompanias = (typeof POBLACIONES_COMPANIAS)[number];

/** Consulta independiente del transporte HTTP. */
export interface CompaniasQuery {
  poblacion?: PoblacionCompanias;
  nombre?: string;
  ruc?: string;
  provincia?: string;
  canton?: string;
  situacionLegal?: string;
  tipo?: string;
  ciiuNivel1?: string;
  ciiu?: string;
  catastro?: string;
  catastroAnio?: number;
  incluirAusentes?: string;
  cursor?: string;
  limit?: number;
}

/** Proyección de lectura: no expone entidad ni tipos de TypeORM. */
export interface CompaniaReadModel {
  id: string;
  tipo: string;
  expediente: string | null;
  ruc: string | null;
  nombre: string;
  provincia?: string | null;
  canton?: string | null;
  estadoContribuyente?: string | null;
  ciiuNivel6?: string | null;
}

export interface CompaniaConActividad extends CompaniaReadModel {
  actividad: string | null;
}

export interface ConteoAcotado {
  valor: number;
  exacto: boolean;
}

export interface Faceta {
  valor: string;
  n: number;
}

export interface FacetasCompanias {
  provincias: Faceta[];
  situaciones: Faceta[];
  tipos: Faceta[];
  poblaciones: Faceta[];
  aniosCatastro: Record<string, number[]>;
}

export interface FichaRelaciones {
  establecimientos: Record<string, unknown>[];
  ejercicios: Array<{ anio: string | number; formulario: string | number }>;
  turismo: Record<string, unknown>[];
  catastros: Record<string, unknown>[];
}

export interface CompaniasReadRepository {
  findPage(query: CompaniasQuery, limit: number): Promise<CompaniaReadModel[]>;
  countBounded(query: CompaniasQuery): Promise<ConteoAcotado>;
  findForExport(
    query: CompaniasQuery,
    limit: number,
  ): Promise<CompaniaReadModel[]>;
  findByExpedienteOrRuc(value: string): Promise<CompaniaReadModel | null>;
  findActivityNames(codigos: string[]): Promise<Map<string, string>>;
  findFichaRelaciones(
    ruc: string | null,
    expediente: string,
  ): Promise<FichaRelaciones>;
  findFacetas(): Promise<FacetasCompanias>;
}
