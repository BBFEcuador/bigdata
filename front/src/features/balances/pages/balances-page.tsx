import { Link } from 'react-router-dom'
import { useBalancesList } from '../hooks/use-balances-list'
import '../../../styles/Balances.css'

const formatNumber = (value: number) => value.toLocaleString('es-EC')

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="caja">
      <span className="caja-valor">{value}</span>
      <span className="caja-etiqueta">{label}</span>
    </div>
  )
}

export default function BalancesPage() {
  const { filters, rows, summary, totals, isLoading, error, setFilter, clearFilters } =
    useBalancesList()

  return (
    <div className="balances">
      <h2>Balances</h2>

      {summary.length > 0 && (
        <div className="resumen-cajas">
          <Metric label="Balances" value={formatNumber(totals.balances)} />
          <Metric label="Ejercicios" value={summary.length} />
          <Metric label="Celdas con valor" value={formatNumber(totals.celdas)} />
        </div>
      )}

      {summary.length > 0 && (
        <div className="por-anio" aria-label="Filtrar por ejercicio">
          {[...summary].sort((a, b) => a.anio - b.anio).map(item => {
            const isActive = filters.anio === String(item.anio)
            return (
              <button
                key={item.anio}
                type="button"
                className={`chip${isActive ? ' activo' : ''}`}
                aria-pressed={isActive}
                onClick={() => setFilter('anio', isActive ? '' : String(item.anio))}
              >
                <strong>{item.anio}</strong>
                <span>{formatNumber(item.balances)}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="filtros">
        <input
          aria-label="Buscar por razón social"
          placeholder="Buscar por razón social…"
          value={filters.nombre}
          onChange={event => setFilter('nombre', event.target.value)}
        />
        <input
          aria-label="Buscar por RUC"
          placeholder="RUC"
          value={filters.ruc}
          onChange={event => setFilter('ruc', event.target.value)}
        />
        <input
          aria-label="Filtrar por rama CIIU"
          placeholder="Rama (A, B, C…)"
          maxLength={1}
          value={filters.rama}
          onChange={event => setFilter('rama', event.target.value.toUpperCase())}
        />
        <button type="button" onClick={clearFilters}>Limpiar</button>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {isLoading && <p className="cargando" aria-live="polite">Cargando…</p>}

      <table className="tabla">
        <thead>
          <tr>
            <th>Año</th><th>Expediente</th><th>RUC</th><th>Razón social</th><th>Rama</th><th />
          </tr>
        </thead>
        <tbody>
          {rows.map(balance => (
            <tr key={`${balance.anio}-${balance.formulario}-${balance.expediente}`}>
              <td>{balance.anio}</td>
              <td className="mono">{balance.expediente}</td>
              <td className="mono">{balance.ruc ?? '—'}</td>
              <td>{balance.nombre ?? '—'}</td>
              <td title={balance.descripcionRama ?? undefined}>{balance.ramaActividad ?? '—'}</td>
              <td>
                <Link className="ver" to={`/analisis?expediente=${balance.expediente}`}>
                  Analizar
                </Link>
              </td>
            </tr>
          ))}
          {!isLoading && rows.length === 0 && (
            <tr><td colSpan={6} className="vacio">Sin resultados.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
