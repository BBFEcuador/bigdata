import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ComparableSummary } from '../components/comparable-summary'
import { FinancialIndicators } from '../components/financial-indicators'
import { FinancialStatements } from '../components/financial-statements'
import { SectorComparison } from '../components/sector-comparison'
import { useCompanyBalanceSearch, useFinancialAnalysis } from '../hooks/use-financial-analysis'
import '../../../styles/Analisis.css'

const TABS = [
  { id: 'estados', title: 'Estados financieros' },
  { id: 'indicadores', title: 'Indicadores' },
  { id: 'sector', title: 'Comparación sectorial' },
  { id: 'resumen', title: 'Resumen comparable' },
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
      <h2>Análisis financiero</h2>

      <div className="buscador">
        <input
          type="search"
          aria-label="Buscar compañía para analizar"
          placeholder="Busca una compañía por razón social o RUC…"
          value={search}
          onChange={event => setSearch(event.target.value)}
          autoComplete="off"
        />
        {searchResult.candidates.length > 0 && (
          <ul className="sugerencias" aria-label="Compañías encontradas">
            {searchResult.candidates.map(company => (
              <li key={`${company.expediente}-${company.formulario}`}>
                <button type="button" onClick={() => selectCompany(company.expediente)}>
                  <strong>{company.nombre ?? `Expediente ${company.expediente}`}</strong>
                  <span>{company.ruc ?? 'Sin RUC'} · exp. {company.expediente}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {isLoading && <p className="cargando" aria-live="polite">Cargando análisis…</p>}

      {analysis && !isLoading && (
        <>
          <div className="ficha">
            <div>
              <h3>{analysis.empresa.nombre}</h3>
              <p className="sub">
                RUC {analysis.empresa.ruc ?? '—'} · Expediente {analysis.empresa.expediente}
                {analysis.empresa.rama ? ` · ${analysis.empresa.rama}` : ''}
              </p>
            </div>
            <a
              className="boton-informe"
              href={`/informe/${analysis.empresa.expediente}`}
              target="_blank"
              rel="noreferrer"
            >
              Informe PDF
            </a>
          </div>

          <div className="pestanas" role="tablist" aria-label="Secciones del análisis">
            {TABS.map(tab => (
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
                {tab.title}
              </button>
            ))}
          </div>

          <div
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
