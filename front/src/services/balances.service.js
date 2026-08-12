import api from './api'

/** Consulta de balances presentados. */

const limpiar = params =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  )

export const listarBalances = (params = {}) =>
  api.get('/balances', { params: limpiar(params) }).then(r => r.data)

export const obtenerResumen = () => api.get('/balances/resumen').then(r => r.data)

/** Serie histórica de las cuentas grandes de una compañía. */
export const obtenerComparativo = expediente =>
  api.get(`/balances/${expediente}`).then(r => r.data)

/** Balance completo de un ejercicio. */
export const obtenerDetalle = (expediente, anio) =>
  api.get(`/balances/${expediente}/${anio}`).then(r => r.data)
