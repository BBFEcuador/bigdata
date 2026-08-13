// Adaptador temporal para imports legacy. El código nuevo debe importar desde
// `features/companias/api` directamente.
export { listarCompanias, obtenerFacetas, obtenerFicha } from '../features/companias/api/companias.api'

import { httpClient } from '../shared/api/http-client'

export async function obtenerCompania(expediente: string): Promise<unknown> {
  const response = await httpClient.get<unknown>(`/companias/${expediente}`)
  return response.data
}
