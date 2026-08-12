import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ACCIONES_POR_ESTADO,
  ESTADOS,
  ETIQUETA_ACCION,
  ETIQUETA_ESTADO,
  accionar,
  encolarMasivo,
  esperaRestante,
  etiquetaViva,
  fijarUsuario,
  listarFuentes,
  listarJobs,
  obtenerResumen,
  usuarioActual,
} from '../services/scraping.service'
import './Scraping.css'

const INTERVALO_MS = 2000

const fecha = v =>
  v ? new Date(v).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'medium' }) : '—'

const FILTROS_VACIOS = { estado: '', fuente: '', expediente: '' }

export default function Scraping() {
  const [filtros, setFiltros] = useState(FILTROS_VACIOS)
  const [jobs, setJobs] = useState([])
  const [resumen, setResumen] = useState({ porEstado: {} })
  const [despachador, setDespachador] = useState(null)
  const [fuentes, setFuentes] = useState([])
  const [usuario, setUsuario] = useState(usuarioActual())
  const [ocupado, setOcupado] = useState(null)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)

  // Evita apilar peticiones si una tarda más que el intervalo: es el mismo
  // guardia que usa el panel de importación.
  const enVuelo = useRef(false)

  const cargar = useCallback(async () => {
    if (enVuelo.current) return
    enVuelo.current = true
    try {
      const [lista, res] = await Promise.all([listarJobs(filtros), obtenerResumen()])
      setJobs(lista.filas)
      setResumen(lista.resumen)
      setDespachador(res.despachador)
      setError(null)
    } catch (e) {
      setError(e?.response?.data?.message ?? e.message)
    } finally {
      enVuelo.current = false
    }
  }, [filtros])

  useEffect(() => {
    listarFuentes().then(setFuentes).catch(() => setFuentes([]))
  }, [])

  useEffect(() => {
    cargar()
    const id = setInterval(() => {
      // Una pestaña de fondo no necesita treinta consultas por minuto contra
      // una tabla que puede tener millones de filas.
      if (!document.hidden) cargar()
    }, INTERVALO_MS)
    return () => clearInterval(id)
  }, [cargar])

  const set = (campo, valor) => setFiltros(f => ({ ...f, [campo]: valor }))

  const guardarUsuario = v => {
    setUsuario(v)
    fijarUsuario(v)
  }

  /**
   * Ejecuta una acción y deja que el siguiente refresco reconcilie.
   *
   * Nada de pintar el estado nuevo por adelantado: pausar un job que ya corre
   * no es instantáneo, y ver «Pausado» y que un segundo después vuelva a
   * «Corriendo» es peor que no ver nada.
   */
  const accion = async (id, nombre) => {
    if (!usuario.trim()) {
      setError('Escribe tu usuario arriba: toda acción queda firmada.')
      return
    }
    setOcupado(`${id}:${nombre}`)
    setAviso(null)
    try {
      await accionar(id, nombre)
      await cargar()
    } catch (e) {
      setError(e?.response?.data?.message ?? e.message)
    } finally {
      setOcupado(null)
    }
  }

  const encolar = async () => {
    if (!usuario.trim()) {
      setError('Escribe tu usuario arriba: toda acción queda firmada.')
      return
    }
    const cuantas = window.prompt('¿Cuántas compañías encolo?', '100')
    if (!cuantas) return
    setOcupado('masivo')
    setError(null)
    try {
      const r = await encolarMasivo({ limite: Number(cuantas), fuente: filtros.fuente || undefined })
      setAviso(
        `Encoladas ${r.creados}. ` +
          (r.omitidos > 0 ? `${r.omitidos} ya tenían un job vivo y se saltaron.` : ''),
      )
      await cargar()
    } catch (e) {
      setError(e?.response?.data?.message ?? e.message)
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div className="scraping">
      <div className="cabecera">
        <h2>Rastreo de compañías</h2>
        <div className="firma">
          <label htmlFor="usuario">Usuario</label>
          <input
            id="usuario"
            value={usuario}
            placeholder="tu nombre"
            onChange={e => guardarUsuario(e.target.value)}
          />
          <button className="primario" onClick={encolar} disabled={ocupado === 'masivo'}>
            {ocupado === 'masivo' ? 'Encolando…' : 'Encolar compañías'}
          </button>
        </div>
      </div>

      {despachador && (
        <p className="tenue despachador">
          {despachador.ocupados} de {despachador.concurrencia} trabajadores ocupados en{' '}
          <span className="mono">{despachador.identidad}</span>
        </p>
      )}

      {error && <div className="alerta error">{error}</div>}
      {aviso && <div className="alerta ok">{aviso}</div>}

      {/* Las fichas del resumen son a la vez el filtro por estado: es la lectura
          que se hace todo el rato ("¿cuántos han fallado?" → clic → verlos). */}
      <div className="fichas">
        {ESTADOS.map(e => (
          <button
            key={e}
            className={`ficha ${e} ${filtros.estado === e ? 'activa' : ''}`}
            onClick={() => set('estado', filtros.estado === e ? '' : e)}
          >
            <span className="n">{(resumen.porEstado?.[e] ?? 0).toLocaleString('es-EC')}</span>
            <span className="et">{ETIQUETA_ESTADO[e]}</span>
          </button>
        ))}
      </div>

      <div className="filtros">
        <input
          placeholder="Expediente"
          value={filtros.expediente}
          onChange={e => set('expediente', e.target.value.trim())}
        />
        <select value={filtros.fuente} onChange={e => set('fuente', e.target.value)}>
          <option value="">Todas las fuentes</option>
          {fuentes.map(f => (
            <option key={f.fuente} value={f.fuente}>
              {f.etiqueta}
            </option>
          ))}
        </select>
        <button onClick={() => setFiltros(FILTROS_VACIOS)}>Limpiar</button>
      </div>

      {jobs.length === 0 && !error && (
        <div className="vacio-total">
          No hay jobs que mostrar. Pulsa «Encolar compañías» para empezar.
        </div>
      )}

      {jobs.length > 0 && (
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Compañía</th>
                <th>Fuente</th>
                <th>Estado</th>
                <th className="der">Intentos</th>
                <th>Último error</th>
                <th>Actualizado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(j => {
                const espera = esperaRestante(j)
                return (
                  <tr key={j.id}>
                    <td>
                      <span className="mono">{j.expediente}</span>
                      {j.nombre && <p className="nombre">{j.nombre}</p>}
                    </td>
                    <td className="tenue">{j.fuente}</td>
                    <td>
                      <span className={`estado ${j.estado}`}>{etiquetaViva(j)}</span>
                      {j.estado === 'corriendo' && (
                        <span className="barra">
                          <i style={{ width: `${j.progreso_pct}%` }} />
                          <em>
                            {j.progreso_pct}% {j.paso}
                          </em>
                        </span>
                      )}
                      {espera && <p className="tenue">{espera}</p>}
                    </td>
                    <td className="der mono">
                      {j.intentos}/{j.max_intentos}
                    </td>
                    <td className="motivo" title={j.ultimo_error ?? ''}>
                      {j.ultimo_error ?? '—'}
                    </td>
                    <td className="tenue">{fecha(j.actualizado_en)}</td>
                    <td className="acciones">
                      {(ACCIONES_POR_ESTADO[j.estado] ?? []).map(a => (
                        <button
                          key={a}
                          className={a}
                          disabled={ocupado === `${j.id}:${a}`}
                          onClick={() => accion(j.id, a)}
                        >
                          {ocupado === `${j.id}:${a}` ? '…' : ETIQUETA_ACCION[a]}
                        </button>
                      ))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
