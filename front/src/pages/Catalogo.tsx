import { useCallback, useEffect, useRef, useState } from 'react'
import { listarCuentas, obtenerResumen } from '../services/catalogo.service'
import '../styles/Catalogo.css'

const num = n => (n ?? 0).toLocaleString('es-EC')

const FILTROS_VACIOS = { q: '', nivel: '', soloHojas: '', incluirAusentes: '' }

export default function Catalogo() {
  const [filtros, setFiltros] = useState(FILTROS_VACIOS)
  const [datos, setDatos] = useState([])
  const [resumen, setResumen] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    obtenerResumen().then(setResumen).catch(() => {})
  }, [])

  const cargar = useCallback(async f => {
    setCargando(true)
    setError(null)
    try {
      const res = await listarCuentas(f)
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

  return (
    <div className="catalogo">
      <h2>Catálogo de cuentas</h2>

      {resumen && resumen.total > 0 && (
        <div className="resumen-cajas">
          <Caja etiqueta="Cuentas vigentes" valor={num(resumen.vigentes)} />
          <Caja etiqueta="Raíces" valor={num(resumen.raices)} />
          <Caja etiqueta="Hojas" valor={num(resumen.hojas)} />
          <Caja etiqueta="Niveles" valor={num(resumen.nivelMax)} />
        </div>
      )}

      <div className="filtros">
        <input
          placeholder="Buscar por código o nombre…"
          value={filtros.q}
          onChange={e => set('q', e.target.value)}
        />
        <select value={filtros.nivel} onChange={e => set('nivel', e.target.value)}>
          <option value="">Todos los niveles</option>
          {Array.from({ length: resumen?.nivelMax || 6 }, (_, i) => i + 1).map(n => (
            <option key={n} value={n}>
              Nivel {n}
            </option>
          ))}
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={filtros.soloHojas === 'true'}
            onChange={e => set('soloHojas', e.target.checked ? 'true' : '')}
          />
          Sólo cuentas de último nivel
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={filtros.incluirAusentes === 'true'}
            onChange={e => set('incluirAusentes', e.target.checked ? 'true' : '')}
          />
          Incluir las que ya no vienen
        </label>
        <button type="button" onClick={() => setFiltros(FILTROS_VACIOS)}>
          Limpiar
        </button>
      </div>

      <p className="resumen">
        {num(datos.length)} cuenta(s)
        {cargando && ' · cargando…'}
      </p>

      {error && <div className="alerta error">{error}</div>}

      {!cargando && datos.length === 0 && !error && (
        <div className="vacio-total">
          {resumen?.total === 0
            ? 'Todavía no se ha importado ningún catálogo. Ve a «Importar catálogo».'
            : 'Sin resultados para este filtro.'}
        </div>
      )}

      {datos.length > 0 && (
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Nivel</th>
                <th>Padre</th>
                <th>Tipo</th>
              </tr>
            </thead>
            <tbody>
              {datos.map(c => (
                <tr key={c.codigo} className={c.ausenteDesdeJob ? 'ausente' : undefined}>
                  <td className="mono">{c.codigo}</td>
                  {/* La sangría hace legible la jerarquía sin dejar de ser una tabla plana. */}
                  <td style={{ paddingLeft: `${0.7 + (c.nivel - 1) * 1.1}rem` }}>
                    {c.nombre}
                    {c.ausenteDesdeJob && <span className="etiqueta">ya no viene</span>}
                  </td>
                  <td>{c.nivel}</td>
                  <td className="mono tenue">{c.codigoPadre ?? '—'}</td>
                  <td>{c.esHoja ? 'Movimiento' : 'Agrupación'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
