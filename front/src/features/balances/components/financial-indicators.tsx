import type { FinancialIndicators as FinancialIndicatorsData } from '../api/balances.types'
import { ComparativeRow, YearHeader } from './comparative-table'

export function FinancialIndicators({ data }: { data: FinancialIndicatorsData }) {
  return (
    <div className="bloque">
      {data.grupos.map(group => {
        const indicators = data.indicadores.filter(indicator => indicator.grupo === group.id)
        if (indicators.length === 0) return null
        return (
          <section key={group.id}>
            <h4>{group.titulo}</h4>
            <div className="scroll">
              <table className="tabla">
                <thead><YearHeader years={data.anios} forms={data.formularios} /></thead>
                <tbody>
                  {indicators.map(indicator => (
                    <ComparativeRow
                      key={indicator.clave}
                      label={indicator.etiqueta}
                      values={indicator.valores}
                      format={indicator.formato}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
      <p className="aviso">
        Un guion significa que el indicador no puede calcularse: el denominador es cero o el
        formulario no desglosa una cuenta necesaria. No se aproxima.
      </p>
    </div>
  )
}
