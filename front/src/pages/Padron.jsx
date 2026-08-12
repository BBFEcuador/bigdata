import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listarPersonas,
  listarProvincias,
  listarSociedadesNoSupervisadas,
  obtenerEstablecimientos,
  obtenerResumen,
} from '../services/padron.service'
import './Padron.css'

const num = n => (n ?? 0).toLocaleString('es-EC')
const fecha = f => (f ? String(f).slice(0, 10) : '—')

const FILTROS_VACIOS = { nombre: '', ruc: '', estado: '', provincia: '' }

/**
 * Padrón del SRI.
 *
 * Las dos poblaciones se consultan por separado y NUNCA salen mezcladas con las
 * compañías: las personas naturales no presentan balances, y juntarlas con las
 * empresas contaminaría cualquier métrica sectorial.
 */
const TIPOS = [
  { id: 'personas', titulo: 'Personas naturales', cargar: listarPersonas },
  {
    id: 'sociedades',
    titulo: 'Sociedades no supervisadas',
    cargar: listarSociedadesNoSupervisadas,
  },
]

export default function Padron() {
  const [tipo, setTipo] = useState('personas')
  const [filtros, setFiltros] = useState(FILTROS_VACIOS)
  const [datos, setDatos] = useState([])
  const [resumen, setResumen] = useState(null)
  const [provincias, setProvincias] = useState([])
  const [detalle, setDetalle] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    obtenerResumen().then(setResumen).catch(() => {})
    listarProvincias().then(setProvincias).catch(() => {})
  }, [])

  const cargar = useCallback(async (t, f) => {
    setCargando(true)
    setError(null)
    try {
      const fn = TIPOS.find(x => x.id === t).cargar
      const res = await fn({ ...f, limit: 50 })
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
    timer.current = setTimeout(() => cargar(tipo, filtros), 300)
    return () => clearTimeout(timer.current)
  }, [tipo, filtros, cargar])

  const set = (campo, valor) => setFiltros(f => ({ ...f, [campo]: valor }))

  const verEstablecimientos = async ruc => {
    setDetalle({ ruc, cargando: true })
    try {
      const r = await obtenerEstablecimientos(ruc)
      setDetalle({ ruc, establecimientos: r.establecimientos })
    } catch (e) {
      setError(e?.response?.data?.message ?? e.message)
      setDetalle(null)
    }
  }

  return (
    <div className="padron">
      <h2>Padrón del SRI</h2>

      {resumen && (
        <div className="resumen-cajas">
          <Caja etiqueta="Personas naturales" valor={num(resumen.personas)} />
          <Caja etiqueta="…de ellas activas" valor={num(resumen.personasActivas)} />
          <Caja etiqueta="Sociedades no supervisadas" valor={num(resumen.noSupervisadas)} />
          <Caja etiqueta="Compañías enriquecidas" valor={num(resumen.companiasEnriquecidas)} />
          <Caja etiqueta="Establecimientos" valor={num(resumen.establecimientos)} />
        </div>
      )}

      <p className="nota">
        Las personas naturales están en su propia tabla y no se mezclan nunca con las
        compañías: no presentan balances ni tienen indicadores financieros. Las
        «sociedades no supervisadas» son fundaciones, cooperativas y entidades públicas
        con RUC pero sin expediente en la Superintendencia.
      </p>

      <div className="pestanas">
        {TIPOS.map(t => (
          <button
            key={t.id}
            type="button"
            className={tipo === t.id ? 'activa' : ''}
            onClick={() => {
              setTipo(t.id)
              setDetalle(null)
            }}
          >
            {t.titulo}
          </button>
        ))}
      </div>

      <div className="filtros">
        <input
          placeholder="Buscar por nombre…"
          value={filtros.nombre}
          onChange={e => set('nombre', e.target.value)}
        />
        <input placeholder="RUC" value={filtros.ruc} onChange={e => set('ruc', e.target.value)} />
        <select value={filtros.estado} onChange={e => set('estado', e.target.value)}>
          <option value="">Cualquier estado</option>
          <option value="ACTIVO">Activo</option>
          <option value="PASIVO">Pasivo</option>
          <option value="SUSPENDIDO">Suspendido</option>
        </select>
        <select value={filtros.provincia} onChange={e => set('provincia', e.target.value)}>
          <option value="">Todas las provincias</option>
          {provincias.map(p => (
            <option key={p.provincia} value={p.provincia}>
              {p.provincia}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setFiltros(FILTROS_VACIOS)}>
          Limpiar
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {cargando && <p className="cargando">Cargando…</p>}

      <table className="tabla">
        <thead>
          <tr>
            <th>RUC</th>
            <th>Nombre</th>
            <th>Estado</th>
            <th>Clase</th>
            <th>Inicio actividades</th>
            <th className="derecha">Locales</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {datos.map(d => (
            <tr key={d.ruc}>
              <td className="mono">{d.ruc}</td>
              <td>{d.razonSocial}</td>
              <td>
                <span className={`estado ${String(d.estadoContribuyente).toLowerCase()}`}>
                  {d.estadoContribuyente}
                </span>
              </td>
              <td>{d.claseContribuyente}</td>
              <td className="mono">{fecha(d.fechaInicioActividades)}</td>
              <td className="derecha mono">{d.numEstablecimientos}</td>
              <td>
                <button
                  type="button"
                  className="ver"
                  onClick={() => verEstablecimientos(d.ruc)}
                >
                  Locales
                </button>
              </td>
            </tr>
          ))}
          {!cargando && datos.length === 0 && (
            <tr>
              <td colSpan={7} className="vacio">
                Sin resultados.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {detalle && <Establecimientos datos={detalle} onCerrar={() => setDetalle(null)} />}
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

function Establecimientos({ datos, onCerrar }) {
  return (
    <div className="panel">
      <div className="panel-cabecera">
        <h3>Establecimientos de {datos.ruc}</h3>
        <button type="button" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
      {datos.cargando && <p className="cargando">Cargando…</p>}
      {datos.establecimientos && (
        <table className="tabla">
          <thead>
            <tr>
              <th>Nº</th>
              <th>Nombre comercial</th>
              <th>Estado</th>
              <th>Provincia</th>
              <th>Cantón</th>
              <th>Parroquia</th>
              <th>CIIU</th>
              <th>Actividad</th>
            </tr>
          </thead>
          <tbody>
            {datos.establecimientos.map(e => (
              <tr key={e.numero}>
                <td className="mono">{e.numero}</td>
                <td>{e.nombre_comercial ?? '—'}</td>
                <td>{e.estado}</td>
                <td>{e.provincia}</td>
                <td>{e.canton}</td>
                <td>{e.parroquia}</td>
                <td className="mono">{e.codigo_ciiu}</td>
                <td className="actividad" title={e.actividad}>
                  {e.actividad}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
