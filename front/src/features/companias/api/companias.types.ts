export type TotalConsulta = { exacto: boolean; valor: number }
export type Faceta = { valor: string; n: number }

export type FiltrosCompanias = {
  nombre: string
  ruc: string
  provincia: string
  situacionLegal: string
  tipo: string
  ciiu: string
  catastro: string
  catastroAnio: string
}

export type QueryCompanias = Partial<FiltrosCompanias> & {
  cursor?: string | null
  limit?: number
}

export type CompaniaResumen = {
  expediente: string
  ruc: string | null
  nombre: string
  situacionLegal: string | null
  sriEstadoContribuyente: string | null
  representante: string | null
  cargo: string | null
  telefono: string | null
  tipo: string | null
  provincia: string | null
  canton: string | null
  sriParroquia: string | null
  capitalSuscrito: number | null
  fechaConstitucion: string | null
  sriNumEstablecimientos: number | null
  turismoRegistros?: number | null
  turismoActividades?: string[] | null
  turismoRatificado?: boolean | null
  exportadorBienesIrAnios?: number[] | null
  exportadorBienesIvaAnios?: number[] | null
  exportadorServiciosIvaAnios?: number[] | null
  ciiuNivel6: string | null
  actividad: string | null
}

export type ResultadoCompanias = {
  datos: CompaniaResumen[]
  hayMas: boolean
  total: TotalConsulta | null
}

export type FacetasCompanias = {
  provincias: Faceta[]
  situaciones: Faceta[]
  tipos: Faceta[]
  aniosCatastro?: Record<string, number[]>
}

export type RegistroCatastro = {
  catastro: string
  anio: number | string
}

export type RegistroTurismo = {
  numero_registro: string
  codigo_establecimiento: string | null
  nombre_comercial: string | null
  actividad: string | null
  clasificacion: string | null
  categoria: string | null
  canton: string | null
  direccion: string | null
  telefono: string | null
  correo: string | null
  estado_registro: string | null
}

export type EstablecimientoSri = {
  numero: string
  nombre_comercial: string | null
  estado: string | null
  provincia: string | null
  canton: string | null
  parroquia: string | null
  codigo_ciiu: string | null
  actividad: string | null
}

export type EjercicioCompania = { anio: number; formulario: number }

export type FichaCompania = {
  compania: CompaniaResumen & Record<string, unknown>
  ejercicios: EjercicioCompania[]
  turismo: RegistroTurismo[]
  catastros: RegistroCatastro[]
  establecimientos: EstablecimientoSri[]
}
