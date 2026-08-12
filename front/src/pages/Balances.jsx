import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listarBalances,
  obtenerComparativo,
  obtenerResumen,
} from '../services/balances.service'
import './Balances.css'

const num = n => (n ?? 0).toLocaleString('es-EC')
const dinero = n =>
  (n ?? 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const FILTROS_VACIOS = { anio: '', nombre: '', ruc: '', rama: '' }

/** Variación porcentual entre dos años; null cuando la base es cero. */
const variacion = (antes, ahora) =>
  antes === 0 || antes === null || antes === undefined ? null : ((ahora - antes) / Math.abs(antes)) * 100

export default function Balances() {
  const [filtros, setFiltros] = useState(FILTROS_VACIOS)
  const [datos, setDatos] = useState([])
  const [resumen, setResumen] = useState([])
  const [seleccion, setSeleccion] = useState(null)
  const [comparativo, setComparativo] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    obtenerResumen().then(setResumen).catch(() => {})
  }, [])

  const cargar = useCallback(async f => {
    setCargando(true)
    setError(null)
    try {
      const res = await listarBalances({ ...f, limit: 50 })
      setDatos(res.datos)
    } catch (e) {
      setError(e?.response?.data?.message ?? e.message)
      setDatos([])
    } finally {
      setCargando(false)
    }
  }, [])

  // Debounce del tecleo para no lanzar una consulta por letra.
  const timer = useRef(null)
  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => cargar(filtros), 250)
    return () => clearTimeout(timer.current)
  }, [filtros, cargar])

  const abrir = async expediente => {
    setSeleccion(expediente)
    setComparativo(null)
    try {
      setComparativo(await obtenerComparativo(expediente))
    } catch (e) {
      setError(e?.response?.data?.message ?? e.message)
    }
  }

  const set = (campo, valor) => setFiltros(f => ({ ...f, [campo]: valor }))
  const totalBalances = resumen.reduce((a, r) => a + r.balances, 0)
  const totalCeldas = resumen.reduce((a, r) => a + r.celdas, 0)

  return (
    <div className="balances">
      <h2>Balances</h2>

      {resumen.length > 0 && (
        <div className="resumen-cajas">
          <Caja etiqueta="Balances" valor={num(totalBalances)} />
          <Caja etiqueta="Ejercicios" valor={resumen.length} />
          <Caja etiqueta="Celdas con valor" valor={num(totalCeldas)} />
        </div>
      )}

      {resumen.length > 0 && (
        <div className="por-anio">
          {[...resumen].sort((a, b) => a.anio - b.anio).map(r => (
            <button
              key={r.anio}
              type="button"
              className={`chip${String(filtros.anio) === String(r.anio) ? ' activo' : ''}`}
              onClick={() => set('anio', String(filtros.anio) === String(r.anio) ? '' : String(r.anio))}
            >
              <strong>{r.anio}</strong>
              <span>{num(r.balances)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="filtros">
        <input
          placeholder="Buscar por razón social…"
          value={filtros.nombre}
          onChange={e => set('nombre', e.target.value)}
        />
        <input
          placeholder="RUC"
          value={filtros.ruc}
          onChange={e => set('ruc', e.target.value)}
        />
        <input
          placeholder="Rama (A, B, C…)"
          maxLength={1}
          value={filtros.rama}
          onChange={e => set('rama', e.target.value.toUpperCase())}
        />
        <button type="button" onClick={() => setFiltros(FILTROS_VACIOS)}>
          Limpiar
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {cargando && <p className="cargando">Cargando…</p>}

      <table className="tabla">
        <thead>
          <tr>
            <th>Año</th>
            <th>Expediente</th>
            <th>RUC</th>
            <th>Razón social</th>
            <th>Rama</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {datos.map(b => (
            <tr key={`${b.anio}-${b.expediente}`}>
              <td>{b.anio}</td>
              <td className="mono">{b.expediente}</td>
              <td className="mono">{b.ruc}</td>
              <td>{b.nombre}</td>
              <td title={b.descripcionRama}>{b.ramaActividad}</td>
              <td>
                <button type="button" className="ver" onClick={() => abrir(b.expediente)}>
                  Ver histórico
                </button>
              </td>
            </tr>
          ))}
          {!cargando && datos.length === 0 && (
            <tr>
              <td colSpan={6} className="vacio">
                Sin resultados.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {seleccion && (
        <Comparativo
          datos={comparativo}
          onCerrar={() => {
            setSeleccion(null)
            setComparativo(null)
          }}
        />
      )}
    </div>
  )
}

function Caja({ etiqueta, valor }) {
  return (
    <div className="caja">
      <span className="caja-valor">{valor}</span>
      <span className="caja-etiqueta">{etiqueta}</span>
    </div>
  )
}

/**
 * Serie histórica de una compañía: un año por columna.
 *
 * Sólo muestra las cuentas grandes, que son las que existen en todos los
 * ejercicios. El detalle fino cambia de un año a otro y compararlo línea a línea
 * daría huecos por todas partes.
 */
function Comparativo({ datos, onCerrar }) {
  if (!datos) {
    return (
      <div className="panel">
        <p className="cargando">Cargando histórico…</p>
      </div>
    )
  }

  const bloques = [
    { id: 'situacion', titulo: 'Situación financiera' },
    { id: 'resultados', titulo: 'Resultados' },
  ]

  return (
    <div className="panel">
      <div className="panel-cabecera">
        <div>
          <h3>{datos.nombre}</h3>
          <p className="sub">
            Expediente {datos.expediente} · RUC {datos.ruc} · {datos.ciiu}
            {datos.descripcionRama ? ` · ${datos.descripcionRama}` : ''}
          </p>
        </div>
        <button type="button" onClick={onCerrar}>
          Cerrar
        </button>
      </div>

      {bloques.map(bloque => (
        <div key={bloque.id}>
          <h4>{bloque.titulo}</h4>
          <table className="tabla comparativa">
            <thead>
              <tr>
                <th>Concepto</th>
                {datos.anios.map(a => (
                  <th key={a} className="derecha">
                    {a}
                  </th>
                ))}
                <th className="derecha">Var. último año</th>
              </tr>
            </thead>
            <tbody>
              {datos.conceptos
                .filter(c => c.bloque === bloque.id)
                .map(c => {
                  const n = c.valores.length
                  const v = n >= 2 ? variacion(c.valores[n - 2], c.valores[n - 1]) : null
                  return (
                    <tr key={c.clave}>
                      <td title={`Cuenta ${c.codigo}`}>{c.etiqueta}</td>
                      {c.valores.map((valor, i) => (
                        <td key={i} className="derecha mono">
                          {dinero(valor)}
                        </td>
                      ))}
                      <td
                        className={`derecha mono ${v === null ? '' : v >= 0 ? 'sube' : 'baja'}`}
                      >
                        {v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)} %`}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
