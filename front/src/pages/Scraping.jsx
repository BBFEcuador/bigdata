import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ACCIONES_POR_ESTADO,
  ESTADOS,
  ETIQUETA_ACCION,
  ETIQUETA_ESTADO,
  ETIQUETA_SUJETO,
  TIPOS_SUJETO,
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
const POR_PAGINA = 50

const fecha = v =>
  v ? new Date(v).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'medium' }) : '—'

const FILTROS_VACIOS = { estado: '', fuente: '', tipoSujeto: '', q: '' }

export default function Scraping() {
  // `texto` es lo que se está tecleando; `filtros.q` es lo que ya se consultó.
  // Separarlos es lo que permite el debounce sin que el input se sienta lento.
  const [texto, setTexto] = useState('')
  const [filtros, setFiltros] = useState(FILTROS_VACIOS)

  const [jobs, setJobs] = useState([])
  const [resumen, setResumen] = useState({ porEstado: {} })
  const [despachador, setDespachador] = useState(null)
  const [fuentes, setFuentes] = useState([])
  const [usuario, setUsuario] = useState(usuarioActual())
  const [ocupado, setOcupado] = useState(null)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)

  // Paginación por cursor, no por número de página: la lista se mueve sola
  // mientras el despachador trabaja, y con OFFSET cada refresco saltaría filas.
  // Se apila el cursor de cada página para poder volver atrás.
  const [cursores, setCursores] = useState([null])
  const [pagina, setPagina] = useState(0)
  const [hayMas, setHayMas] = useState(false)

  const enVuelo = useRef(false)

  const cargar = useCallback(async () => {
    // Nunca dos peticiones a la vez: si una tarda más que el intervalo, se
    // apilarían hasta ahogar al servidor.
    if (enVuelo.current) return
    enVuelo.current = true
    try {
      const [lista, res] = await Promise.all([
        listarJobs({ ...filtros, desde: cursores[pagina], limite: POR_PAGINA }),
        obtenerResumen(),
      ])
      setJobs(lista.filas)
      setHayMas(lista.hayMas)
      // El cursor de la página siguiente se guarda al recibirla, no al pulsar:
      // así "Siguiente" no tiene que adivinar dónde termina la actual.
      if (lista.siguiente) {
        setCursores(c => {
          if (c[pagina + 1] === lista.siguiente) return c
          const nuevo = c.slice(0, pagina + 1)
          nuevo.push(lista.siguiente)
          return nuevo
        })
      }
      setResumen(lista.resumen)
      setDespachador(res.despachador)
      setError(null)
    } catch (e) {
      setError(e?.response?.data?.message ?? e.message)
    } finally {
      enVuelo.current = false
    }
  }, [filtros, cursores, pagina])

  useEffect(() => {
    listarFuentes().then(setFuentes).catch(() => setFuentes([]))
  }, [])

  // Debounce del tecleo: sin esto cada letra dispara un ILIKE contra la tabla.
  const timer = useRef(null)
  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setFiltros(f => (f.q === texto.trim() ? f : { ...f, q: texto.trim() }))
    }, 350)
    return () => clearTimeout(timer.current)
  }, [texto])

  // Cualquier cambio de filtro devuelve a la primera página: el cursor de la
  // página 3 de la búsqueda anterior no significa nada en la nueva.
  useEffect(() => {
    setCursores([null])
    setPagina(0)
  }, [filtros])

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

  const limpiar = () => {
    setTexto('')
    setFiltros(FILTROS_VACIOS)
  }

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
    // El alta masiva es de UNA población: encolar las tres de golpe serían 7,1
    // millones de sujetos que no se trabajan igual. Se toma la del filtro, y si
    // no hay ninguno puesto, compañías.
    const tipoSujeto = filtros.tipoSujeto || 'compania'
    const cuantas = window.prompt(
      `¿Cuántos sujetos de «${ETIQUETA_SUJETO[tipoSujeto]}» encolo?`,
      '100',
    )
    if (!cuantas) return
    setOcupado('masivo')
    setError(null)
    try {
      const r = await encolarMasivo({
        tipoSujeto,
        limite: Number(cuantas),
        fuente: filtros.fuente || undefined,
      })
      setAviso(
        `Encolados ${r.creados} de «${ETIQUETA_SUJETO[tipoSujeto]}». ` +
          (r.omitidos > 0 ? `${r.omitidos} ya tenían un job vivo y se saltaron.` : ''),
      )
      await cargar()
    } catch (e) {
      setError(e?.response?.data?.message ?? e.message)
    } finally {
      setOcupado(null)
    }
  }

  const hayFiltro = filtros.estado || filtros.fuente || filtros.q || filtros.tipoSujeto

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
          que se hace todo el rato ("¿cuántos han fallado?" → clic → verlos).
          Los números respetan la búsqueda, pero no el estado elegido. */}
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
          className="buscador"
          placeholder="Buscar por expediente, RUC o nombre"
          value={texto}
          onChange={e => setTexto(e.target.value)}
        />
        <select value={filtros.tipoSujeto} onChange={e => set('tipoSujeto', e.target.value)}>
          <option value="">Todas las poblaciones</option>
          {TIPOS_SUJETO.map(t => (
            <option key={t} value={t}>
              {ETIQUETA_SUJETO[t]}
            </option>
          ))}
        </select>
        <select value={filtros.fuente} onChange={e => set('fuente', e.target.value)}>
          <option value="">Todas las fuentes</option>
          {fuentes.map(f => (
            <option key={f.fuente} value={f.fuente}>
              {f.etiqueta}
            </option>
          ))}
        </select>
        <button onClick={limpiar} disabled={!hayFiltro}>
          Limpiar
        </button>
      </div>

      {jobs.length === 0 && !error && (
        <div className="vacio-total">
          {hayFiltro
            ? 'Ningún job coincide con la búsqueda.'
            : 'No hay jobs todavía. Pulsa «Encolar compañías», o lánzalos de uno en uno desde la pantalla de Compañías.'}
        </div>
      )}

      {jobs.length > 0 && (
        <>
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Sujeto</th>
                  <th>Población</th>
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
                        <span className="mono">{j.clave}</span>
                        {/* El RUC sólo si aporta: en el padrón la clave YA es
                            el RUC y repetirlo sería ruido. */}
                        {j.ruc && j.ruc !== j.clave && (
                          <span className="mono ruc"> · {j.ruc}</span>
                        )}
                        {j.nombre && <p className="nombre">{j.nombre}</p>}
                      </td>
                      <td className="tenue">{ETIQUETA_SUJETO[j.tipo_sujeto] ?? j.tipo_sujeto}</td>
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

          <div className="paginacion">
            <button type="button" onClick={() => setPagina(p => p - 1)} disabled={pagina === 0}>
              ← Anterior
            </button>
            <span>Página {pagina + 1}</span>
            <button type="button" onClick={() => setPagina(p => p + 1)} disabled={!hayMas}>
              Siguiente →
            </button>
          </div>
        </>
      )}
    </div>
  )
}
