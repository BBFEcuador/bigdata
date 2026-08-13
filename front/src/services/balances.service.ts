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

/** Estados financieros completos: todas las cuentas, un año por columna. */
export const obtenerEstados = (expediente, formulario = undefined) =>
  api
    .get(`/balances/${expediente}/estados`, { params: limpiar({ formulario }) })
    .then(r => r.data)

/** Indicadores financieros de todos los ejercicios. */
export const obtenerIndicadores = expediente =>
  api.get(`/balances/${expediente}/indicadores`).then(r => r.data)

/** Posición de la compañía dentro de su sector, con los cortes del sector. */
export const obtenerSectorial = expediente =>
  api.get(`/balances/${expediente}/sectorial`).then(r => r.data)

/** Cortes de un sector completo, sin mirar a ninguna empresa. */
export const obtenerSector = (anio, codigo) =>
  api.get(`/balances/sectores/${anio}/${codigo}`).then(r => r.data)
