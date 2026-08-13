import type { ComparableSummary as ComparableSummaryData } from '../api/balances.types'
import { ComparativeRow, YearHeader } from './comparative-table'

const BLOCKS = [
  { id: 'situacion', title: 'Situación financiera' },
  { id: 'resultados', title: 'Resultados' },
] as const

export function ComparableSummary({ data }: { data: ComparableSummaryData }) {
  return (
    <div className="bloque">
      {BLOCKS.map(block => (
        <section key={block.id}>
          <h4>{block.title}</h4>
          <div className="scroll">
            <table className="tabla">
              <thead><YearHeader years={data.anios} forms={data.formularios} /></thead>
              <tbody>
                {data.conceptos
                  .filter(concept => concept.bloque === block.id)
                  .map(concept => (
                    <ComparativeRow
                      key={concept.clave}
                      label={concept.etiqueta}
                      values={concept.valores}
                      format="dinero"
                    />
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {data.formularios.some(form => form !== 1) && (
        <p className="aviso">
          Los años marcados con <sup>F</sup> usan el formulario fiscal. Las magnitudes están
          mapeadas a conceptos equivalentes y sí pueden compararse entre ejercicios.
        </p>
      )}
    </div>
  )
}
