import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Database,
  ListFilter,
  Search,
  X,
} from 'lucide-react'
import { useBalancesList } from '../hooks/use-balances-list'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import '../../../styles/Balances.css'

const formatNumber = (value: number) => value.toLocaleString('es-EC')

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="caja">
      <span className="caja-etiqueta">{label}</span>
      <strong className="caja-valor">{value}</strong>
    </div>
  )
}

export default function BalancesPage() {
  const { filters, rows, summary, totals, isLoading, error, setFilter, clearFilters, pagination } =
    useBalancesList()

  return (
    <div className="balances">
      <header className="page-heading">
        <div>
          <p className="heading-kicker">Directorio financiero</p>
          <h1>Balances</h1>
          <p className="heading-subtitle">
            Encuentra estados presentados por empresa y abre un análisis con contexto.
          </p>
        </div>
        <div className="heading-source">
          <Badge variant="outline"><Database /> Fuente pública</Badge>
          <span>Superintendencia de Compañías</span>
        </div>
      </header>

      {summary.length > 0 && (
        <section className="coverage-strip" aria-labelledby="coverage-title">
          <div className="coverage-intro">
            <div className="section-icon"><Database /></div>
            <div>
              <h2 id="coverage-title">Cobertura disponible</h2>
              <p>Registros cargados por ejercicio y profundidad de la información.</p>
            </div>
          </div>
          <div className="resumen-cajas">
            <Metric label="Balances presentados" value={formatNumber(totals.balances)} />
            <Metric label="Ejercicios" value={summary.length} />
            <Metric label="Celdas con valor" value={formatNumber(totals.celdas)} />
          </div>
        </section>
      )}

      {summary.length > 0 && (
        <section className="year-filter" aria-labelledby="year-filter-title">
          <div className="section-label">
            <CalendarDays />
            <div>
              <h2 id="year-filter-title">Ejercicio</h2>
              <span>Selecciona un año para acotar la búsqueda.</span>
            </div>
          </div>
          <div className="por-anio">
            <button
              type="button"
              className={`chip${filters.anio === '' ? ' activo' : ''}`}
              aria-pressed={filters.anio === ''}
              onClick={() => setFilter('anio', '')}
            >
              <strong>Todos</strong>
              <span>{formatNumber(totals.balances)}</span>
            </button>
            {[...summary].sort((a, b) => b.anio - a.anio).map(item => {
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
                  <span>{formatNumber(item.balances)} balances</span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      <section className="data-surface">
        <div className="surface-header">
          <div>
            <div className="surface-title-row">
              <ListFilter />
              <h2>Buscar balances</h2>
            </div>
            <p>Combina razón social, RUC, rama CIIU y ejercicio.</p>
          </div>
          <Badge variant="secondary">50 por página</Badge>
        </div>
        <div className="filtros">
          <label className="field field-search">
            <span>Razón social</span>
            <div className="input-with-icon">
              <Search aria-hidden="true" />
              <Input
                aria-label="Buscar por razón social"
                placeholder="Buscar empresa…"
                value={filters.nombre}
                onChange={event => setFilter('nombre', event.target.value)}
              />
            </div>
          </label>
          <label className="field">
            <span>RUC</span>
            <Input
              aria-label="Buscar por RUC"
              placeholder="Ej. 179…"
              inputMode="numeric"
              value={filters.ruc}
              onChange={event => setFilter('ruc', event.target.value)}
            />
          </label>
          <label className="field field-branch">
            <span>Rama CIIU</span>
            <Input
              aria-label="Filtrar por rama CIIU"
              placeholder="A–U"
              maxLength={1}
              value={filters.rama}
              onChange={event => setFilter('rama', event.target.value.toUpperCase())}
            />
          </label>
          <Button className="clear-filters" variant="ghost" onClick={clearFilters}>
            <X />
            Limpiar filtros
          </Button>
        </div>
      </section>

      <section className="results-surface" aria-labelledby="results-title" aria-busy={isLoading}>
        <div className="results-header">
          <div>
            <div className="surface-title-row">
              <h2 id="results-title">Resultados</h2>
              {isLoading && <Badge variant="outline">Actualizando…</Badge>}
            </div>
            <p>
              {isLoading
                ? 'Consultando la base financiera…'
                : rows.length > 0
                  ? `Registros ${pagination.start}–${pagination.end}`
                  : 'Sin registros en esta página'}
            </p>
          </div>
          <span className="result-hint">Selecciona “Analizar” para ver evolución e indicadores.</span>
        </div>

        {error && <p className="error" role="alert">{error}</p>}

        <div className="tabla-wrap">
          <table className="tabla">
            <thead>
              <tr>
                <th>Año</th><th>Expediente</th><th>RUC</th><th>Razón social</th><th>Actividad CIIU</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map(balance => (
                <tr key={`${balance.anio}-${balance.formulario}-${balance.expediente}`}>
                  <td><Badge variant="outline">{balance.anio}</Badge></td>
                  <td className="mono">{balance.expediente}</td>
                  <td className="mono">{balance.ruc ?? '—'}</td>
                  <td className="company-name">{balance.nombre ?? '—'}</td>
                  <td title={balance.descripcionRama ?? undefined}>
                    <span className="branch-code">{balance.ramaActividad ?? '—'}</span>
                    {balance.descripcionRama && <span className="branch-description">{balance.descripcionRama}</span>}
                  </td>
                  <td className="action-cell">
                    <Link className="ver" to={`/analisis?expediente=${balance.expediente}`}>
                      Analizar <ArrowUpRight />
                    </Link>
                  </td>
                </tr>
              ))}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={6} className="vacio"><span>Sin resultados</span><small>Prueba con otros filtros o limpia la búsqueda.</small></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className="pagination" aria-label="Paginación de balances">
          <span className="pagination-summary">
            Página {pagination.page}
            {rows.length > 0 && ` · ${pagination.start}–${pagination.end} registros`}
          </span>
          <div className="pagination-actions">
            <Button
              variant="outline"
              size="sm"
              disabled={isLoading || !pagination.canPrevious}
              onClick={pagination.goPrevious}
            >
              <ChevronLeft />
              Anterior
            </Button>
            <span className="pagination-current" aria-current="page">{pagination.page}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={isLoading || !pagination.hasNext}
              onClick={pagination.goNext}
            >
              Siguiente
              <ChevronRight />
            </Button>
          </div>
        </footer>
      </section>
    </div>
  )
}
