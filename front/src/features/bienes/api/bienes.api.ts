import { httpClient } from '../../../shared/api/http-client'
import { compactQuery } from '../../../shared/api/query-params'
import type { ResultadoBienes } from './bienes.types'

interface QueryBienes extends Record<string, string | number | undefined> {
  limitPropiedades?: number
  cursorPropiedades?: string
  limitVehiculos?: number
  cursorVehiculos?: string
}

export async function listarBienes(
  contribuyenteId: string,
  query: QueryBienes = {},
): Promise<ResultadoBienes> {
  const response = await httpClient.get<ResultadoBienes>(
    `/bienes/contribuyente/${encodeURIComponent(contribuyenteId)}`,
    { params: compactQuery(query) },
  )
  return response.data
}
