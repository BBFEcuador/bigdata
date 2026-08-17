import { httpClient } from '../../../shared/api/http-client'
import { compactQuery } from '../../../shared/api/query-params'
import type { ResultadoNomina } from './nomina.types'

type QueryNomina = Record<string, string | number | undefined> & {
  limit?: number
  cursor?: string
}

export async function listarNomina(
  contribuyenteId: string,
  query: QueryNomina = {},
): Promise<ResultadoNomina> {
  const response = await httpClient.get<ResultadoNomina>(
    `/nomina/contribuyente/${encodeURIComponent(contribuyenteId)}`,
    { params: compactQuery(query) },
  )
  return response.data
}
