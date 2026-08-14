import { useEffect, useState } from 'react'
import { CheckCircle2, Clock3, Database, History, LoaderCircle, XCircle } from 'lucide-react'
import { ETIQUETA_KIND, listarJobs } from '../services/imports.service'
import PageHeader from '../components/PageHeader'
import '../styles/Importaciones.css'

const num = n => (n ?? 0).toLocaleString('es-EC')

const ETIQUETA_ESTADO = {
  pending: 'En cola',
  parsing: 'Leyendo',
  merging: 'Consolidando',
  indexing: 'Indexando',
  completed: 'Completado',
  failed: 'Fallido',
}

const ESTADOS_FINALES = ['completed', 'failed']

const fecha = v =>
  v ? new Date(v).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'medium' }) : '—'

const duracion = j => {
  if (!j.startedAt || !j.finishedAt) return '—'
  const s = (new Date(j.finishedAt).getTime() - new Date(j.startedAt).getTime()) / 1000
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`
}

export default function Importaciones() {
  const [jobs, setJobs] = useState([])
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let cancelado = false

    const cargar = () => {
      setCargando(true)
      listarJobs()
        .then(d => !cancelado && setJobs(d))
        .catch(e => !cancelado && setError(e?.response?.data?.message ?? e.message))
        .finally(() => !cancelado && setCargando(false))
    }

    cargar()
    // Refresco periódico para ver avanzar una importación en curso sin recargar.
    const id = setInterval(cargar, 3000)
    return () => {
      cancelado = true
      clearInterval(id)
    }
  }, [])

  const resumen = jobs.reduce(
    (acc, job) => {
      acc.total += 1
      if (ESTADOS_FINALES.includes(job.status)) {
        if (job.status === 'completed') acc.completadas += 1
        if (job.status === 'failed') acc.fallidas += 1
      } else {
        acc.activas += 1
      }
      return acc
    },
    { total: 0, activas: 0, completadas: 0, fallidas: 0 }
  )

  return (
    <div className="importaciones">
      <PageHeader
        kicker="Centro de datos"
        title="Historial de importaciones"
        description="Revisa el estado de cada carga, sus resultados y cualquier incidencia detectada por el servidor."
        source="Actividad de datos"
        sourceDetail="Actualización automática cada 3 segundos"
        icon={History}
      />

      <div className="import-history-summary" aria-label="Resumen de importaciones">
        <div className="import-history-stat">
          <strong>{num(resumen.total)}</strong>
          <span>Total de cargas</span>
        </div>
        <div className="import-history-stat">
          <strong>{num(resumen.activas)}</strong>
          <span>En proceso</span>
        </div>
        <div className="import-history-stat">
          <strong>{num(resumen.completadas)}</strong>
          <span>Completadas</span>
        </div>
        <div className="import-history-stat">
          <strong>{num(resumen.fallidas)}</strong>
          <span>Con error</span>
        </div>
      </div>

      {error && <div className="alerta error" role="alert"><XCircle aria-hidden="true" />{error}</div>}

      {cargando && jobs.length === 0 && !error && (
        <div className="vacio-total" role="status" aria-live="polite">
          <LoaderCircle className="import-empty-icon spin" aria-hidden="true" />
          <strong>Cargando historial</strong>
          <span>Estamos consultando las importaciones recientes.</span>
        </div>
      )}

      {!cargando && jobs.length === 0 && !error && (
        <div className="vacio-total">
          <Database className="import-empty-icon" aria-hidden="true" />
          <strong>Todavía no hay importaciones</strong>
          <span>Cuando subas un archivo, aquí podrás seguir su resultado.</span>
        </div>
      )}

      {jobs.length > 0 && (
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Archivo</th>
                <th>Estado</th>
                <th className="der">Leídas</th>
                <th className="der">Nuevas</th>
                <th className="der">Actualizadas</th>
                <th className="der">Sin cambios</th>
                <th className="der">Rechazadas</th>
                <th className="der">Duración</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(j => (
                <tr key={j.id}>
                  <td>{fecha(j.createdAt)}</td>
                  <td>{ETIQUETA_KIND[j.kind] ?? j.kind}</td>
                  <td className="archivo" title={j.originalFilename}>
                    {j.originalFilename}
                  </td>
                  <td>
                    <span className={`estado ${j.status}`}>
                      {j.status === 'completed' && <CheckCircle2 aria-hidden="true" />}
                      {j.status === 'failed' && <XCircle aria-hidden="true" />}
                      {!ESTADOS_FINALES.includes(j.status) && <Clock3 aria-hidden="true" />}
                      {ETIQUETA_ESTADO[j.status] ?? j.status}
                      {!ESTADOS_FINALES.includes(j.status) && ` ${j.progressPct}%`}
                    </span>
                    {j.status === 'failed' && j.errorMessage && (
                      <p className="motivo" title={j.errorMessage}>
                        {j.errorMessage}
                      </p>
                    )}
                  </td>
                  <td className="der">{num(j.rowsRead)}</td>
                  <td className="der">{num(j.rowsInserted)}</td>
                  <td className="der">{num(j.rowsUpdated)}</td>
                  <td className="der">{num(j.rowsUnchanged)}</td>
                  <td className="der">{num(j.rowsRejected)}</td>
                  <td className="der">{duracion(j)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
