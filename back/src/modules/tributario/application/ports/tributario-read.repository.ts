export const TRIBUTARIO_READ_REPOSITORY = Symbol('TRIBUTARIO_READ_REPOSITORY');

export type PoblacionRiesgo = 'comparable' | 'sin_utilidad' | 'sin_ingresos';
export type OrdenRiesgo = 'percentil' | 'brecha' | 'brecha_total';

export interface ConsultaRiesgo {
  anio?: number;
  poblacion: PoblacionRiesgo;
  persistencia?: number;
  rama?: string;
  q?: string;
  brechaMinima?: number;
  orden: OrdenRiesgo;
  limit: number;
  offset: number;
}

export interface ConsultaUtilidades {
  anio?: number;
  minimo?: number;
  rama?: string;
  q?: string;
  limit: number;
  offset: number;
}

export interface ConsultaCredito {
  soloComparables: boolean;
  minimo?: number;
  rama?: string;
  q?: string;
  limit: number;
  offset: number;
}

export interface ResumenTributario {
  porAnio: unknown[];
  persistencia: unknown;
  credito: unknown[];
  resoluciones: unknown[];
}

export interface ResultadoListadoRiesgo {
  datos: unknown[];
  total: number;
}

export interface ResultadoUtilidades {
  datos: unknown[];
  total: Record<string, unknown>;
  movimiento: Record<string, unknown>;
  tarifa: unknown[];
}

export interface MetadatosCredito {
  anios: number[];
  ultimo: number;
}

export interface ResultadoCredito {
  datos: unknown[];
  totales: Record<string, unknown>;
}

export interface FichaTributaria {
  empresa: Record<string, unknown>;
  ejercicios: unknown[];
  credito: unknown[];
  diagnostico: Record<string, unknown> | null;
  noDistribuidas: unknown[];
  tarifa: Record<string, unknown> | null;
  resoluciones: unknown[];
}

/** Puerto de lecturas tributarias; no expone TypeORM ni SQL. */
export interface TributarioReadRepository {
  getResumen(): Promise<ResumenTributario>;
  listarRiesgo(query: ConsultaRiesgo): Promise<ResultadoListadoRiesgo>;
  getUltimoAnioUtilidades(): Promise<number | null>;
  listarUtilidades(
    query: ConsultaUtilidades,
    ejercicio: number | null,
  ): Promise<ResultadoUtilidades>;
  getMetadatosCredito(): Promise<MetadatosCredito>;
  listarCredito(
    query: ConsultaCredito,
    ultimo: number | null,
  ): Promise<ResultadoCredito>;
  getFicha(expediente: string): Promise<FichaTributaria | null>;
}
