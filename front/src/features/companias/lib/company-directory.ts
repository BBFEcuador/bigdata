import type { CompaniaResumen } from '../api/companias.types'

export function subjectKey(subject: CompaniaResumen, index = 0): string {
  return subject.id ?? subject.expediente ?? subject.ruc ?? `${subject.nombre}-${index}`
}

export function subjectCursor(subject: CompaniaResumen | undefined): string | null {
  if (!subject) return null
  return subject.id ?? subject.expediente ?? subject.ruc ?? null
}

export function subjectTypeLabel(type: string | null): string {
  const labels: Record<string, string> = {
    compania: 'Compañía supervisada',
    sociedad: 'Sociedad',
    sociedad_no_supervisada: 'Sociedad no supervisada',
    natural_contable: 'Persona natural · contabilidad',
    natural_no_contable: 'Persona natural',
    persona_natural: 'Persona natural',
  }
  return type ? labels[type] ?? type.replace(/_/g, ' ') : 'Sujeto económico'
}

export function subjectStatus(subject: CompaniaResumen): string {
  return subject.estadoContribuyente ?? subject.sriEstadoContribuyente ?? subject.situacionLegal ?? 'Sin estado'
}

export function subjectStatusTone(subject: CompaniaResumen): 'success' | 'warning' | 'destructive' | 'outline' {
  const status = subjectStatus(subject).toUpperCase()
  if (status.includes('ACTIV') || status.includes('VIGENTE')) return 'success'
  if (status.includes('SUSPEND')) return 'warning'
  if (status.includes('PASIV') || status.includes('DISUEL') || status.includes('CANCEL')) {
    return 'destructive'
  }
  return 'outline'
}

export function subjectLocation(subject: CompaniaResumen): string {
  return [subject.provincia, subject.canton ?? subject.ciudad].filter(Boolean).join(' · ') ||
    subject.jurisdiccion ||
    'Ubicación no disponible'
}

export function subjectActivity(subject: CompaniaResumen): string {
  return subject.actividad ?? subject.ciiuNivel6 ?? subject.ciiuNivel1 ?? 'Actividad no clasificada'
}

export function subjectAccountingObligation(subject: CompaniaResumen): boolean | null {
  return subject.obligadoContabilidad ?? subject.sriObligadoContabilidad ?? null
}

export function subjectRetentionAgent(subject: CompaniaResumen): boolean | null {
  return subject.agenteRetencion ?? subject.sriAgenteRetencion ?? null
}

export function subjectSpecialTaxpayer(subject: CompaniaResumen): boolean | null {
  return subject.contribuyenteEspecial ?? subject.sriContribuyenteEspecial ?? null
}

export function subjectEstablishments(subject: CompaniaResumen): number | null {
  return subject.numEstablecimientos ?? subject.sriNumEstablecimientos ?? null
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return 'No disponible'
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value
  const date = new Date(dateOnly)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return new Intl.DateTimeFormat('es-EC', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'No disponible'
  return new Intl.NumberFormat('es-EC', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export function yesNo(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return 'No informado'
  return value ? 'Sí' : 'No'
}

export function newestExportYear(subject: CompaniaResumen): number | null {
  const years = [
    ...(subject.exportadorBienesIrAnios ?? []),
    ...(subject.exportadorBienesIvaAnios ?? []),
    ...(subject.exportadorServiciosIvaAnios ?? []),
  ]
  return years.length > 0 ? Math.max(...years) : null
}

export function subjectTrackingType(
  subject: CompaniaResumen,
): 'compania' | 'persona_natural' | 'sociedad_no_supervisada' {
  if (subject.tipo?.includes('natural')) return 'persona_natural'
  if (subject.tipo?.includes('sociedad_no_supervisada')) return 'sociedad_no_supervisada'
  return 'compania'
}
