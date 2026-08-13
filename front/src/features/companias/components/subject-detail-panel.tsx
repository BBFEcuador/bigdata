import { useEffect, useRef, type ReactNode } from 'react'
import { BarChart3, Database, MapPin, Radar, ReceiptText, Store, X } from 'lucide-react'
import { Link } from 'react-router-dom'

import BotonRastrear from '@/components/BotonRastrear'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CompaniaResumen } from '../api/companias.types'
import {
  formatDate,
  formatMoney,
  newestExportYear,
  subjectAccountingObligation,
  subjectActivity,
  subjectEstablishments,
  subjectLocation,
  subjectRetentionAgent,
  subjectSpecialTaxpayer,
  subjectStatus,
  subjectStatusTone,
  subjectTrackingType,
  subjectTypeLabel,
  yesNo,
} from '../lib/company-directory'

type TrackingResult = { tipo: 'ok' | 'error'; texto: string }

interface SubjectDetailPanelProps {
  onClose: () => void
  onTrackingResult: (result: TrackingResult) => void
  subject: CompaniaResumen | null
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="subject-field">
      <dt>{label}</dt>
      <dd>{value ?? 'No disponible'}</dd>
    </div>
  )
}

function StringList({ values }: { values: Array<string | number> | null | undefined }) {
  return values && values.length > 0 ? values.join(', ') : 'No informado'
}

