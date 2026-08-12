import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { listarBalances, obtenerResumen } from '../services/balances.service'
import './Balances.css'

const num = n => (n ?? 0).toLocaleString('es-EC')

const FILTROS_VACIOS = { anio: '', nombre: '', ruc: '', rama: '' }

/**
 * Pantalla de DATOS: qué balances hay y de quién.
 * El comparativo, los estados completos y los indicadores viven en
 * «Análisis financiero», para no mantener dos versiones de la misma tabla.
 */
export default function Balances() {
  const [filtros, setFiltros] = useState(FILTROS_VACIOS)
  const [datos, setDatos] = useState([])
  const [resumen, setResumen] = useState([])
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
                <Link className="ver" to={`/analisis?expediente=${b.expediente}`}>
                  Analizar
                </Link>
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
