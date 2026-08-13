export const BALANCES_READ_REPOSITORY = Symbol('BALANCES_READ_REPOSITORY');

/** Consulta independiente del transporte HTTP. */
export interface BalancesQuery {
  anio?: number;
  nombre?: string;
  ruc?: string;
  rama?: string;
  cursor?: string;
  limit?: number;
}

/** Puerto de las proyecciones de lectura financiera. */
export interface BalancesReadRepository {
  list(query: BalancesQuery): Promise<Record<string, unknown>>;
  summary(): Promise<Record<string, unknown>[]>;
  comparative(expediente: string): Promise<Record<string, unknown>>;
  statements(
    expediente: string,
    formulario?: number,
  ): Promise<Record<string, unknown>>;
  indicators(expediente: string): Promise<Record<string, unknown>>;
  detail(
    expediente: string,
    anio: number,
    formulario?: number,
  ): Promise<Record<string, unknown>>;
}

export const BALANCES_PERCENTILES_REPOSITORY = Symbol(
  'BALANCES_PERCENTILES_REPOSITORY',
);

export interface BalancesPercentilesRepository {
  solicitar(motivo: string): void;
  recalcular(): Promise<Record<string, number>>;
  sector(anio: number, codigo: string): Promise<Record<string, unknown>>;
  sectorial(expediente: string): Promise<Record<string, unknown>>;
}
