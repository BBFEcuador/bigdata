import { useEffect, useRef, useState } from 'react'
import { obtenerJob, obtenerRechazos, subirArchivo } from '../services/imports.service'
import '../styles/PanelImportacion.css'

const ESTADOS_FINALES = ['completed', 'failed']

const ETIQUETA_ESTADO = {
  pending: 'En cola',
  parsing: 'Leyendo el archivo',
  merging: 'Consolidando en la base',
  indexing: 'Creando índices',
  completed: 'Completado',
  failed: 'Fallido',
}

const num = n => (n ?? 0).toLocaleString('es-EC')

/**
 * Pantalla de importación, compartida por compañías y catálogo.
 *
 * Ambos importadores usan el mismo contrato de job, así que la única diferencia
 * entre las dos pantallas son el endpoint, las extensiones aceptadas y los
 * textos.
 */
export default function PanelImportacion({
  titulo,
  ayuda,
  endpoint,
  accept,
  etiquetaEntidad = 'filas',
}) {
  const [file, setFile] = useState(null)
  const [modo, setModo] = useState('snapshot_completo')
  const [subiendoPct, setSubiendoPct] = useState(null)
  const [jobId, setJobId] = useState(null)
  const [job, setJob] = useState(null)
  const [rechazos, setRechazos] = useState(null)
  const [error, setError] = useState(null)
  const enVuelo = useRef(false)

  useEffect(() => {
    if (!jobId) return undefined
    let cancelado = false

    const tick = async () => {
      if (enVuelo.current) return // evita apilar peticiones si una va lenta
      enVuelo.current = true
      try {
        const j = await obtenerJob(jobId)
        if (cancelado) return
        setJob(j)
        if (ESTADOS_FINALES.includes(j.status)) {
          clearInterval(id)
          if (j.rowsRejected > 0 || j.rowsWarned > 0) {
            obtenerRechazos(jobId).then(setRechazos).catch(() => {})
          }
        }
      } catch (e) {
        if (!cancelado) setError(e?.response?.data?.message ?? e.message)
      } finally {
        enVuelo.current = false
      }
    }

    tick()
    const id = setInterval(tick, 1500)
    return () => {
      cancelado = true
      clearInterval(id)
    }
  }, [jobId])

  const onSubmit = async e => {
    e.preventDefault()
    if (!file) return
    setError(null)
    setJob(null)
    setRechazos(null)
    setSubiendoPct(0)
    try {
      const res = await subirArchivo(endpoint, file, setSubiendoPct, modo)
      setJobId(res.jobId)
    } catch (err) {
      setSubiendoPct(null)
      setError(err?.response?.data?.message ?? err.message)
    }
  }

  const activo = job && !ESTADOS_FINALES.includes(job.status)

  return (
    <div className="importar">
      <h2>{titulo}</h2>
      <p className="ayuda">{ayuda}</p>

      <form onSubmit={onSubmit} className="formulario">
        <input
          type="file"
          accept={accept}
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          disabled={activo}
        />

        <label className="modo">
          <span>Modo</span>
          <select value={modo} onChange={e => setModo(e.target.value)} disabled={activo}>
            <option value="snapshot_completo">Snapshot completo (marca las ausentes)</option>
            <option value="parcial">Parcial (no marca ausentes)</option>
          </select>
        </label>

        <button type="submit" disabled={!file || activo}>
          {activo ? 'Importando…' : 'Importar'}
        </button>
      </form>

      {file && (
        <p className="archivo">
          {file.name} — {(file.size / 1024 / 1024).toFixed(2)} MB
        </p>
      )}

      {error && <div className="alerta error">{error}</div>}

      {/*
        Dos barras separadas a propósito: la subida termina pronto y luego "no
        pasa nada" mientras el servidor procesa. Con una sola barra parece que
        se ha colgado.
      */}
      {subiendoPct !== null && <Barra titulo="1. Subida del archivo" pct={subiendoPct} />}

      {job && (
        <>
          <Barra
            titulo={`2. Procesamiento — ${ETIQUETA_ESTADO[job.status] ?? job.status}`}
            pct={job.progressPct}
            variante={job.status === 'failed' ? 'error' : undefined}
          />

          <div className="contadores">
            <Dato etiqueta={`${etiquetaEntidad} leídas`} valor={num(job.rowsRead)} />
            <Dato etiqueta="Nuevas" valor={num(job.rowsInserted)} />
            <Dato etiqueta="Actualizadas" valor={num(job.rowsUpdated)} />
            <Dato etiqueta="Sin cambios" valor={num(job.rowsUnchanged)} />
            <Dato etiqueta="Ya no vienen" valor={num(job.rowsMissing)} />
            <Dato etiqueta="Duplicadas" valor={num(job.duplicados)} />
            <Dato etiqueta="Rechazadas" valor={num(job.rowsRejected)} />
            <Dato etiqueta="Con aviso" valor={num(job.rowsWarned)} />
          </div>

          {job.status === 'failed' && <div className="alerta error">{job.errorMessage}</div>}

          {/* Un archivo ya cargado da 0 nuevas y 0 actualizadas, que a simple
              vista se lee como "no ha hecho nada". Se dice explícitamente: la
              reimportación es idempotente, no un fallo. */}
          {job.status === 'completed' && (
            <div className="alerta ok">
              {job.rowsInserted === 0 && job.rowsUpdated === 0 && job.rowsUnchanged > 0 ? (
                <>
                  Este archivo ya estaba cargado: las {num(job.rowsUnchanged)} {etiquetaEntidad}
                  {' '}ya estaban en la base con los mismos datos, así que no se reescribió nada.
                  Los datos SÍ están cargados.
                </>
              ) : (
                <>
                  Importación completada.{' '}
                  {job.rowsUnchanged > 0 &&
                    `${num(job.rowsUnchanged)} ${etiquetaEntidad} no cambiaron y no se reescribieron.`}
                </>
              )}
            </div>
          )}

          {job.avisos && <div className="alerta aviso">{job.avisos}</div>}
        </>
      )}

      {rechazos?.filas?.length > 0 && (
        <details className="rechazos">
          <summary>Ver detalle de {num(rechazos.filas.length)} incidencia(s)</summary>
          <table>
            <thead>
              <tr>
                <th>Línea</th>
                <th>Columna</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {rechazos.filas.map(r => (
                <tr key={r.id}>
                  <td>{r.sourceRowNumber}</td>
                  <td>{r.columna ?? '—'}</td>
                  <td>{r.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  )
}

function Barra({ titulo, pct, variante = '' }) {
  return (
    <div className="barra-bloque">
      <div className="barra-cabecera">
        <span>{titulo}</span>
        <span>{pct}%</span>
      </div>
      <div className="barra">
        <div
          className={`barra-relleno${variante ? ` ${variante}` : ''}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  )
}

function Dato({ etiqueta, valor }) {
  return (
    <div className="dato">
      <span className="dato-valor">{valor}</span>
      <span className="dato-etiqueta">{etiqueta}</span>
    </div>
  )
}
