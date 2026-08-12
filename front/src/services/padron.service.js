import api from './api'

/** Consulta del padrón del SRI. */

const limpiar = params =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  )

export const obtenerResumen = () => api.get('/padron/resumen').then(r => r.data)

export const listarProvincias = () => api.get('/padron/provincias').then(r => r.data)

export const listarPersonas = (params = {}) =>
  api.get('/padron/personas', { params: limpiar(params) }).then(r => r.data)

export const listarSociedadesNoSupervisadas = (params = {}) =>
  api
    .get('/padron/sociedades-no-supervisadas', { params: limpiar(params) })
    .then(r => r.data)

export const obtenerEstablecimientos = ruc =>
  api.get(`/padron/establecimientos/${ruc}`).then(r => r.data)
