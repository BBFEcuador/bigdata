export type FinancialValue = number | null
export type IndicatorFormat = 'ratio' | 'pct' | 'dinero'
export type IndicatorDirection = 'alto' | 'bajo' | 'neutro'
export type IndicatorGroupId = 'liquidez' | 'solvencia' | 'gestion' | 'rentabilidad'

export type BalanceFilters = {
  anio: string
  nombre: string
  ruc: string
  rama: string
}

export type BalanceQuery = Partial<BalanceFilters> & {
  cursor?: string
  limit?: number
}

export type BalanceListItem = {
  anio: number
  formulario: number
  expediente: string
  ruc: string | null
  nombre: string | null
  ramaActividad: string | null
  descripcionRama: string | null
  ciiu: string | null
}

export type BalanceListResult = {
  datos: BalanceListItem[]
  cursorSiguiente: string | null
}

export type BalanceYearSummary = {
  anio: number
  balances: number
  celdas: number
  formularios: Array<{ formulario: number; balances: number }>
}

export type ComparativeConcept = {
  clave: string
  etiqueta: string
  bloque: 'situacion' | 'resultados' | string
  valores: number[]
}

export type ComparableSummary = {
  expediente: string
  ruc: string | null
  nombre: string | null
  ramaActividad: string | null
  descripcionRama: string | null
  ciiu: string | null
  anios: number[]
  formularios: number[]
  conceptos: ComparativeConcept[]
}

export type FinancialAccount = {
  codigo: string
  nombre: string
  nivel: number
  esHoja: boolean
  valores: number[]
}

export type FinancialStatements = {
  expediente: string
  ruc: string | null
  nombre: string | null
  formulario: number
  formulariosDisponibles: number[]
  anios: number[]
  cuentas: FinancialAccount[]
}

export type IndicatorGroup = { id: IndicatorGroupId; titulo: string }

export type FinancialIndicator = {
  clave: string
  etiqueta: string
  grupo: IndicatorGroupId
  formato: IndicatorFormat
  valores: FinancialValue[]
}

export type FinancialIndicators = {
  expediente: string
  ruc: string | null
  nombre: string | null
  ramaActividad: string | null
  descripcionRama: string | null
  anios: number[]
  formularios: number[]
  grupos: IndicatorGroup[]
  indicadores: FinancialIndicator[]
}

export type SectorCut = {
  n: number
  p10: FinancialValue
  p25: FinancialValue
  p50: FinancialValue
  p75: FinancialValue
  p90: FinancialValue
}

export type SectorIndicator = FinancialIndicator & {
  mejor: IndicatorDirection
  percentiles: FinancialValue[]
  cortes: Array<SectorCut | null>
}

export type PeerSector = {
  anio: number
  nivel: 'division' | 'seccion'
  codigo: string
  nombre: string | null
}

export type SectorComparison = {
  expediente: string
  ruc: string | null
  nombre: string | null
  ramaActividad: string | null
  descripcionRama: string | null
  ciiu: string | null
  anios: number[]
  sectores: PeerSector[]
  grupos: IndicatorGroup[]
  indicadores: SectorIndicator[]
}

export type SelectedCompany = {
  expediente: string
  nombre: string
  ruc: string | null
  rama: string | null
}

export type FinancialAnalysis = {
  empresa: SelectedCompany
  estados: FinancialStatements
  indicadores: FinancialIndicators
  resumen: ComparableSummary
  sectorial: SectorComparison | null
}
