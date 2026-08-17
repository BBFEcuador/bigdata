import { useCallback, useState } from 'react'
import { ArrowLeft, ArrowRight, Building2, DatabaseZap, Target } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import type { CompaniaResumen } from '@/features/companias/api/companias.types'
import { CompanyDirectoryFilters } from '@/features/companias/components/company-directory-filters'
import { CompanyDirectoryResults } from '@/features/companias/components/company-directory-results'
import { SubjectDetailPanel } from '@/features/companias/components/subject-detail-panel'
import { useCompanyDirectory } from '@/features/companias/hooks/use-company-directory'
import { subjectKey } from '@/features/companias/lib/company-directory'
import '../styles/Companias.css'

type Message = { tipo: 'ok' | 'error'; texto: string }

function resultSummary(total: { exacto: boolean; valor: number } | null): string {
  if (!total) return 'Consultando universo disponible'
  const value = total.valor.toLocaleString('es-EC')
  return total.exacto ? `${value} sujetos encontrados` : `Más de ${value} sujetos disponibles`
}

export default function Companias() {
  const directory = useCompanyDirectory()
  const [selected, setSelected] = useState<CompaniaResumen | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const closeDetail = useCallback(() => setSelected(null), [])

  return (
    <div className="company-directory-page">
      <header className="company-directory-hero">
        <div className="company-directory-heading">
          <span className="company-directory-icon"><Building2 aria-hidden="true" /></span>
          <div>
            <h1>Directorio de oportunidades</h1>
            <p>
              Encuentra sujetos económicos, entiende su contexto público y decide a quién priorizar.
            </p>
          </div>
        </div>
        <Link className="company-segments-link" to="/oportunidades">
          <Target aria-hidden="true" /> Ver oportunidades
        </Link>
      </header>

      <div className="company-value-strip">
        <DatabaseZap aria-hidden="true" />
        <p>
          <strong>{resultSummary(directory.total)}</strong>
          <span>Los resultados combinan identidad, estado fiscal, actividad y señales en catastros públicos.</span>
        </p>
      </div>

      <CompanyDirectoryFilters
        activeFilterCount={directory.activeFilterCount}
        facets={directory.facets}
        filters={directory.filters}
        onChange={directory.setFilter}
        onReset={directory.resetFilters}
      />

      {directory.error && (
        <div className="company-notice error" role="alert">
          <strong>No pudimos consultar el directorio.</strong>
          <span>{directory.error}</span>
        </div>
      )}
      {message && (
        <div className={`company-notice ${message.tipo}`} role="status">
          <span>{message.texto}</span>
          <Link to="/scraping">Ver rastreos</Link>
        </div>
      )}

      <section className="company-directory-body" aria-label="Resultados del directorio">
        <div className="company-results-toolbar">
          <div>
            <strong>Página {directory.page + 1}</strong>
            <span>25 resultados por página</span>
          </div>
          {directory.isLoading && <span className="company-updating">Actualizando…</span>}
        </div>

        <CompanyDirectoryResults
          data={directory.data}
          isLoading={directory.isLoading}
          onSelect={setSelected}
          selectedKey={selected ? subjectKey(selected) : null}
        />

        <nav className="company-pagination" aria-label="Paginación de resultados">
          <Button
            disabled={directory.page === 0 || directory.isLoading}
            onClick={directory.goPrevious}
            variant="outline"
          >
            <ArrowLeft /> Anterior
          </Button>
          <span>Página {directory.page + 1}</span>
          <Button
            disabled={!directory.nextCursor || directory.isLoading}
            onClick={directory.goNext}
            variant="outline"
          >
            Siguiente <ArrowRight />
          </Button>
        </nav>
      </section>

      <SubjectDetailPanel
        onClose={closeDetail}
        onTrackingResult={setMessage}
        subject={selected}
      />
    </div>
  )
}
