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
const sino = v => (v === true ? 'Sí' : v === false ? 'No' : '—')

const FILTROS_VACIOS = { nombre: '', ruc: '', estado: '', provincia: '' }

/**
 * Listado del padrón del SRI para UNA población.
 *
 * Personas naturales y sociedades no supervisadas usan este mismo componente
 * pero son pantallas SEPARADAS, con su propia entrada de menú y su propia URL.
 * No van en pestañas dentro de una sola: son poblaciones distintas y mezclarlas
 * —aunque sea visualmente— invita a tratarlas como si fueran lo mismo.
 */
export default function PadronLista({ tipo }) {
  const config =
    tipo === 'personas'
      ? {
          titulo: 'Personas naturales',
          cargar: listarPersonas,
          etiquetaNombre: 'Nombre',
          nota:
            'Contribuyentes registrados como persona natural en el SRI. No presentan ' +
            'balances ni tienen indicadores financieros, y por eso viven en su propia ' +
            'tabla, separados de las compañías.',
        }
      : {
          titulo: 'Sociedades no supervisadas',
          cargar: listarSociedadesNoSupervisadas,
          etiquetaNombre: 'Razón social',
          nota:
            'Sociedades con RUC activo en el SRI pero SIN expediente en la ' +
            'Superintendencia de Compañías: fundaciones, cooperativas, entidades ' +
            'públicas y sociedades de hecho. Tienen actividad económica y ' +
            'establecimientos, pero nunca presentarán balances.',
        }

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

  // Al cambiar de pantalla se limpia todo: los filtros de una población no
  // tienen por qué valer para la otra.
  useEffect(() => {
    setFiltros(FILTROS_VACIOS)
    setDetalle(null)
  }, [tipo])

  const cargar = useCallback(
    async f => {
      setCargando(true)
      setError(null)
      try {
        const res = await config.cargar({ ...f, limit: 50 })
        setDatos(res.datos)
      } catch (e) {
        setError(e?.response?.data?.message ?? e.message)
        setDatos([])
      } finally {
        setCargando(false)
      }
    },
    [config],
  )

  const timer = useRef(null)
  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => cargar(filtros), 300)
    return () => clearTimeout(timer.current)
  }, [filtros, cargar])

  const set = (campo, valor) => setFiltros(f => ({ ...f, [campo]: valor }))

  const verLocales = async ruc => {
    setDetalle({ ruc, cargando: true })
    try {
      const r = await obtenerEstablecimientos(ruc)
      setDetalle({ ruc, establecimientos: r.establecimientos })
    } catch (e) {
      setError(e?.response?.data?.message ?? e.message)
      setDetalle(null)
    }
  }

  const totales =
    tipo === 'personas'
      ? [
          { k: 'Personas naturales', v: resumen?.personas },
          { k: '…de ellas activas', v: resumen?.personasActivas },
          { k: 'Establecimientos (todos)', v: resumen?.establecimientos },
        ]
      : [
          { k: 'Sociedades no supervisadas', v: resumen?.noSupervisadas },
          { k: 'Compañías en Supercias', v: resumen?.companiasEnriquecidas },
          { k: 'Establecimientos (todos)', v: resumen?.establecimientos },
        ]

  return (
    <div className="padron">
      <h2>{config.titulo}</h2>

      {resumen && (
        <div className="resumen-cajas">
          {totales.map(t => (
            <div className="caja" key={t.k}>
              <span className="caja-valor">{num(t.v)}</span>
              <span className="caja-etiqueta">{t.k}</span>
            </div>
          ))}
        </div>
      )}

      <p className="nota">{config.nota}</p>

      <div className="filtros">
        <input
          placeholder={`Buscar por ${config.etiquetaNombre.toLowerCase()}…`}
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

      {/* Todas las columnas que el padrón trae por contribuyente. La tabla
          scrollea en horizontal; recortar campos aquí sería esconder datos que
          sí existen. */}
      <div className="tabla-scroll">
        <table className="tabla">
          <thead>
            <tr>
              <th>RUC</th>
              <th>{config.etiquetaNombre}</th>
              <th>Estado</th>
              <th>Clase</th>
              <th>Jurisdicción</th>
              <th>Inicio actividades</th>
              <th>Cese (suspensión)</th>
              <th>Reinicio</th>
              <th>Últ. actualización</th>
              <th>Obligado contab.</th>
              <th>Agente reten.</th>
              <th>Contrib. especial</th>
              <th className="derecha">Locales</th>
              <th>Provincias</th>
              <th>CIIU</th>
              <th>Actividad principal</th>
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
                    {d.estadoContribuyente ?? '—'}
                  </span>
                </td>
                <td>{d.claseContribuyente ?? '—'}</td>
                <td>{d.jurisdiccion ?? '—'}</td>
                <td className="mono">{fecha(d.fechaInicioActividades)}</td>
                <td className="mono">{fecha(d.fechaSuspensionDefinitiva)}</td>
                <td className="mono">{fecha(d.fechaReinicioActividades)}</td>
                <td className="mono">{fecha(d.fechaActualizacion)}</td>
                <td>{sino(d.obligadoContabilidad)}</td>
                <td>{sino(d.agenteRetencion)}</td>
                <td>{sino(d.contribuyenteEspecial)}</td>
                <td className="derecha mono">{d.numEstablecimientos}</td>
                <td>{d.provincias ?? '—'}</td>
                <td className="mono">{d.ciiuPrincipal ?? '—'}</td>
                <td className="actividad" title={d.actividadPrincipal ?? ''}>
                  {d.actividadPrincipal ?? '—'}
                </td>
                <td>
                  <button type="button" className="ver" onClick={() => verLocales(d.ruc)}>
                    Locales
                  </button>
                </td>
              </tr>
            ))}
            {!cargando && datos.length === 0 && (
              <tr>
                <td colSpan={17} className="vacio">
                  Sin resultados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detalle && <Establecimientos datos={detalle} onCerrar={() => setDetalle(null)} />}
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
                <td>{e.estado ?? '—'}</td>
                <td>{e.provincia ?? '—'}</td>
                <td>{e.canton ?? '—'}</td>
                <td>{e.parroquia ?? '—'}</td>
                <td className="mono">{e.codigo_ciiu ?? '—'}</td>
                <td className="actividad" title={e.actividad}>
                  {e.actividad ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
