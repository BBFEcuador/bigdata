// Adaptador temporal para los informes legacy. Las pantallas nuevas importan
// directamente desde `features/balances/api`.
export {
  listBalances as listarBalances,
  getBalancesSummary as obtenerResumen,
  getComparableSummary as obtenerComparativo,
  getFinancialStatements as obtenerEstados,
  getFinancialIndicators as obtenerIndicadores,
  getSectorComparison as obtenerSectorial,
} from '../features/balances/api/balances.api'

import { httpClient } from '../shared/api/http-client'

export async function obtenerDetalle(expediente: string, anio: number): Promise<unknown> {
  const response = await httpClient.get<unknown>(`/balances/${expediente}/${anio}`)
  return response.data
}

export async function obtenerSector(anio: number, codigo: string): Promise<unknown> {
  const response = await httpClient.get<unknown>(`/balances/sectores/${anio}/${codigo}`)
  return response.data
}
