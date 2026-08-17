import { ChevronRight, MapPin, Store } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { CompaniaResumen } from '../api/companias.types'
import {
  newestExportYear,
  subjectAccountingObligation,
  subjectActivity,
  subjectEstablishments,
  subjectKey,
  subjectLocation,
  subjectStatus,
  subjectStatusTone,
  subjectTypeLabel,
} from '../lib/company-directory'

interface CompanyDirectoryResultsProps {
  data: CompaniaResumen[]
  isLoading: boolean
  onSelect: (subject: CompaniaResumen) => void
  selectedKey: string | null
}

function Signals({ subject }: { subject: CompaniaResumen }) {
  const establishments = subjectEstablishments(subject)
  const exportYear = newestExportYear(subject)
  const accounting = subjectAccountingObligation(subject)

  return (
    <div className="company-signals" aria-label="Señales comerciales">
      {subject.ultimoBalance && <span>Balance {subject.ultimoBalance}</span>}
      {accounting === true && <span>Con contabilidad</span>}
      {establishments !== null && establishments > 0 && (
        <span><Store aria-hidden="true" />{establishments} {establishments === 1 ? 'local' : 'locales'}</span>
      )}
      {subject.turismoRegistros ? <span>Turismo</span> : null}
      {exportYear && <span>Exportador {exportYear}</span>}
      {!subject.ultimoBalance && accounting !== true && !subject.turismoRegistros && !exportYear && (
        <span className="muted">Sin señales públicas</span>
      )}
    </div>
  )
}

export function CompanyDirectoryResults({
  data,
  isLoading,
  onSelect,
  selectedKey,
}: CompanyDirectoryResultsProps) {
  if (isLoading && data.length === 0) {
    return (
      <div className="company-results-skeleton" aria-label="Cargando resultados">
        {Array.from({ length: 7 }, (_, index) => <Skeleton key={index} className="h-[74px]" />)}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="company-empty-state">
        <SearchEmptyIcon />
        <h3>No encontramos sujetos con esos criterios</h3>
        <p>Prueba con parte del nombre, los primeros dígitos del RUC o un territorio más amplio.</p>
      </div>
    )
  }

  return (
    <div className="company-results" aria-busy={isLoading}>
      <div className="company-results-header" aria-hidden="true">
        <span>Sujeto</span>
        <span>Contexto</span>
        <span>Señales comerciales</span>
        <span />
      </div>
      <div className="company-result-list">
        {data.map((subject, index) => {
          const key = subjectKey(subject, index)
          return (
            <button
              aria-label={`Ver información de ${subject.nombre}`}
              className={`company-result-row${selectedKey === key ? ' selected' : ''}`}
              key={key}
              onClick={() => onSelect(subject)}
              type="button"
            >
              <span className="company-result-identity">
                <span className="company-result-name">
                  <strong>{subject.nombre}</strong>
                  <span>{subject.ruc ?? 'RUC no disponible'} · {subjectTypeLabel(subject.tipo)}</span>
                </span>
                <Badge variant={subjectStatusTone(subject)}>{subjectStatus(subject)}</Badge>
              </span>

              <span className="company-result-context">
                <span><MapPin aria-hidden="true" />{subjectLocation(subject)}</span>
                <span title={subjectActivity(subject)}>{subjectActivity(subject)}</span>
              </span>

              <Signals subject={subject} />
              <ChevronRight aria-hidden="true" className="company-result-chevron" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SearchEmptyIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="44" viewBox="0 0 48 48" width="44">
      <circle cx="21" cy="21" r="12" stroke="currentColor" strokeWidth="2" />
      <path d="m30 30 9 9" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M16 21h10M21 16v10" opacity=".35" stroke="currentColor" strokeLinecap="round" />
    </svg>
  )
}
