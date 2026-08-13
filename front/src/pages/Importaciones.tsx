import { useEffect, useState } from 'react'
import { ETIQUETA_KIND, listarJobs } from '../services/imports.service'
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

  useEffect(() => {
    let cancelado = false

    const cargar = () =>
      listarJobs()
        .then(d => !cancelado && setJobs(d))
        .catch(e => !cancelado && setError(e?.response?.data?.message ?? e.message))

    cargar()
    // Refresco periódico para ver avanzar una importación en curso sin recargar.
    const id = setInterval(cargar, 3000)
    return () => {
      cancelado = true
      clearInterval(id)
    }
  }, [])

  return (
    <div className="importaciones">
      <h2>Historial de importaciones</h2>

      {error && <div className="alerta error">{error}</div>}

      {jobs.length === 0 && !error && (
        <div className="vacio-total">Todavía no se ha ejecutado ninguna importación.</div>
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
