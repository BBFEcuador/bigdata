import { httpClient } from '../../../shared/api/http-client'
import { compactQuery } from '../../../shared/api/query-params'
import type { FacetasCompanias, FichaCompania, QueryCompanias, ResultadoCompanias } from './companias.types'

export async function listarCompanias(params: QueryCompanias = {}): Promise<ResultadoCompanias> {
  const response = await httpClient.get<ResultadoCompanias>('/companias', {
    params: compactQuery(params),
  })
  return response.data
}

export async function obtenerFacetas(): Promise<FacetasCompanias> {
  const response = await httpClient.get<FacetasCompanias>('/companias/facetas')
  return response.data
}

export async function obtenerFicha(expediente: string): Promise<FichaCompania> {
  const response = await httpClient.get<FichaCompania>(`/companias/${expediente}/ficha`)
  return response.data
}
