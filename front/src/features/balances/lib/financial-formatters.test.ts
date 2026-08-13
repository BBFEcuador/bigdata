import { describe, expect, it } from 'vitest'
import {
  formatIndicator,
  formatVariation,
  percentageVariation,
  percentileClass,
  variationClass,
} from './financial-formatters'

describe('financial formatters', () => {
  it('does not invent values when data is absent', () => {
    expect(formatIndicator(null, 'dinero')).toBe('—')
    expect(formatIndicator(null, 'ratio')).toBe('—')
  })

  it('formats ratios and percentages according to their financial meaning', () => {
    expect(formatIndicator(1.234, 'ratio')).toBe('1.23')
    expect(formatIndicator(0.125, 'pct')).toBe('12.5 %')
  })

  it('does not express zero bases or sign changes as percentage variation', () => {
    expect(percentageVariation(0, 10)).toBeNull()
    expect(percentageVariation(-10, 10)).toBeNull()
    expect(percentageVariation(10, -10)).toBeNull()
  })

  it('calculates and classifies comparable variations', () => {
    const increase = percentageVariation(100, 125)
    const decrease = percentageVariation(100, 75)
    expect(increase).toBe(25)
    expect(decrease).toBe(-25)
    expect(formatVariation(increase)).toBe('+25.0 %')
    expect(variationClass(increase)).toBe('sube')
    expect(variationClass(decrease)).toBe('baja')
  })

  it('interprets percentiles using the direction of each indicator', () => {
    expect(percentileClass(90, 'alto')).toBe('bien')
    expect(percentileClass(90, 'bajo')).toBe('mal')
    expect(percentileClass(90, 'neutro')).toBe('')
    expect(percentileClass(null, 'alto')).toBe('')
  })
})
