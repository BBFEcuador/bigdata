import api from './api'

/** Consulta del catálogo de cuentas. */

const limpiar = params =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  )

export const listarCuentas = (params = {}) =>
  api.get('/catalogo-cuentas', { params: limpiar(params) }).then(r => r.data)

export const obtenerResumen = () => api.get('/catalogo-cuentas/resumen').then(r => r.data)

export const obtenerCuenta = codigo =>
  api.get(`/catalogo-cuentas/${codigo}`).then(r => r.data)
