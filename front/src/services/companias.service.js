import api from './api'

/** Consulta de compañías. Las llamadas de importación viven en `imports.service.js`. */

const limpiar = params =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  )

export const listarCompanias = (params = {}) =>
  api.get('/companias', { params: limpiar(params) }).then(r => r.data)

export const obtenerFacetas = () => api.get('/companias/facetas').then(r => r.data)

export const obtenerCompania = expediente =>
  api.get(`/companias/${expediente}`).then(r => r.data)

/** Ficha completa: directorio, datos del SRI, establecimientos y ejercicios. */
export const obtenerFicha = expediente =>
  api.get(`/companias/${expediente}/ficha`).then(r => r.data)
