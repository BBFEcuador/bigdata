import type { FinancialValue, IndicatorDirection, IndicatorFormat } from '../api/balances.types'

export function formatMoney(value: FinancialValue): string {
  return value === null
    ? '—'
    : value.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatIndicator(value: FinancialValue, format: IndicatorFormat): string {
  if (value === null) return '—'
  if (format === 'pct') return `${(value * 100).toFixed(1)} %`
  if (format === 'dinero') return formatMoney(value)
  return value.toFixed(2)
}

export function percentageVariation(before: FinancialValue, current: FinancialValue): number | null {
  if (before === null || current === null || before === 0) return null
  if ((before < 0 && current >= 0) || (before > 0 && current < 0)) return null
  return ((current - before) / Math.abs(before)) * 100
}

export function formatVariation(value: number | null): string {
  return value === null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(1)} %`
}

export function variationClass(value: number | null): string {
  if (value === null) return ''
  return value > 0.05 ? 'sube' : value < -0.05 ? 'baja' : ''
}

export function percentileClass(
  percentile: FinancialValue,
  direction: IndicatorDirection,
): string {
  if (percentile === null || direction === 'neutro') return ''
  const positive = direction === 'alto' ? percentile >= 75 : percentile <= 25
  const negative = direction === 'alto' ? percentile <= 25 : percentile >= 75
  return positive ? 'bien' : negative ? 'mal' : ''
}
