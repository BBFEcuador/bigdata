import api from './api'

/**
 * Quién firma las acciones.
 *
 * El backend rechaza toda escritura sin `X-Usuario`, así que la pantalla pide
 * un nombre y lo guarda aquí. Es un apaño mientras no haya autenticación, pero
 * es honesto: una columna de auditoría que admite anónimos no audita nada.
 */
export const usuarioActual = () => localStorage.getItem('usuario') ?? ''
export const fijarUsuario = (value: string) => localStorage.setItem('usuario', value)

const firma = () => ({ headers: { 'X-Usuario': usuarioActual() } })

export type TipoSujeto = 'compania' | 'persona_natural' | 'sociedad_no_supervisada'
export type EstadoScraping = 'encolado' | 'corriendo' | 'pausado' | 'completado' | 'fallido' | 'cancelado'
export type AccionScraping = 'pausar' | 'reanudar' | 'cancelar' | 'reintentar'

export type CrearJobInput = {
  tipoSujeto: TipoSujeto
  clave: string
  fuente?: string
  prioridad?: number
  parametros?: Record<string, unknown>
}

type JobLiveState = {
  estado: EstadoScraping
  accion_solicitada?: AccionScraping | null
  intentos: number
  max_intentos: number
  proximo_intento_en?: string | null
}

export const listarJobs = (params: Record<string, unknown>) =>
  api.get('/scraping', { params: limpiar(params) }).then(r => r.data)

export const obtenerResumen = () => api.get('/scraping/resumen').then(r => r.data)

export const listarFuentes = () => api.get('/scraping/fuentes').then(r => r.data)

export const obtenerJob = (id: string) => api.get(`/scraping/${id}`).then(r => r.data)

export const obtenerResultados = (id: string) => api.get(`/scraping/${id}/resultados`).then(r => r.data)

export const jobsDeSujeto = (tipoSujeto: TipoSujeto, clave: string) =>
  api.get(`/scraping/sujeto/${tipoSujeto}/${encodeURIComponent(clave)}`).then(r => r.data)

export const crearJob = (datos: CrearJobInput) => api.post('/scraping', datos, firma()).then(r => r.data)

/** El alta masiva puede tardar sobre un millón de filas: sin timeout. */
export const encolarMasivo = (datos: Record<string, unknown>) =>
  api.post('/scraping/masivo', datos, { ...firma(), timeout: 0 }).then(r => r.data)

/**
 * El cuerpo vacío es `{}` y no `null`: con `Content-Type: application/json`,
 * axios serializa `null` como la cadena literal `"null"`, y el body-parser de
 * Express la rechaza con un 400 antes de que la petición llegue al controlador.
 */
export const accionar = (id: string, accion: AccionScraping) =>
  api.post(`/scraping/${id}/${accion}`, {}, firma()).then(r => r.data)

/** Fuera los filtros vacíos: `?estado=` sería un valor inválido, no "sin filtro". */
function limpiar(params: Record<string, unknown> = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined),
  )
}

/**
 * Las tres poblaciones rastreables, con la misma convención que la capa
 * comercial: `clave` es el expediente para una compañía y el RUC para las otras
 * dos, porque el SRI no conoce el expediente.
 */
export const ETIQUETA_SUJETO: Record<TipoSujeto, string> = {
  compania: 'Compañía',
  persona_natural: 'Persona natural',
  sociedad_no_supervisada: 'Sociedad no supervisada',
}

export const TIPOS_SUJETO = Object.keys(ETIQUETA_SUJETO)

export const ETIQUETA_ESTADO: Record<EstadoScraping, string> = {
  encolado: 'En cola',
  corriendo: 'Corriendo',
  pausado: 'Pausado',
  completado: 'Completado',
  fallido: 'Fallido',
  cancelado: 'Cancelado',
}

export const ESTADOS = Object.keys(ETIQUETA_ESTADO)

/**
 * Qué botones tiene sentido ofrecer en cada estado.
 *
 * Es la misma tabla que el backend usa en el `WHERE` de cada UPDATE. Aquí sólo
 * decide qué se pinta: si se desincronizan, el backend responde 409 y la
 * pantalla lo muestra — nunca escribe algo que no debía.
 */
export const ACCIONES_POR_ESTADO: Record<EstadoScraping, AccionScraping[]> = {
  encolado: ['pausar', 'cancelar'],
  corriendo: ['pausar', 'cancelar'],
  pausado: ['reanudar', 'cancelar'],
  fallido: ['reintentar'],
  cancelado: ['reintentar'],
  completado: [],
}

export const ETIQUETA_ACCION: Record<AccionScraping, string> = {
  pausar: 'Pausar',
  reanudar: 'Reanudar',
  cancelar: 'Cancelar',
  reintentar: 'Reintentar',
}

/**
 * Lo que se pinta en la columna de estado.
 *
 * «Pausando…» y «Reintento 2/3» NO son estados de la base: son este estado más
 * lo que ya está en la fila. Guardarlos como estados propios habría duplicado
 * el enum y dejado jobs en un limbo ambiguo tras una caída.
 */
export function etiquetaViva(j: JobLiveState) {
  if (j.estado === 'corriendo' && j.accion_solicitada === 'pausar') return 'Pausando…'
  if (j.estado === 'corriendo' && j.accion_solicitada === 'cancelar') return 'Cancelando…'
  if (j.estado === 'encolado' && j.intentos > 0) {
    return `Reintento ${j.intentos}/${j.max_intentos}`
  }
  return ETIQUETA_ESTADO[j.estado] ?? j.estado
}

/** «en 45 s» para un reintento programado; nada si ya toca. */
export function esperaRestante(j: JobLiveState) {
  if (j.estado !== 'encolado' || !j.proximo_intento_en) return null
  const s = Math.round((new Date(j.proximo_intento_en).getTime() - Date.now()) / 1000)
  if (s <= 0) return null
  return s < 60 ? `en ${s} s` : `en ${Math.round(s / 60)} min`
}
