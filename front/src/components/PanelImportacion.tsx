import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, FileText, Info, LoaderCircle, Upload, XCircle } from 'lucide-react'
import { obtenerJob, obtenerRechazos, subirArchivo } from '../services/imports.service'
import PageHeader from './PageHeader'
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
  requiereProvincia = false,
  modoFijo = null,
}) {
  const [file, setFile] = useState(null)
  const [modo, setModo] = useState(modoFijo ?? 'snapshot_completo')
  const [subiendoPct, setSubiendoPct] = useState(null)
  const [jobId, setJobId] = useState(null)
  const [job, setJob] = useState(null)
  const [rechazos, setRechazos] = useState(null)
  const [error, setError] = useState(null)
  const [provincia, setProvincia] = useState('')
  const enVuelo = useRef(false)
  const inputId = `archivo-importacion-${endpoint.replace(/[^a-z0-9]/gi, '-')}`

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
    if (subiendoPct !== null || activo || esperandoJob) return
    if (requiereProvincia && !provincia.trim()) {
      setError('Indica la provincia del archivo antes de importar.')
      return
    }
    setError(null)
    setJob(null)
    setJobId(null)
    setRechazos(null)
    setSubiendoPct(0)
    try {
      const res = await subirArchivo(endpoint, file, setSubiendoPct, modo, {
        ...(requiereProvincia ? { provincia: provincia.trim() } : {}),
      })
      setSubiendoPct(null)
      setJobId(res.jobId)
    } catch (err) {
      setSubiendoPct(null)
      setError(err?.response?.data?.message ?? err.message)
    }
  }

  const activo = job && !ESTADOS_FINALES.includes(job.status)
  const subiendo = subiendoPct !== null
  const esperandoJob = Boolean(jobId && !job)
  const bloqueado = Boolean(subiendo || activo || esperandoJob)
  const formatos = accept
    .split(',')
    .map(formato => formato.replace('.', '').toUpperCase())
    .join(' · ')
  const estadoActual = subiendo
    ? {
        titulo: 'Subiendo el archivo',
        detalle: 'La carga puede tardar unos minutos. No cierres esta pestaña.',
      }
    : esperandoJob
      ? {
          titulo: 'Preparando el procesamiento',
          detalle: 'El archivo llegó al servidor. Estamos iniciando el seguimiento.',
        }
      : activo
      ? {
          titulo: ETIQUETA_ESTADO[job.status] ?? 'Procesando la importación',
          detalle: 'El servidor está trabajando. Puedes consultar el historial en otra pestaña.',
        }
      : null

  return (
    <div className="importar">
      <PageHeader
        kicker="Centro de datos"
        title={titulo}
        description={ayuda}
        source="Importación supervisada"
        sourceDetail="Subida directa · procesamiento en servidor"
        icon={Upload}
      />

      <div className="import-grid">
        <div className="import-main">
          <section className="import-card import-form-card" aria-labelledby="importar-formulario-titulo">
            <div className="import-section-heading">
              <span className="import-step" aria-hidden="true">1</span>
              <div>
                <p className="import-section-label">Preparación</p>
                <h2 id="importar-formulario-titulo">Selecciona el archivo</h2>
                <p>Verifica el formato y las opciones antes de iniciar una carga pesada.</p>
              </div>
            </div>

            <form onSubmit={onSubmit} className="formulario">
              <label
                className={`import-dropzone${file ? ' has-file' : ''}${bloqueado ? ' is-disabled' : ''}`}
                htmlFor={inputId}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault()
                  if (!bloqueado) {
                    const droppedFile = e.dataTransfer.files?.[0]
                    if (droppedFile) {
                      setFile(droppedFile)
                      setError(null)
                    }
                  }
                }}
              >
                <input
                  id={inputId}
                  type="file"
                  accept={accept}
                  onChange={e => {
                    setFile(e.target.files?.[0] ?? null)
                    setError(null)
                  }}
                  disabled={bloqueado}
                />
                <span className="import-dropzone-icon" aria-hidden="true">
                  {file ? <FileText /> : <Upload />}
                </span>
                <span className="import-dropzone-copy">
                  <strong>{file ? file.name : 'Arrastra el archivo aquí o selecciónalo'}</strong>
                  <small>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · listo para importar` : `Formatos aceptados: ${formatos}`}</small>
                </span>
                {!file && <span className="import-dropzone-action">Examinar</span>}
              </label>

              <div className="import-options">
                {requiereProvincia && (
                  <label className="modo">
                    <span>Provincia del archivo</span>
                    <input
                      value={provincia}
                      onChange={e => setProvincia(e.target.value)}
                      placeholder="Ej. AZUAY"
                      disabled={bloqueado}
                      required
                    />
                  </label>
                )}

                {!modoFijo && (
                  <label className="modo">
                    <span>Modo de carga</span>
                    <select value={modo} onChange={e => setModo(e.target.value)} disabled={bloqueado}>
                      <option value="snapshot_completo">Snapshot completo (marca las ausentes)</option>
                      <option value="parcial">Parcial (no marca ausentes)</option>
                    </select>
                  </label>
                )}
              </div>

              <div className="import-submit-row">
                <p className="import-submit-hint">
                  <Info aria-hidden="true" />
                  {bloqueado ? 'El proceso está en curso; puedes consultar el historial.' : 'La importación es idempotente: repetir el mismo archivo no duplica datos.'}
                </p>
                <button type="submit" disabled={!file || bloqueado}>
                  {subiendo ? <LoaderCircle className="spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
                  {subiendo ? `Subiendo ${subiendoPct}%` : activo || esperandoJob ? 'Procesando…' : 'Iniciar importación'}
                </button>
              </div>
            </form>
          </section>

          {estadoActual && (
            <section className="import-processing" role="status" aria-live="polite">
              <ImportLoader />
              <div>
                <strong>{estadoActual.titulo}</strong>
                <p>{estadoActual.detalle}</p>
              </div>
            </section>
          )}

          {error && <div className="alerta error" role="alert"><XCircle aria-hidden="true" />{error}</div>}

          {subiendoPct !== null && <Barra titulo="Subida del archivo" pct={subiendoPct} />}

          {job && (
            <section className="import-results" aria-labelledby="importar-resultado-titulo">
              <div className="import-section-heading">
                <span className="import-step" aria-hidden="true">2</span>
                <div>
                  <p className="import-section-label">Seguimiento</p>
                  <h2 id="importar-resultado-titulo">Procesamiento de datos</h2>
                  <p>El servidor informa el avance y separa registros nuevos, actualizados y rechazados.</p>
                </div>
              </div>

              <Barra
                titulo={ETIQUETA_ESTADO[job.status] ?? job.status}
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

              {job.status === 'failed' && <div className="alerta error" role="alert"><XCircle aria-hidden="true" />{job.errorMessage ?? 'La importación no pudo completarse.'}</div>}

              {job.status === 'completed' && (
                <div className="alerta ok" role="status">
                  <CheckCircle2 aria-hidden="true" />
                  {job.rowsInserted === 0 && job.rowsUpdated === 0 && job.rowsUnchanged > 0 ? (
                    <>
                      Este archivo ya estaba cargado: las {num(job.rowsUnchanged)} {etiquetaEntidad} ya estaban en la base con los mismos datos, así que no se reescribió nada. Los datos SÍ están cargados.
                    </>
                  ) : (
                    <>
                      Importación completada.{' '}
                      {job.rowsUnchanged > 0 && `${num(job.rowsUnchanged)} ${etiquetaEntidad} no cambiaron y no se reescribieron.`}
                    </>
                  )}
                </div>
              )}

              {job.avisos && <div className="alerta aviso" role="status"><Info aria-hidden="true" />{job.avisos}</div>}
            </section>
          )}

          {rechazos?.filas?.length > 0 && (
            <details className="rechazos">
              <summary>Ver detalle de {num(rechazos.filas.length)} incidencia(s)</summary>
              <div className="tabla-rechazos">
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
              </div>
            </details>
          )}
        </div>

        <aside className="import-aside">
          <div className="import-aside-block">
            <p className="import-section-label">Antes de empezar</p>
            <h2>Una carga segura</h2>
            <ul>
              <li>Conserva el archivo original para poder repetirlo si hace falta.</li>
              <li>No cierres la pestaña mientras la barra de subida esté activa.</li>
              <li>El procesamiento continúa en el servidor después de subirlo.</li>
            </ul>
          </div>
          <div className="import-aside-block import-aside-note">
            <Info aria-hidden="true" />
            <p><strong>¿Archivo grande?</strong> La pantalla consulta el avance cada 1,5 segundos y diferencia la subida del procesamiento para que nunca parezca que la aplicación se congeló.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Barra({ titulo, pct, variante = '' }) {
  const porcentaje = Math.min(100, Math.max(0, Number(pct) || 0))

  return (
    <div className="barra-bloque">
      <div className="barra-cabecera">
        <span>{titulo}</span>
        <span>{porcentaje}%</span>
      </div>
      <div className="barra">
        <div
          className={`barra-relleno${variante ? ` ${variante}` : ''}`}
          style={{ width: `${porcentaje}%` }}
        />
      </div>
    </div>
  )
}

function ImportLoader() {
  return (
    <div className="import-loader" aria-hidden="true">
      <svg className="import-loader-svg" viewBox="0 0 48 48" role="img">
        <circle className="import-loader-track" cx="24" cy="24" r="18" />
        <circle className="import-loader-orbit" cx="24" cy="24" r="18" />
        <path className="import-loader-mark" d="M16 25.5 21 30l11-12" />
      </svg>
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
