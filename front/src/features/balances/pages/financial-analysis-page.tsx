import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BarChart3, Building2, FileText, Gauge, LineChart, Scale, Search, Table2 } from 'lucide-react'
import { ComparableSummary } from '../components/comparable-summary'
import { FinancialIndicators } from '../components/financial-indicators'
import { FinancialStatements } from '../components/financial-statements'
import { SectorComparison } from '../components/sector-comparison'
import { useCompanyBalanceSearch, useFinancialAnalysis } from '../hooks/use-financial-analysis'
import { Badge } from '../../../components/ui/badge'
import { Input } from '../../../components/ui/input'
import '../../../styles/Analisis.css'

const TABS = [
  { id: 'estados', title: 'Estados financieros', description: 'Detalle por cuenta', icon: Table2 },
  { id: 'indicadores', title: 'Indicadores', description: 'Lectura de desempeño', icon: Gauge },
  { id: 'sector', title: 'Comparación sectorial', description: 'Posición frente a pares', icon: BarChart3 },
  { id: 'resumen', title: 'Resumen comparable', description: 'Conceptos equivalentes', icon: Scale },
] as const

type TabId = (typeof TABS)[number]['id']

export default function FinancialAnalysisPage() {
  const [params] = useSearchParams()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(params.get('expediente'))
  const [activeTab, setActiveTab] = useState<TabId>('estados')
  const searchResult = useCompanyBalanceSearch(search)
  const { analysis, isLoading, error: analysisError } = useFinancialAnalysis(selectedId)
  const error = analysisError ?? searchResult.error

  useEffect(() => {
    const expediente = params.get('expediente')
    if (expediente) setSelectedId(expediente)
  }, [params])

  const selectCompany = (expediente: string) => {
    setSelectedId(expediente)
    searchResult.clearCandidates()
  }

  return (
    <div className="analisis">
      <header className="page-heading">
        <div>
          <p className="heading-kicker">Inteligencia financiera</p>
          <h1>Análisis financiero</h1>
          <p className="heading-subtitle">
            Contrasta evolución, indicadores y posición sectorial con evidencia declarada.
          </p>
        </div>
        <div className="heading-source">
          <Badge variant="outline"><LineChart /> Lectura comparativa</Badge>
          <span>Importes en USD · fuente pública</span>
        </div>
      </header>

      <section className="analysis-search-panel" aria-labelledby="analysis-search-title">
        <div className="search-panel-copy">
          <div className="section-icon"><Search /></div>
          <div>
            <h2 id="analysis-search-title">Selecciona una compañía</h2>
            <p>Busca por razón social o RUC para cargar su historia financiera.</p>
          </div>
        </div>
        <div className="buscador">
          <Search className="search-icon" aria-hidden="true" />
          <Input
            type="search"
            aria-label="Buscar compañía para analizar"
            placeholder="Busca una compañía por razón social o RUC…"
            value={search}
            onChange={event => setSearch(event.target.value)}
            autoComplete="off"
          />
          {search.trim().length > 0 && search.trim().length < 3 && (
            <span className="search-hint">Escribe al menos 3 caracteres.</span>
          )}
        </div>
        {searchResult.candidates.length > 0 && (
          <ul className="sugerencias" aria-label="Compañías encontradas">
            {searchResult.candidates.map(company => (
              <li key={`${company.expediente}-${company.formulario}`}>
                <button type="button" onClick={() => selectCompany(company.expediente)}>
                  <span className="suggestion-main">
                    <Building2 />
                    <strong>{company.nombre ?? `Expediente ${company.expediente}`}</strong>
                  </span>
                  <span>{company.ruc ?? 'Sin RUC'} · exp. {company.expediente} · {company.anio}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && <p className="error" role="alert">{error}</p>}
      {isLoading && <p className="cargando" aria-live="polite">Cargando análisis…</p>}

      {analysis && !isLoading && (
        <>
          <section className="ficha" aria-label="Compañía seleccionada">
            <div className="company-identity">
              <div className="company-avatar" aria-hidden="true"><Building2 /></div>
              <div>
                <div className="identity-label"><Badge variant="success">Compañía seleccionada</Badge></div>
                <h2>{analysis.empresa.nombre}</h2>
                <p className="sub">
                  <span>RUC {analysis.empresa.ruc ?? '—'}</span>
                  <span>Expediente {analysis.empresa.expediente}</span>
                  {analysis.empresa.rama && <span>{analysis.empresa.rama}</span>}
                </p>
              </div>
            </div>
            <a
              className="boton-informe"
              href={`/informe/${analysis.empresa.expediente}`}
              target="_blank"
              rel="noreferrer"
            >
              <FileText /> Informe PDF
            </a>
          </section>

          <div className="pestanas" role="tablist" aria-label="Secciones del análisis">
            {TABS.map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`analysis-tab-${tab.id}`}
                  aria-controls={`analysis-panel-${tab.id}`}
                  aria-selected={activeTab === tab.id}
                  className={activeTab === tab.id ? 'activa' : ''}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon aria-hidden="true" />
                  <span>
                    <strong>{tab.title}</strong>
                    <small>{tab.description}</small>
                  </span>
                </button>
              )
            })}
          </div>

          <div
            className="analysis-panel"
            role="tabpanel"
            id={`analysis-panel-${activeTab}`}
            aria-labelledby={`analysis-tab-${activeTab}`}
          >
            {activeTab === 'estados' && <FinancialStatements data={analysis.estados} />}
            {activeTab === 'indicadores' && <FinancialIndicators data={analysis.indicadores} />}
            {activeTab === 'sector' && <SectorComparison data={analysis.sectorial} />}
            {activeTab === 'resumen' && <ComparableSummary data={analysis.resumen} />}
          </div>
        </>
      )}

      {!analysis && !isLoading && search.trim().length < 3 && (
        <p className="pista">Escribe al menos tres caracteres para buscar una compañía.</p>
      )}
      {!analysis && searchResult.isSearching && (
        <p className="pista" aria-live="polite">Buscando compañías…</p>
      )}
      {!analysis && !searchResult.isSearching && !error && search.trim().length >= 3 &&
        searchResult.candidates.length === 0 && (
          <p className="pista">No hay compañías que coincidan con la búsqueda.</p>
        )}
    </div>
  )
}
