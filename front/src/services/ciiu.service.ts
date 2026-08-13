import api from './api'

/** Consulta del catálogo CIIU de actividades económicas. */

const limpiar = params =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  )

export const listarActividades = (params = {}) =>
  api.get('/ciiu', { params: limpiar(params) }).then(r => r.data)

export const obtenerResumenCiiu = () => api.get('/ciiu/resumen').then(r => r.data)

export const obtenerActividad = codigo => api.get(`/ciiu/${codigo}`).then(r => r.data)
