export type TotalConsulta = { exacto: boolean; valor: number }
export type Faceta = { valor: string; n: number }

export type FiltrosCompanias = {
  nombre: string
  ruc: string
  provincia: string
  situacionLegal: string
  poblacion: string
  ciiu: string
  catastro: string
  catastroAnio: string
}

export type QueryCompanias = Partial<FiltrosCompanias> & {
  cursor?: string | null
  limit?: number
}

export type CompaniaResumen = {
  id?: string | null
  expediente: string | null
  ruc: string | null
  nombre: string
  jurisdiccion?: string | null
  estadoContribuyente?: string | null
  claseContribuyente?: string | null
  fechaInicioActividades?: string | null
  fechaActualizacion?: string | null
  fechaSuspensionDefinitiva?: string | null
  fechaReinicioActividades?: string | null
  obligadoContabilidad?: boolean | null
  agenteRetencion?: boolean | null
  contribuyenteEspecial?: boolean | null
  numEstablecimientos?: number | null
  situacionLegal: string | null
  sriEstadoContribuyente: string | null
  sriClaseContribuyente?: string | null
  sriFechaInicioActividades?: string | null
  sriObligadoContabilidad?: boolean | null
  sriAgenteRetencion?: boolean | null
  sriContribuyenteEspecial?: boolean | null
  sriNombreComercial?: string | null
  representante: string | null
  cargo: string | null
  telefono: string | null
  tipo: string | null
  tipoCompania?: string | null
  pais?: string | null
  region?: string | null
  provincia: string | null
  canton: string | null
  ciudad?: string | null
  calle?: string | null
  numero?: string | null
  interseccion?: string | null
  barrio?: string | null
  sriParroquia: string | null
  capitalSuscrito: number | null
  fechaConstitucion: string | null
  sriNumEstablecimientos: number | null
  ultimoBalance?: number | null
  presentoBalanceInicial?: boolean | null
  fechaPresentacionBalanceInicial?: string | null
  turismoRegistros?: number | null
  turismoActividades?: string[] | null
  turismoClasificaciones?: string[] | null
  turismoRatificado?: boolean | null
  exportadorBienesIrAnios?: number[] | null
  exportadorBienesIvaAnios?: number[] | null
  exportadorServiciosIvaAnios?: number[] | null
  ciiuNivel1?: string | null
  ciiuNivel6: string | null
  actividad: string | null
  sriJobId?: string | null
  turismoJobId?: string | null
  catastrosJobId?: string | null
  rowHash?: string | null
  primerJobId?: string | null
  ultimoJobId?: string | null
  ausenteDesdeJob?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export type ResultadoCompanias = {
  datos: CompaniaResumen[]
  cursorSiguiente?: string | null
  hayMas: boolean
  total: TotalConsulta | null
}

export type FacetasCompanias = {
  provincias: Faceta[]
  situaciones: Faceta[]
  tipos: Faceta[]
  poblaciones: Faceta[]
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
