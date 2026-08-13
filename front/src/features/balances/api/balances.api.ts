import { httpClient } from '../../../shared/api/http-client'
import { compactQuery } from '../../../shared/api/query-params'
import type {
  BalanceListResult,
  BalanceQuery,
  BalanceYearSummary,
  ComparableSummary,
  FinancialIndicators,
  FinancialStatements,
  SectorComparison,
} from './balances.types'

export async function listBalances(params: BalanceQuery = {}): Promise<BalanceListResult> {
  const response = await httpClient.get<BalanceListResult>('/balances', {
    params: compactQuery(params),
  })
  return response.data
}

export async function getBalancesSummary(): Promise<BalanceYearSummary[]> {
  const response = await httpClient.get<BalanceYearSummary[]>('/balances/resumen')
  return response.data
}

export async function getComparableSummary(expediente: string): Promise<ComparableSummary> {
  const response = await httpClient.get<ComparableSummary>(`/balances/${expediente}`)
  return response.data
}

export async function getFinancialStatements(
  expediente: string,
  formulario?: number,
): Promise<FinancialStatements> {
  const response = await httpClient.get<FinancialStatements>(`/balances/${expediente}/estados`, {
    params: compactQuery({ formulario }),
  })
  return response.data
}

export async function getFinancialIndicators(expediente: string): Promise<FinancialIndicators> {
  const response = await httpClient.get<FinancialIndicators>(`/balances/${expediente}/indicadores`)
  return response.data
}

export async function getSectorComparison(expediente: string): Promise<SectorComparison> {
  const response = await httpClient.get<SectorComparison>(`/balances/${expediente}/sectorial`)
  return response.data
}