export function SubjectDetailPanel({ subject, onClose, onTrackingResult }: SubjectDetailPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!subject) return undefined
    closeButtonRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, subject])

  if (!subject) return null

  const trackingKey = subjectTrackingType(subject) === 'compania'
    ? subject.expediente ?? subject.ruc
    : subject.ruc

  return (
    <div className="subject-drawer-layer">
      <button
        aria-label="Cerrar detalle"
        className="subject-drawer-backdrop"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-labelledby="subject-detail-title"
        aria-modal="true"
        className="subject-drawer"
        role="dialog"
      >
        <header className="subject-drawer-header">
          <div>
            <div className="subject-drawer-badges">
              <Badge variant={subjectStatusTone(subject)}>{subjectStatus(subject)}</Badge>
              <Badge variant="outline">{subjectTypeLabel(subject.tipo)}</Badge>
            </div>
            <h2 id="subject-detail-title">{subject.nombre}</h2>
            <p>{subject.ruc ?? 'RUC no disponible'} · {subjectLocation(subject)}</p>
          </div>
          <Button
            aria-label="Cerrar detalle"
            onClick={onClose}
            ref={closeButtonRef}
            size="icon"
            variant="ghost"
          >
            <X />
          </Button>
        </header>

        <div className="subject-drawer-actions">
          {subject.expediente && (
            <Link
              className={cn(buttonVariants({ size: 'sm' }), 'subject-action-link')}
              to={`/analisis?expediente=${subject.expediente}`}
            >
              <BarChart3 /> Análisis financiero
            </Link>
          )}
          {trackingKey && (
            <BotonRastrear
              clave={trackingKey}
              onResultado={onTrackingResult}
              tipoSujeto={subjectTrackingType(subject)}
            />
          )}
        </div>

        <div className="subject-drawer-content">
          <section className="subject-summary-band">
            <div>
              <MapPin aria-hidden="true" />
              <span>Territorio</span>
              <strong>{subjectLocation(subject)}</strong>
            </div>
            <div>
              <Store aria-hidden="true" />
              <span>Establecimientos</span>
              <strong>{subjectEstablishments(subject) ?? '—'}</strong>
            </div>
            <div>
              <ReceiptText aria-hidden="true" />
              <span>Último balance</span>
              <strong>{subject.ultimoBalance ?? '—'}</strong>
            </div>
          </section>

          <section className="subject-section">
            <div className="subject-section-title">
              <ReceiptText aria-hidden="true" />
              <div><h3>Situación fiscal</h3><p>Información declarada o cruzada con el SRI.</p></div>
            </div>
            <dl className="subject-field-grid">
              <Field label="Estado" value={subjectStatus(subject)} />
              <Field label="Clase" value={subject.claseContribuyente ?? subject.sriClaseContribuyente} />
              <Field label="Inicio de actividades" value={formatDate(subject.fechaInicioActividades ?? subject.sriFechaInicioActividades)} />
              <Field label="Última actualización" value={formatDate(subject.fechaActualizacion)} />
              <Field label="Suspensión definitiva" value={formatDate(subject.fechaSuspensionDefinitiva)} />
              <Field label="Reinicio de actividades" value={formatDate(subject.fechaReinicioActividades)} />
              <Field label="Obligado a contabilidad" value={yesNo(subjectAccountingObligation(subject))} />
              <Field label="Agente de retención" value={yesNo(subjectRetentionAgent(subject))} />
              <Field label="Contribuyente especial" value={yesNo(subjectSpecialTaxpayer(subject))} />
              <Field label="Nombre comercial" value={subject.sriNombreComercial} />
            </dl>
          </section>

          <section className="subject-section">
            <div className="subject-section-title">
              <Database aria-hidden="true" />
              <div><h3>Información societaria</h3><p>Datos registrales disponibles para el sujeto.</p></div>
            </div>
            <dl className="subject-field-grid">
              <Field label="Expediente" value={subject.expediente} />
              <Field label="Situación legal" value={subject.situacionLegal} />
              <Field label="Tipo de compañía" value={subject.tipoCompania ?? subject.tipo} />
              <Field label="Constitución" value={formatDate(subject.fechaConstitucion)} />
              <Field label="Capital suscrito" value={formatMoney(subject.capitalSuscrito)} />
              <Field label="Representante" value={subject.representante} />
              <Field label="Cargo" value={subject.cargo} />
              <Field label="Balance inicial" value={yesNo(subject.presentoBalanceInicial)} />
              <Field label="Presentación balance inicial" value={formatDate(subject.fechaPresentacionBalanceInicial)} />
            </dl>
          </section>

          <section className="subject-section">
            <div className="subject-section-title">
              <MapPin aria-hidden="true" />
              <div><h3>Ubicación y actividad</h3><p>Contexto operativo para segmentar y contactar.</p></div>
            </div>
            <dl className="subject-field-grid">
              <Field label="Jurisdicción" value={subject.jurisdiccion} />
              <Field label="País / región" value={[subject.pais, subject.region].filter(Boolean).join(' · ') || null} />
              <Field label="Provincia" value={subject.provincia} />
              <Field label="Cantón / ciudad" value={[subject.canton, subject.ciudad].filter(Boolean).join(' · ') || null} />
              <Field label="Parroquia" value={subject.sriParroquia} />
              <Field label="Dirección" value={[subject.calle, subject.numero, subject.interseccion, subject.barrio].filter(Boolean).join(', ') || null} />
              <Field label="Teléfono" value={subject.telefono} />
              <Field label="CIIU nivel 1" value={subject.ciiuNivel1} />
              <Field label="CIIU principal" value={subject.ciiuNivel6} />
              <Field label="Actividad" value={subjectActivity(subject)} />
            </dl>
          </section>

          <section className="subject-section">
            <div className="subject-section-title">
              <Radar aria-hidden="true" />
              <div><h3>Señales comerciales</h3><p>Presencia en fuentes públicas; no implica una necesidad confirmada.</p></div>
            </div>
            <dl className="subject-field-grid">
              <Field label="Registros turísticos" value={subject.turismoRegistros ?? 'No informado'} />
              <Field label="Turismo ratificado" value={yesNo(subject.turismoRatificado)} />
              <Field label="Actividades turísticas" value={<StringList values={subject.turismoActividades} />} />
              <Field label="Clasificaciones turísticas" value={<StringList values={subject.turismoClasificaciones} />} />
              <Field label="Exportador más reciente" value={newestExportYear(subject) ?? 'No informado'} />
              <Field label="Bienes · IR" value={<StringList values={subject.exportadorBienesIrAnios} />} />
              <Field label="Bienes · IVA" value={<StringList values={subject.exportadorBienesIvaAnios} />} />
              <Field label="Servicios · IVA" value={<StringList values={subject.exportadorServiciosIvaAnios} />} />
            </dl>
          </section>

          <details className="subject-traceability">
            <summary>Trazabilidad técnica</summary>
            <dl className="subject-field-grid">
              <Field label="ID" value={subject.id} />
              <Field label="Hash de fila" value={subject.rowHash} />
              <Field label="Primer job" value={subject.primerJobId} />
              <Field label="Último job" value={subject.ultimoJobId} />
              <Field label="Job SRI" value={subject.sriJobId} />
              <Field label="Job Turismo" value={subject.turismoJobId} />
              <Field label="Job catastros" value={subject.catastrosJobId} />
              <Field label="Ausente desde job" value={subject.ausenteDesdeJob} />
              <Field label="Creado" value={formatDate(subject.createdAt)} />
              <Field label="Actualizado" value={formatDate(subject.updatedAt)} />
            </dl>
          </details>
        </div>
      </aside>
    </div>
  )
}
