export const CIIU_READ_REPOSITORY = Symbol('CIIU_READ_REPOSITORY');

/** Consulta independiente del transporte HTTP. */
export interface CiiuQuery {
  q?: string;
  nivel?: number;
  soloHojas?: string;
  limit?: number;
  incluirAusentes?: string;
  conConteo?: string;
}

/** Proyección de lectura: no expone la entidad ni tipos de TypeORM. */
export interface ActividadCiiuReadModel {
  codigo: string;
  nombre: string;
  codigoSupercias: string | null;
  codigoPadre: string | null;
  nivel: number;
  nivelNombre: string;
  esHoja: boolean;
  longitud: number;
  aplicacion: string | null;
  rowHash: string;
  primerJobId: string | null;
  ultimoJobId: string | null;
  ausenteDesdeJob: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActividadCiiuConCompanias extends ActividadCiiuReadModel {
  companias: number | null;
}

export interface ResumenCiiu {
  total: number;
  vigentes: number;
  raices: number;
  hojas: number;
  nivelMax: number;
}

export interface CiiuReadRepository {
  findMany(query: CiiuQuery): Promise<ActividadCiiuReadModel[]>;
  findByCodigo(codigo: string): Promise<ActividadCiiuReadModel | null>;
  findChildren(codigoPadre: string): Promise<ActividadCiiuReadModel[]>;
  findCompanyCounts(): Promise<Map<string, number>>;
  countCompaniesByCode(codigo: string): Promise<number>;
  getSummary(): Promise<ResumenCiiu>;
}
