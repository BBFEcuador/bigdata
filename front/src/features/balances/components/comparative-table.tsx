import type { ReactNode } from 'react'
import type { FinancialValue, IndicatorFormat } from '../api/balances.types'
import {
  formatIndicator,
  formatVariation,
  percentageVariation,
  variationClass,
} from '../lib/financial-formatters'

type YearHeaderProps = {
  years: readonly number[]
  forms?: readonly number[]
}

export function YearHeader({ years, forms }: YearHeaderProps) {
  const cells: ReactNode[] = []
  years.forEach((year, index) => {
    cells.push(
      <th key={`year-${year}`} className="derecha">
        {year}
        {forms && forms[index] !== 1 && <sup title="Formulario fiscal">F</sup>}
      </th>,
    )
    if (index < years.length - 1) {
      cells.push(
        <th key={`variation-${year}`} className="derecha var">
          {String(years[index + 1]).slice(2)}/{String(year).slice(2)}
        </th>,
      )
    }
  })
  return <tr><th>Concepto</th>{cells}</tr>
}

type ComparativeRowProps = {
  label: ReactNode
  values: readonly FinancialValue[]
  format: IndicatorFormat
  indentation?: number
  highlighted?: boolean
}

export function ComparativeRow({
  label,
  values,
  format,
  indentation = 0,
  highlighted = false,
}: ComparativeRowProps) {
  const cells: ReactNode[] = []
  values.forEach((value, index) => {
    cells.push(
      <td key={`value-${index}`} className="derecha mono">
        {formatIndicator(value, format)}
      </td>,
    )
    if (index < values.length - 1) {
      const difference = percentageVariation(value, values[index + 1] ?? null)
      cells.push(
        <td key={`difference-${index}`} className={`derecha mono var ${variationClass(difference)}`}>
          {formatVariation(difference)}
        </td>,
      )
    }
  })

  return (
    <tr className={highlighted ? 'destacada' : ''}>
      <td style={{ paddingLeft: `${0.7 + indentation * 0.9}rem` }}>{label}</td>
      {cells}
    </tr>
  )
}
