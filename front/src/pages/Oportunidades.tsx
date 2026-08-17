import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownToLine,
  BriefcaseBusiness,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Clock3,
  DatabaseZap,
  Mail,
  MapPin,
  Phone,
  Play,
  RefreshCw,
  Sparkles,
  UsersRound,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  correrSegmento,
  correrTodos,
  listarMiembros,
  listarSegmentos,
  marcarEstado,
  refrescarPerfil,
  urlCsv,
} from '@/services/segmentos.service'
import '../styles/Oportunidades.css'

type Product = { codigo: string; nombre: string; unidad: string; prioridad: number }
type Segment = {
  codigo: string
  nombre: string
  descripcion: string | null
  activo: boolean
  bloqueo: string | null
  miembros: number
  ultima_corrida: string | null
  ultimas_altas: number | null
  ultimas_bajas: number | null
  altas_30d: number | null
  productos: Product[]
}
type Member = {
  tipo_sujeto: string
  clave: string
  ruc: string | null
  nombre: string
  actividad: string | null
  provincia: string | null
  canton: string | null
  telefono: string | null
  correo: string | null
  sitio_web: string | null
  ingresos_ult: number | string | null
  anio_ult: number | null
  desde: string
}

const number = (value: number | null | undefined) => (value ?? 0).toLocaleString('es-EC')
const money = (value: number | string | null) => {
  if (value === null || value === undefined) return 'Sin dato financiero'
  return new Intl.NumberFormat('es-EC', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value))
}
const date = (value: string | null) => value
  ? new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium' }).format(new Date(value))
  : 'Todavía no calculado'

export default function Oportunidades() {
  const [segments, setSegments] = useState<Segment[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setSegments(await listarSegmentos())
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No fue posible consultar las oportunidades.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const summary = useMemo(() => {
    const active = segments.filter(segment => segment.activo)
    return {
      active: active.length,
      market: active.reduce((total, segment) => total + Number(segment.miembros ?? 0), 0),
      recent: active.reduce((total, segment) => total + Number(segment.altas_30d ?? 0), 0),
    }
  }, [segments])

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key)
    setError(null)
    try {
      await action()
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'La operación no pudo completarse.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="opportunities-page">
      <header className="opportunities-hero">
        <div className="opportunities-heading">
          <span className="opportunities-heading-icon"><BriefcaseBusiness aria-hidden="true" /></span>
          <div>
            <h1>Oportunidades comerciales</h1>
            <p>Prioriza sujetos con señales verificables y convierte segmentos de mercado en trabajo comercial.</p>
          </div>
        </div>
        <div className="opportunities-hero-actions">
          <Button disabled={busy !== null} onClick={() => void run('profile', refrescarPerfil)} variant="outline">
            <RefreshCw className={busy === 'profile' ? 'is-spinning' : ''} />
            {busy === 'profile' ? 'Actualizando…' : 'Actualizar datos'}
          </Button>
          <Button disabled={busy !== null} onClick={() => void run('all', correrTodos)}>
            <Play /> {busy === 'all' ? 'Calculando…' : 'Recalcular oportunidades'}
          </Button>
        </div>
      </header>

      <section className="opportunities-summary" aria-label="Resumen de oportunidades">
        <div>
          <DatabaseZap aria-hidden="true" />
          <span><strong>{number(summary.market)}</strong> coincidencias de mercado</span>
        </div>
        <div>
          <Sparkles aria-hidden="true" />
          <span><strong>{number(summary.recent)}</strong> incorporaciones en 30 días</span>
        </div>
        <div>
          <UsersRound aria-hidden="true" />
          <span><strong>{number(summary.active)}</strong> criterios comerciales activos</span>
        </div>
      </section>

      {error && (
        <div className="opportunities-notice" role="alert">
          <CircleAlert aria-hidden="true" />
          <div><strong>No pudimos actualizar esta bandeja.</strong><span>{error}</span></div>
          <Button onClick={() => void load()} size="sm" variant="outline">Reintentar</Button>
        </div>
      )}

      <section className="opportunities-board" aria-labelledby="opportunities-title">
        <div className="opportunities-board-header">
          <div>
            <h2 id="opportunities-title">Bandeja de trabajo</h2>
            <p>Abre un criterio para revisar prospectos y asignarles un estado comercial.</p>
          </div>
          <span>Ordenada por novedades recientes</span>
        </div>

        {loading ? <OpportunitySkeleton /> : (
          <div className="opportunities-list">
            {[...segments]
              .sort((a, b) => Number(b.altas_30d ?? 0) - Number(a.altas_30d ?? 0))
              .map(segment => (
                <article className={`opportunity-row${segment.activo ? '' : ' is-blocked'}`} key={segment.codigo}>
                  <div className="opportunity-row-main">
                    <div className="opportunity-copy">
                      <div className="opportunity-title-line">
                        <h3>{segment.nombre}</h3>
                        {!segment.activo && <Badge variant="warning">Datos pendientes</Badge>}
                      </div>
                      <p>{segment.descripcion || 'Criterio comercial disponible para exploración.'}</p>
                      <div className="opportunity-products" aria-label="Productos recomendados">
                        {segment.productos.map(product => (
                          <Badge key={product.codigo} variant="secondary">{product.nombre}</Badge>
                        ))}
                      </div>
                    </div>

                    <div className="opportunity-stats">
                      <span><strong>{number(segment.miembros)}</strong> disponibles</span>
                      <span className="positive"><strong>+{number(segment.altas_30d)}</strong> nuevos</span>
                      <span><Clock3 aria-hidden="true" /> {date(segment.ultima_corrida)}</span>
                    </div>

                    <div className="opportunity-actions">
                      {segment.activo ? (
                        <>
                          <Button
                            aria-expanded={selected === segment.codigo}
                            onClick={() => setSelected(current => current === segment.codigo ? null : segment.codigo)}
                            variant="outline"
                          >
                            Revisar prospectos {selected === segment.codigo ? <ChevronUp /> : <ChevronDown />}
                          </Button>
                          <Button
                            aria-label={`Recalcular ${segment.nombre}`}
                            disabled={busy !== null}
                            onClick={() => void run(segment.codigo, () => correrSegmento(segment.codigo))}
                            size="icon"
                            title="Recalcular criterio"
                            variant="ghost"
                          ><RefreshCw className={busy === segment.codigo ? 'is-spinning' : ''} /></Button>
                          <a className="opportunity-download" href={urlCsv(segment.codigo)} title="Descargar CSV">
                            <ArrowDownToLine aria-hidden="true" /><span>CSV</span>
                          </a>
                        </>
                      ) : <p className="opportunity-blocked-reason">{segment.bloqueo}</p>}
                    </div>
                  </div>

                  {selected === segment.codigo && segment.activo && <ProspectList code={segment.codigo} />}
                </article>
              ))}
          </div>
        )}
      </section>
    </div>
  )
}

