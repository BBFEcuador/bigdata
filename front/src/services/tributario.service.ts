import api from './api'

export const obtenerResumenTributario = () => api.get('/tributario/resumen').then(r => r.data)

export const listarRiesgo = params => api.get('/tributario/empresas', { params }).then(r => r.data)

export const listarUtilidadesNoDistribuidas = params =>
  api.get('/tributario/utilidades-no-distribuidas', { params }).then(r => r.data)

export const listarCreditoTributario = params =>
  api.get('/tributario/credito-tributario', { params }).then(r => r.data)

export const obtenerFichaTributaria = expediente =>
  api.get(`/tributario/empresas/${encodeURIComponent(expediente)}`).then(r => r.data)
