import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  BarChart3,
  Car,
  Contact,
  Database,
  House,
  MapPin,
  Radar,
  ReceiptText,
  Store,
  Users,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import BotonRastrear from '@/components/BotonRastrear'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { listarBienes } from '@/features/bienes/api/bienes.api'
import type { Propiedad, Vehiculo } from '@/features/bienes/api/bienes.types'
import { listarContactos } from '@/features/contactos/api/contactos.api'
import type { Contacto as ContactoItem } from '@/features/contactos/api/contactos.types'
import { listarNomina } from '@/features/nomina/api/nomina.api'
import type { NominaPersona } from '@/features/nomina/api/nomina.types'
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

export function SubjectDetailPanel({
  subject,
  onClose,
  onTrackingResult,
}: SubjectDetailPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [relatedView, setRelatedView] = useState<'nomina' | 'contactos' | 'bienes' | null>(null)
  const [nominaRows, setNominaRows] = useState<NominaPersona[]>([])
  const [nominaCursor, setNominaCursor] = useState<string | null>(null)
  const [nominaLoading, setNominaLoading] = useState(false)
  const [nominaLoaded, setNominaLoaded] = useState(false)
  const [nominaError, setNominaError] = useState<string | null>(null)
  const [contactos, setContactos] = useState<ContactoItem[]>([])
  const [contactosCursor, setContactosCursor] = useState<string | null>(null)
  const [contactosLoading, setContactosLoading] = useState(false)
  const [contactosLoaded, setContactosLoaded] = useState(false)
  const [contactosError, setContactosError] = useState<string | null>(null)
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [propiedadesCursor, setPropiedadesCursor] = useState<string | null>(null)
  const [vehiculosCursor, setVehiculosCursor] = useState<string | null>(null)
  const [bienesLoading, setBienesLoading] = useState(false)
  const [bienesLoaded, setBienesLoaded] = useState(false)
  const [bienesError, setBienesError] = useState<string | null>(null)

  useEffect(() => {
    if (!subject) return undefined
    closeButtonRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, subject])

  useEffect(() => {
    setRelatedView(null)
    setNominaRows([])
    setNominaCursor(null)
    setNominaLoaded(false)
    setNominaError(null)
    setContactos([])
    setContactosCursor(null)
    setContactosLoaded(false)
    setContactosError(null)
    setPropiedades([])
    setVehiculos([])
    setPropiedadesCursor(null)
    setVehiculosCursor(null)
    setBienesLoaded(false)
    setBienesError(null)
  }, [subject?.id])

  if (!subject) return null

  const loadNomina = async (cursor: string | null = null) => {
    if (!subject.id || nominaLoading) return
    setNominaLoading(true)
    setNominaError(null)
    try {
      const query: { limit: number; cursor?: string } = { limit: 50 }
      if (cursor) query.cursor = cursor
      const result = await listarNomina(subject.id, query)
      setNominaRows(current => (cursor ? [...current, ...result.datos] : result.datos))
      setNominaCursor(result.siguiente)
      setNominaLoaded(true)
    } catch {
      setNominaError('No se pudo consultar la nómina. Intenta nuevamente.')
    } finally {
      setNominaLoading(false)
    }
  }

  const loadContactos = async (cursor: string | null = null) => {
    if (!subject.id || contactosLoading) return
    setContactosLoading(true)
    setContactosError(null)
    try {
      const query: { limit: number; cursor?: string } = { limit: 50 }
      if (cursor) query.cursor = cursor
      const result = await listarContactos(subject.id, query)
      setContactos(current => (cursor ? [...current, ...result.datos] : result.datos))
      setContactosCursor(result.siguiente)
      setContactosLoaded(true)
    } catch {
      setContactosError('No se pudieron consultar los contactos. Intenta nuevamente.')
    } finally {
      setContactosLoading(false)
    }
  }

  const loadBienes = async (pagina: 'inicial' | 'propiedades' | 'vehiculos' = 'inicial') => {
    if (!subject.id || bienesLoading) return
    setBienesLoading(true)
    setBienesError(null)
    try {
      const query: {
        limitPropiedades: number
        limitVehiculos: number
        cursorPropiedades?: string
        cursorVehiculos?: string
      } = { limitPropiedades: 25, limitVehiculos: 25 }
      if (pagina === 'propiedades' && propiedadesCursor) {
        query.cursorPropiedades = propiedadesCursor
      }
      if (pagina === 'vehiculos' && vehiculosCursor) query.cursorVehiculos = vehiculosCursor
      const result = await listarBienes(subject.id, query)

      if (pagina !== 'vehiculos') {
        setPropiedades(current =>
          pagina === 'propiedades' ? [...current, ...result.propiedades.datos] : result.propiedades.datos,
        )
        setPropiedadesCursor(result.propiedades.siguiente)
      }
      if (pagina !== 'propiedades') {
        setVehiculos(current =>
          pagina === 'vehiculos' ? [...current, ...result.vehiculos.datos] : result.vehiculos.datos,
        )
        setVehiculosCursor(result.vehiculos.siguiente)
      }
      setBienesLoaded(true)
    } catch {
      setBienesError('No se pudieron consultar los bienes. Intenta nuevamente.')
    } finally {
      setBienesLoading(false)
    }
  }

  const openRelatedView = (view: 'nomina' | 'contactos' | 'bienes') => {
    setRelatedView(view)
    if (view === 'nomina' && !nominaLoaded) void loadNomina()
    if (view === 'contactos' && !contactosLoaded) void loadContactos()
    if (view === 'bienes' && !bienesLoaded) void loadBienes()
  }

  const trackingKey =
    subjectTrackingType(subject) === 'compania' ? (subject.expediente ?? subject.ruc) : subject.ruc

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
            <p>
              {subject.ruc ?? 'RUC no disponible'} · {subjectLocation(subject)}
            </p>
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
          <Button
            aria-controls="subject-related-section"
            aria-pressed={relatedView === 'nomina'}
            disabled={!subject.id}
            onClick={() => openRelatedView('nomina')}
            size="sm"
            title={subject.id ? 'Consultar nómina' : 'No hay ID de contribuyente disponible'}
            variant={relatedView === 'nomina' ? 'secondary' : 'outline'}
          >
            <Users aria-hidden="true" /> Nómina
          </Button>
          <Button
            aria-controls="subject-related-section"
            aria-pressed={relatedView === 'contactos'}
            disabled={!subject.id}
            onClick={() => openRelatedView('contactos')}
            size="sm"
            title={subject.id ? 'Consultar contactos' : 'No hay ID de contribuyente disponible'}
            variant={relatedView === 'contactos' ? 'secondary' : 'outline'}
          >
            <Contact aria-hidden="true" /> Contactos
          </Button>
          <Button
            aria-controls="subject-related-section"
            aria-pressed={relatedView === 'bienes'}
            disabled={!subject.id}
            onClick={() => openRelatedView('bienes')}
            size="sm"
            title={subject.id ? 'Consultar bienes' : 'No hay ID de contribuyente disponible'}
            variant={relatedView === 'bienes' ? 'secondary' : 'outline'}
          >
            <House aria-hidden="true" /> Bienes
          </Button>
          {trackingKey && (
            <BotonRastrear
              clave={trackingKey}
              onResultado={onTrackingResult}
              tipoSujeto={subjectTrackingType(subject)}
            />
          )}
        </div>

        <div className="subject-drawer-content">
          {relatedView && (
            <section className="subject-section subject-related" id="subject-related-section">
              <div className="subject-section-title">
                {relatedView === 'nomina' && <Users aria-hidden="true" />}
                {relatedView === 'contactos' && <Contact aria-hidden="true" />}
                {relatedView === 'bienes' && <House aria-hidden="true" />}
                <div>
                  <h3>
                    {relatedView === 'nomina'
                      ? 'Nómina'
                      : relatedView === 'contactos'
                        ? 'Contactos'
                        : 'Bienes'}
                  </h3>
                  <p>
                    {relatedView === 'nomina'
                      ? 'Personas registradas para este contribuyente.'
                      : relatedView === 'contactos'
                        ? 'Canales disponibles para contactar a la compañía.'
                        : 'Propiedades y vehículos asociados al contribuyente.'}
                  </p>
                </div>
              </div>

              {relatedView === 'nomina' && (
                <>
                  {nominaError && (
                    <div className="subject-related-state error" role="alert">
                      <span>{nominaError}</span>
                      <Button onClick={() => void loadNomina()} size="sm" variant="outline">
                        Reintentar
                      </Button>
                    </div>
                  )}
                  {nominaLoading && nominaRows.length === 0 && (
                    <p aria-live="polite" className="subject-related-state">
                      Consultando nómina…
                    </p>
                  )}
                  {!nominaLoading && !nominaError && nominaRows.length === 0 && (
                    <p className="subject-related-state">
                      No hay registros de nómina para este contribuyente.
                    </p>
                  )}
                  {nominaRows.length > 0 && (
                    <>
                      <div className="subject-related-table-wrap" tabIndex={0}>
                        <table className="subject-related-table">
                          <thead>
                            <tr>
                              <th scope="col">Cédula</th>
                              <th scope="col">Nombre</th>
                              <th scope="col">Rol</th>
                              <th scope="col">Ingreso</th>
                              <th scope="col">Posible salario</th>
                            </tr>
                          </thead>
                          <tbody>
                            {nominaRows.map(persona => (
                              <tr key={persona.cedula}>
                                <td>{persona.cedula}</td>
                                <td>{persona.nombre ?? 'No disponible'}</td>
                                <td>{persona.rol ?? 'No disponible'}</td>
                                <td>{formatDate(persona.fechaIngreso)}</td>
                                <td>{formatMoney(persona.posibleSalario)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {nominaCursor && (
                        <div className="subject-related-more">
                          <Button
                            disabled={nominaLoading}
                            onClick={() => void loadNomina(nominaCursor)}
                            size="sm"
                            variant="outline"
                          >
                            {nominaLoading ? 'Cargando…' : 'Cargar más'}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {relatedView === 'contactos' && (
                <>
                  {contactosError && (
                    <div className="subject-related-state error" role="alert">
                      <span>{contactosError}</span>
                      <Button onClick={() => void loadContactos()} size="sm" variant="outline">
                        Reintentar
                      </Button>
                    </div>
                  )}
                  {contactosLoading && contactos.length === 0 && (
                    <p aria-live="polite" className="subject-related-state">
                      Consultando contactos…
                    </p>
                  )}
                  {!contactosLoading && !contactosError && contactos.length === 0 && (
                    <p className="subject-related-state">
                      No hay contactos registrados para este contribuyente.
                    </p>
                  )}
                  {contactos.length > 0 && (
                    <>
                      <ul className="subject-contact-list">
                        {contactos.map(contacto => {
                          const href =
                            contacto.tipo === 'email'
                              ? `mailto:${contacto.valor}`
                              : contacto.tipo === 'telefono'
                                ? `tel:${contacto.valor}`
                                : null
                          return (
                            <li key={`${contacto.tipo}-${contacto.valor}`}>
                              <span>{contacto.tipo}</span>
                              {href ? <a href={href}>{contacto.valor}</a> : <strong>{contacto.valor}</strong>}
                            </li>
                          )
                        })}
                      </ul>
                      {contactosCursor && (
                        <div className="subject-related-more">
                          <Button
                            disabled={contactosLoading}
                            onClick={() => void loadContactos(contactosCursor)}
                            size="sm"
                            variant="outline"
                          >
                            {contactosLoading ? 'Cargando…' : 'Cargar más'}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {relatedView === 'bienes' && (
                <>
                  {bienesError && (
                    <div className="subject-related-state error" role="alert">
                      <span>{bienesError}</span>
                      <Button onClick={() => void loadBienes()} size="sm" variant="outline">
                        Reintentar
                      </Button>
                    </div>
                  )}
                  {bienesLoading && !bienesLoaded && (
                    <p aria-live="polite" className="subject-related-state">
                      Consultando propiedades y vehículos…
                    </p>
                  )}
                  {!bienesLoading && !bienesError && bienesLoaded && (
                    <div className="subject-assets">
                      <section aria-labelledby="subject-properties-title">
                        <div className="subject-assets-heading">
                          <div>
                            <House aria-hidden="true" />
                            <h4 id="subject-properties-title">Propiedades</h4>
                          </div>
                          <span>{propiedades.length}</span>
                        </div>
                        {propiedades.length === 0 ? (
                          <p className="subject-related-state">No hay propiedades registradas.</p>
                        ) : (
                          <div className="subject-related-table-wrap" tabIndex={0}>
                            <table className="subject-related-table subject-assets-table">
                              <thead>
                                <tr>
                                  <th scope="col">Cédula catastral</th>
                                  <th scope="col">Ubicación</th>
                                  <th scope="col">Dirección</th>
                                  <th scope="col">Teléfono</th>
                                </tr>
                              </thead>
                              <tbody>
                                {propiedades.map(propiedad => (
                                  <tr key={propiedad.cedulaCatastral}>
                                    <td>{propiedad.cedulaCatastral}</td>
                                    <td>
                                      {[propiedad.parroquia, propiedad.barrioSector, propiedad.zona]
                                        .filter(Boolean)
                                        .join(' · ') || 'No disponible'}
                                    </td>
                                    <td>
                                      {[propiedad.callePrincipal, propiedad.numero]
                                        .filter(Boolean)
                                        .join(' ') || 'No disponible'}
                                    </td>
                                    <td>{propiedad.telefono ?? 'No disponible'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {propiedadesCursor && (
                          <div className="subject-related-more">
                            <Button
                              disabled={bienesLoading}
                              onClick={() => void loadBienes('propiedades')}
                              size="sm"
                              variant="outline"
                            >
                              {bienesLoading ? 'Cargando…' : 'Cargar más propiedades'}
                            </Button>
                          </div>
                        )}
                      </section>

                      <section aria-labelledby="subject-vehicles-title">
                        <div className="subject-assets-heading">
                          <div>
                            <Car aria-hidden="true" />
                            <h4 id="subject-vehicles-title">Vehículos</h4>
                          </div>
                          <span>{vehiculos.length}</span>
                        </div>
                        {vehiculos.length === 0 ? (
                          <p className="subject-related-state">No hay vehículos registrados.</p>
                        ) : (
                          <div className="subject-related-table-wrap" tabIndex={0}>
                            <table className="subject-related-table subject-assets-table">
                              <thead>
                                <tr>
                                  <th scope="col">Placa</th>
                                  <th scope="col">Vehículo</th>
                                  <th scope="col">Año</th>
                                  <th scope="col">Lugar</th>
                                  <th scope="col">Vencimiento</th>
                                </tr>
                              </thead>
                              <tbody>
                                {vehiculos.map(vehiculo => (
                                  <tr key={vehiculo.placa}>
                                    <td>{vehiculo.placa}</td>
                                    <td>
                                      {[vehiculo.tipo, vehiculo.marca, vehiculo.modelo]
                                        .filter(Boolean)
                                        .join(' · ') || 'No disponible'}
                                    </td>
                                    <td>{vehiculo.anio ?? '—'}</td>
                                    <td>{vehiculo.lugar ?? 'No disponible'}</td>
                                    <td>{formatDate(vehiculo.fechaVencimiento)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {vehiculosCursor && (
                          <div className="subject-related-more">
                            <Button
                              disabled={bienesLoading}
                              onClick={() => void loadBienes('vehiculos')}
                              size="sm"
                              variant="outline"
                            >
                              {bienesLoading ? 'Cargando…' : 'Cargar más vehículos'}
                            </Button>
                          </div>
                        )}
                      </section>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

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
              <div>
                <h3>Situación fiscal</h3>
                <p>Información declarada o cruzada con el SRI.</p>
              </div>
            </div>
            <dl className="subject-field-grid">
              <Field label="Estado" value={subjectStatus(subject)} />
              <Field
                label="Clase"
                value={subject.claseContribuyente ?? subject.sriClaseContribuyente}
              />
              <Field
                label="Inicio de actividades"
                value={formatDate(
                  subject.fechaInicioActividades ?? subject.sriFechaInicioActividades
                )}
              />
              <Field label="Última actualización" value={formatDate(subject.fechaActualizacion)} />
              <Field
                label="Suspensión definitiva"
                value={formatDate(subject.fechaSuspensionDefinitiva)}
              />
              <Field
                label="Reinicio de actividades"
                value={formatDate(subject.fechaReinicioActividades)}
              />
              <Field
                label="Obligado a contabilidad"
                value={yesNo(subjectAccountingObligation(subject))}
              />
              <Field label="Agente de retención" value={yesNo(subjectRetentionAgent(subject))} />
              <Field
                label="Contribuyente especial"
                value={yesNo(subjectSpecialTaxpayer(subject))}
              />
              <Field label="Nombre comercial" value={subject.sriNombreComercial} />
            </dl>
          </section>

          <section className="subject-section">
            <div className="subject-section-title">
              <Database aria-hidden="true" />
              <div>
                <h3>Información societaria</h3>
                <p>Datos registrales disponibles para el sujeto.</p>
              </div>
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
              <Field
                label="Presentación balance inicial"
                value={formatDate(subject.fechaPresentacionBalanceInicial)}
              />
            </dl>
          </section>

          <section className="subject-section">
            <div className="subject-section-title">
              <MapPin aria-hidden="true" />
              <div>
                <h3>Ubicación y actividad</h3>
                <p>Contexto operativo para segmentar y contactar.</p>
              </div>
            </div>
            <dl className="subject-field-grid">
              <Field label="Jurisdicción" value={subject.jurisdiccion} />
              <Field
                label="País / región"
                value={[subject.pais, subject.region].filter(Boolean).join(' · ') || null}
              />
              <Field label="Provincia" value={subject.provincia} />
              <Field
                label="Cantón / ciudad"
                value={[subject.canton, subject.ciudad].filter(Boolean).join(' · ') || null}
              />
              <Field label="Parroquia" value={subject.sriParroquia} />
              <Field
                label="Dirección"
                value={
                  [subject.calle, subject.numero, subject.interseccion, subject.barrio]
                    .filter(Boolean)
                    .join(', ') || null
                }
              />
              <Field label="Teléfono" value={subject.telefono} />
              <Field label="CIIU nivel 1" value={subject.ciiuNivel1} />
              <Field label="CIIU principal" value={subject.ciiuNivel6} />
              <Field label="Actividad" value={subjectActivity(subject)} />
            </dl>
          </section>

          <section className="subject-section">
            <div className="subject-section-title">
              <Radar aria-hidden="true" />
              <div>
                <h3>Señales comerciales</h3>
                <p>Presencia en fuentes públicas; no implica una necesidad confirmada.</p>
              </div>
            </div>
            <dl className="subject-field-grid">
              <Field
                label="Registros turísticos"
                value={subject.turismoRegistros ?? 'No informado'}
              />
              <Field label="Turismo ratificado" value={yesNo(subject.turismoRatificado)} />
              <Field
                label="Actividades turísticas"
                value={<StringList values={subject.turismoActividades} />}
              />
              <Field
                label="Clasificaciones turísticas"
                value={<StringList values={subject.turismoClasificaciones} />}
              />
              <Field
                label="Exportador más reciente"
                value={newestExportYear(subject) ?? 'No informado'}
              />
              <Field
                label="Bienes · IR"
                value={<StringList values={subject.exportadorBienesIrAnios} />}
              />
              <Field
                label="Bienes · IVA"
                value={<StringList values={subject.exportadorBienesIvaAnios} />}
              />
              <Field
                label="Servicios · IVA"
                value={<StringList values={subject.exportadorServiciosIvaAnios} />}
              />
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