function OpportunitySkeleton() {
  return <div className="opportunities-skeleton" aria-label="Cargando oportunidades">
    {Array.from({ length: 4 }, (_, index) => <Skeleton className="h-[112px]" key={index} />)}
  </div>
}

function ProspectList({ code }: { code: string }) {
  const [members, setMembers] = useState<Member[] | null>(null)
  const [total, setTotal] = useState(0)
  const [onlyRecent, setOnlyRecent] = useState(true)
  const [onlyContact, setOnlyContact] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const result = await listarMiembros(code, {
        limit: 25,
        novedades: onlyRecent ? 'true' : undefined,
        conContacto: onlyContact ? 'true' : undefined,
      }) as { datos: Member[]; total: number }
      setMembers(result.datos)
      setTotal(result.total)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudieron consultar los prospectos.')
    }
  }, [code, onlyContact, onlyRecent])

  useEffect(() => { void load() }, [load])

  const updateStatus = async (member: Member, status: 'en_gestion' | 'no_contactar') => {
    setWorking(member.clave)
    try {
      await marcarEstado(member.tipo_sujeto, member.clave, status)
      await load()
    } finally {
      setWorking(null)
    }
  }

  return (
    <div className="prospect-panel">
      <div className="prospect-toolbar">
        <div className="prospect-filters">
          <label><input checked={onlyRecent} onChange={event => setOnlyRecent(event.target.checked)} type="checkbox" /> Nuevos en 30 días</label>
          <label><input checked={onlyContact} onChange={event => setOnlyContact(event.target.checked)} type="checkbox" /> Con datos de contacto</label>
        </div>
        <span><strong>{number(total)}</strong> pendientes de gestión</span>
      </div>

      {error && <p className="prospect-error" role="alert">{error}</p>}
      {!members && <div className="prospect-loading"><Skeleton className="h-[72px]" /><Skeleton className="h-[72px]" /></div>}
      {members && members.length === 0 && (
        <div className="prospect-empty"><strong>No hay pendientes con estos filtros.</strong><span>Prueba mostrando todo el segmento o incluyendo sujetos sin contacto.</span></div>
      )}
      {members && members.length > 0 && (
        <div className="prospect-list">
          {members.map(member => (
            <div className="prospect-row" key={`${member.tipo_sujeto}-${member.clave}`}>
              <div className="prospect-identity">
                <strong>{member.nombre}</strong>
                <span>{member.ruc ?? member.clave} · {member.actividad ?? 'Actividad no clasificada'}</span>
              </div>
              <div className="prospect-context">
                <span><MapPin /> {[member.provincia, member.canton].filter(Boolean).join(', ') || 'Ubicación no disponible'}</span>
                <span>{money(member.ingresos_ult)}{member.anio_ult ? ` · ${member.anio_ult}` : ''}</span>
              </div>
              <div className="prospect-contact">
                <span className={member.telefono ? '' : 'muted'}><Phone /> {member.telefono ?? 'Sin teléfono'}</span>
                <span className={member.correo ? '' : 'muted'}><Mail /> {member.correo ?? 'Sin correo'}</span>
              </div>
              <div className="prospect-actions">
                <Button disabled={working === member.clave} onClick={() => void updateStatus(member, 'en_gestion')} size="sm">Tomar gestión</Button>
                <Button disabled={working === member.clave} onClick={() => void updateStatus(member, 'no_contactar')} size="sm" variant="ghost">No contactar</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
