import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { listarActividades, obtenerResumenCiiu } from '../services/ciiu.service'
import './Ciiu.css'

const num = n => (n ?? 0).toLocaleString('es-EC')

const FILTROS_VACIOS = { q: '', nivel: '', soloHojas: '', incluirAusentes: '' }

export default function Ciiu() {
  const [filtros, setFiltros] = useState(FILTROS_VACIOS)
  const [datos, setDatos] = useState([])
  const [resumen, setResumen] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    obtenerResumenCiiu().then(setResumen).catch(() => {})
  }, [])

  const cargar = useCallback(async f => {
    setCargando(true)
    setError(null)
    try {
      const res = await listarActividades({ ...f, conConteo: 'true' })
      setDatos(res.datos)
    } catch (e) {
      setError(e?.response?.data?.message ?? e.message)
      setDatos([])
    } finally {
      setCargando(false)
    }
  }, [])

  const timer = useRef(null)
  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => cargar(filtros), 250)
    return () => clearTimeout(timer.current)
  }, [filtros, cargar])

  const set = (campo, valor) => setFiltros(f => ({ ...f, [campo]: valor }))

  return (
    <div className="ciiu">
      <h2>Catálogo CIIU</h2>
      <p className="ayuda">Actividades económicas. Pulsa el número de compañías para verlas.</p>

      {resumen && resumen.total > 0 && (
        <div className="resumen-cajas">
          <Caja etiqueta="Actividades" valor={num(resumen.vigentes)} />
          <Caja etiqueta="Secciones" valor={num(resumen.raices)} />
          <Caja etiqueta="Último nivel" valor={num(resumen.hojas)} />
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
          <option value="1">1 · Sección</option>
          <option value="2">2 · División</option>
          <option value="3">3 · Grupo</option>
          <option value="4">4 · Clase</option>
          <option value="5">5 · Subclase</option>
          <option value="6">6 · Actividad Económica</option>
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={filtros.soloHojas === 'true'}
            onChange={e => set('soloHojas', e.target.checked ? 'true' : '')}
          />
          Sólo último nivel
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
        {num(datos.length)} actividad(es)
        {cargando && ' · cargando…'}
      </p>

      {error && <div className="alerta error">{error}</div>}

      {!cargando && datos.length === 0 && !error && (
        <div className="vacio-total">
          {resumen?.total === 0
            ? 'Todavía no se ha importado el catálogo CIIU. Ve a «Importar CIIU».'
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
                <th className="der">Compañías</th>
                <th>Aplicación</th>
              </tr>
            </thead>
            <tbody>
              {datos.map(a => (
                <tr key={a.codigo} className={a.ausenteDesdeJob ? 'ausente' : undefined}>
                  <td className="mono">{a.codigo}</td>
                  {/* Sangría por nivel: hace legible la jerarquía sin dejar de ser tabla plana. */}
                  <td
                    className="nombre"
                    style={{ paddingLeft: `${0.7 + (a.nivel - 1) * 1.1}rem` }}
                  >
                    {a.nombre}
                    {a.ausenteDesdeJob && <span className="etiqueta">ya no viene</span>}
                  </td>
                  <td className="tenue">{a.nivelNombre}</td>
                  <td className="der">
                    {a.companias === null || a.companias === undefined ? (
                      '—'
                    ) : a.companias > 0 ? (
                      <Link to={`/companias?ciiu=${encodeURIComponent(a.codigo)}`}>
                        {num(a.companias)}
                      </Link>
                    ) : (
                      '0'
                    )}
                  </td>
                  <td className="tenue aplicacion">{a.aplicacion ?? '—'}</td>
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
