import { useMemo, useState } from 'react'
import type { FinancialStatements as FinancialStatementsData } from '../api/balances.types'
import { ComparativeRow, YearHeader } from './comparative-table'

export function FinancialStatements({ data }: { data: FinancialStatementsData }) {
  const [onlyWithValue, setOnlyWithValue] = useState(true)
  const [maxLevel, setMaxLevel] = useState(9)
  const visibleAccounts = useMemo(
    () => data.cuentas.filter(
      account => account.nivel <= maxLevel && (!onlyWithValue || account.valores.some(value => value !== 0)),
    ),
    [data.cuentas, maxLevel, onlyWithValue],
  )

  return (
    <div className="bloque">
      <div className="controles">
        <label className="check">
          <input
            type="checkbox"
            checked={onlyWithValue}
            onChange={event => setOnlyWithValue(event.target.checked)}
          />
          Ocultar cuentas en cero en todos los años
        </label>
        <label className="check">
          Nivel máximo
          <select value={maxLevel} onChange={event => setMaxLevel(Number(event.target.value))}>
            {[1, 2, 3, 4, 5, 6, 9].map(level => (
              <option key={level} value={level}>{level === 9 ? 'Todos' : level}</option>
            ))}
          </select>
        </label>
        <span className="conteo">{visibleAccounts.length} de {data.cuentas.length} cuentas</span>
      </div>

      {data.formulariosDisponibles.length > 1 && (
        <p className="aviso">
          Esta compañía declaró en más de un formulario. Aquí se muestran los años del
          formulario {data.formulario}; para comparar todos los años usa «Resumen comparable».
        </p>
      )}

      <div className="scroll">
        <table className="tabla">
          <thead><YearHeader years={data.anios} /></thead>
          <tbody>
            {visibleAccounts.map(account => (
              <ComparativeRow
                key={account.codigo}
                label={<><span className="codigo">{account.codigo}</span> {account.nombre}</>}
                values={account.valores}
                format="dinero"
                indentation={Math.min(account.nivel - 1, 5)}
                highlighted={account.nivel === 1}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
