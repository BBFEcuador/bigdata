export const CATALOGO_READ_REPOSITORY = Symbol('CATALOGO_READ_REPOSITORY');
export const FORMULARIO_POR_DEFECTO = 1;

/** Consulta independiente del transporte HTTP. */
export interface CatalogoQuery {
  formulario?: number;
  q?: string;
  nivel?: number;
  soloHojas?: string;
  incluirAusentes?: string;
}

/** Proyección de lectura: no expone la entidad ni tipos de TypeORM. */
export interface CategoriaCuentaReadModel {
  formulario: number;
  codigo: string;
  nombre: string;
  codigoPadre: string | null;
  nivel: number;
  esHoja: boolean;
  longitud: number;
  rowHash: string;
  primerJobId: string | null;
  ultimoJobId: string | null;
  ausenteDesdeJob: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResumenCatalogo {
  total: number;
  vigentes: number;
  raices: number;
  hojas: number;
  nivelMax: number;
}

export interface CatalogoReadRepository {
  findMany(
    query: CatalogoQuery,
    formulario: number,
  ): Promise<CategoriaCuentaReadModel[]>;
  findByCodigo(
    codigo: string,
    formulario: number,
  ): Promise<CategoriaCuentaReadModel | null>;
  findChildren(
    codigoPadre: string,
    formulario: number,
  ): Promise<CategoriaCuentaReadModel[]>;
  getSummary(formulario: number): Promise<ResumenCatalogo>;
}
