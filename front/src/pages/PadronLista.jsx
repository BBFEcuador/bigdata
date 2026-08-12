import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import {
  listarPersonas,
  listarProvincias,
  listarSociedadesNoSupervisadas,
  obtenerEstablecimientos,
  obtenerResumen,
} from '../services/padron.service'
import { MarcasCatastro, NOMBRE_CATASTRO, SelectorCatastro } from '../components/Catastros'
import './Padron.css'

const num = n => (n ?? 0).toLocaleString('es-EC')
const fecha = f => (f ? String(f).slice(0, 10) : '—')
const sino = v => (v === true ? 'Sí' : v === false ? 'No' : '—')

const FILTROS_VACIOS = {
  nombre: '',
  ruc: '',
  estado: '',
  provincia: '',
  catastro: '',
  catastroAnio: '',
}

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

  /**
   * Despliega los locales JUSTO DEBAJO de la fila del contribuyente.
   *
   * Antes el panel se pintaba al final de la página: con 50 filas en pantalla
   * había que bajar hasta el fondo para ver el detalle de la fila 3 y volver a
   * subir para pulsar la siguiente. Volver a pulsar el mismo botón lo cierra.
   */
  const verLocales = async ruc => {
    if (detalle?.ruc === ruc) {
      setDetalle(null)
      return
    }
    setDetalle({ ruc, cargando: true })
    try {
      const r = await obtenerEstablecimientos(ruc)
      // El usuario puede haber pulsado otra fila mientras llegaba la respuesta.
      setDetalle(d =>
        d?.ruc === ruc
          ? {
              ruc,
              establecimientos: r.establecimientos,
              turismo: r.turismo ?? [],
              catastros: r.catastros ?? [],
            }
          : d,
      )
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
        <SelectorCatastro
          catastro={filtros.catastro}
          anio={filtros.catastroAnio}
          aniosCatastro={resumen?.aniosCatastro}
          onChange={({ catastro, anio }) =>
            setFiltros(f => ({ ...f, catastro, catastroAnio: anio }))
          }
        />
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
              <th>Catastros</th>
              <th>Actividad principal</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {datos.map(d => (
              <Fragment key={d.ruc}>
              <tr className={detalle?.ruc === d.ruc ? 'abierta' : undefined}>
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
                {/* Turismo y exportadores habituales, enlazados por RUC. */}
                <td className="catastros">
                  <MarcasCatastro fila={d} />
                </td>
                <td className="actividad" title={d.actividadPrincipal ?? ''}>
                  {d.actividadPrincipal ?? '—'}
                </td>
                <td>
                  <button
                    type="button"
                    className="ver"
                    aria-expanded={detalle?.ruc === d.ruc}
                    onClick={() => verLocales(d.ruc)}
                  >
                    Locales
                  </button>
                </td>
              </tr>
              {detalle?.ruc === d.ruc && (
                <tr className="fila-detalle">
                  <td colSpan={18}>
                    <Establecimientos datos={detalle} onCerrar={() => setDetalle(null)} />
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
            {!cargando && datos.length === 0 && (
              <tr>
                <td colSpan={18} className="vacio">
                  Sin resultados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  )
}

/**
 * Todo lo que la base sabe de un RUC: sus locales del padrón del SRI, sus
 * registros turísticos y los catastros de exportadores en los que aparece.
 *
 * Las tres cosas se enlazan por el mismo RUC y llegan en una sola petición.
 */
function Establecimientos({ datos, onCerrar }) {
  const catastros = datos.catastros ?? []
  const porCatastro = catastros.reduce((acc, c) => {
    ;(acc[c.catastro] ??= []).push(Number(c.anio))
    return acc
  }, {})

  return (
    <div className="panel">
      <div className="panel-cabecera">
        <h3>Detalle de {datos.ruc}</h3>
        <button type="button" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
      {datos.cargando && <p className="cargando">Cargando…</p>}

      {Object.keys(porCatastro).length > 0 && (
        <div className="bloque-detalle">
          <h4>Catastros del SRI</h4>
          <div className="marcas-catastro fila">
            {Object.entries(porCatastro).map(([k, anios]) => (
              <span className="marca exportador" key={k}>
                {NOMBRE_CATASTRO[k] ?? k}
                <em>{anios.sort((a, b) => b - a).join(', ')}</em>
              </span>
            ))}
          </div>
        </div>
      )}

      {(datos.turismo?.length ?? 0) > 0 && (
        <div className="bloque-detalle">
          <h4>Registros turísticos ({datos.turismo.length})</h4>
          <table className="tabla">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Nombre comercial</th>
                <th>Actividad</th>
                <th>Clasificación</th>
                <th>Categoría</th>
                <th>Cantón</th>
                <th>Dirección</th>
                <th>Teléfono</th>
                <th>Correo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {datos.turismo.map(r => (
                <tr key={r.numero_registro}>
                  <td className="mono">{r.codigo_establecimiento ?? '—'}</td>
                  <td>{r.nombre_comercial ?? '—'}</td>
                  <td className="actividad">{r.actividad ?? '—'}</td>
                  <td className="actividad">{r.clasificacion ?? '—'}</td>
                  <td>{r.categoria ?? '—'}</td>
                  <td>{r.canton ?? '—'}</td>
                  <td className="actividad">{r.direccion ?? '—'}</td>
                  <td className="mono">{r.telefono ?? '—'}</td>
                  <td>{r.correo ?? '—'}</td>
                  <td>{r.estado_registro ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {datos.establecimientos && <h4 className="titulo-locales">Establecimientos del padrón</h4>}
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
