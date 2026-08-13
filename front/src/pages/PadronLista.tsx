import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import {
  listarPersonas,
  listarProvincias,
  listarSociedadesNoSupervisadas,
  obtenerEstablecimientos,
  obtenerResumen,
} from '../services/padron.service'
import { Link } from 'react-router-dom'
import { MarcasCatastro, NOMBRE_CATASTRO, SelectorCatastro } from '../components/Catastros'
import BotonRastrear from '../components/BotonRastrear'
import '../styles/Padron.css'

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
  obligadoContabilidad: '',
  agenteRetencion: '',
  contribuyenteEspecial: '',
}

/**
 * Configuración de cada pantalla del padrón.
 *
 * Las personas naturales se parten en TRES pantallas, no en una con filtros:
 * obligadas a llevar contabilidad, no obligadas e inactivas. Son tres realidades
 * comerciales que no se parecen en nada —33.396 frente a 2,7 millones frente a
 * 3,8 millones— y tenerlas en una sola lista con un desplegable hace que sea
 * fácil mirar la cifra equivocada.
 *
 * `fijos` son los filtros que DEFINEN la pantalla: se envían siempre y no se
 * enseñan, porque poder quitarlos sería poder salirse de la pantalla en la que
 * uno cree estar. `ocultar` esconde los controles que ya no significan nada
 * dentro de ella.
 *
 * Los tres tramos son exhaustivos y no se solapan: `IS NOT TRUE` en el backend
 * cubre el `false` y el `null` a la vez, así que las tres cifras suman siempre
 * el total de la tabla.
 */
const PANTALLAS = {
  personas: {
    titulo: 'Personas naturales',
    cargar: listarPersonas,
    tipoSujeto: 'persona_natural',
    etiquetaNombre: 'Nombre',
    nota:
      'Todos los contribuyentes registrados como persona natural en el SRI, sin ' +
      'separar por estado. No presentan balances ni tienen indicadores financieros, y ' +
      'por eso viven en su propia tabla, separados de las compañías.',
    fijos: {},
    ocultar: [],
    cajas: r => [
      { k: 'Personas naturales', v: r?.personas },
      { k: '…de ellas activas', v: r?.personasActivas },
      { k: 'Establecimientos (todos)', v: r?.establecimientos },
    ],
  },

  'personas-obligadas': {
    titulo: 'Personas naturales obligadas a llevar contabilidad',
    cargar: listarPersonas,
    tipoSujeto: 'persona_natural',
    etiquetaNombre: 'Nombre',
    nota:
      'Personas naturales ACTIVAS que el SRI marca como obligadas a llevar ' +
      'contabilidad, por superar los umbrales de ingresos, capital o costos. Necesitan ' +
      'contador todos los meses y presentan más obligaciones que el resto.',
    fijos: { estado: 'ACTIVO', obligadoContabilidad: 'true' },
    ocultar: ['estado', 'obligadoContabilidad'],
    cajas: r => [
      { k: 'Obligadas y activas', v: r?.personasObligadasActivas },
      { k: 'Agentes de retención (activas)', v: r?.personasAgentesActivas },
      { k: 'Total de personas naturales', v: r?.personas },
    ],
  },

  'personas-no-obligadas': {
    titulo: 'Personas naturales NO obligadas a llevar contabilidad',
    cargar: listarPersonas,
    tipoSujeto: 'persona_natural',
    etiquetaNombre: 'Nombre',
    nota:
      'Personas naturales ACTIVAS que no están obligadas a llevar contabilidad. Son ' +
      'millones: esta pantalla es un universo, no una lista de trabajo. Acótala por ' +
      'provincia, actividad o catastro antes de sacar nada de aquí.',
    fijos: { estado: 'ACTIVO', obligadoContabilidad: 'false' },
    ocultar: ['estado', 'obligadoContabilidad'],
    cajas: r => [
      { k: 'No obligadas y activas', v: r?.personasNoObligadasActivas },
      { k: '…en el catastro de turismo', v: r?.personasNoObligadasEnTurismo },
      { k: 'Total de personas naturales', v: r?.personas },
    ],
  },

  'personas-inactivas': {
    titulo: 'Personas naturales inactivas',
    cargar: listarPersonas,
    tipoSujeto: 'persona_natural',
    etiquetaNombre: 'Nombre',
    nota:
      'Personas naturales cuyo RUC NO está activo: suspendidas o pasivas. No son ' +
      'prospectos —no pueden facturar— pero siguen en la base porque un RUC ' +
      'suspendido puede reactivarse, y porque su historial explica cruces con otras ' +
      'fuentes.',
    fijos: { estadoInactivo: 'true' },
    ocultar: ['estado'],
    cajas: r => [
      { k: 'Inactivas', v: r?.personasInactivas },
      { k: '…suspendidas', v: r?.personasSuspendidas },
      { k: '…pasivas', v: r?.personasPasivas },
    ],
  },

  sociedades: {
    titulo: 'Sociedades no supervisadas',
    cargar: listarSociedadesNoSupervisadas,
    tipoSujeto: 'sociedad_no_supervisada',
    etiquetaNombre: 'Razón social',
    nota:
      'Sociedades con RUC activo en el SRI pero SIN expediente en la ' +
      'Superintendencia de Compañías: fundaciones, cooperativas, entidades ' +
      'públicas y sociedades de hecho. Tienen actividad económica y ' +
      'establecimientos, pero nunca presentarán balances.',
    fijos: {},
    ocultar: [],
    cajas: r => [
      { k: 'Sociedades no supervisadas', v: r?.noSupervisadas },
      { k: 'Compañías en Supercias', v: r?.companiasEnriquecidas },
      { k: 'Establecimientos (todos)', v: r?.establecimientos },
    ],
  },
}

/**
 * Listado del padrón del SRI para UNA población.
 *
 * Cada pantalla tiene su propia entrada de menú y su propia URL. No van en
 * pestañas dentro de una sola: son poblaciones distintas y mezclarlas —aunque
 * sea visualmente— invita a tratarlas como si fueran lo mismo.
 */
export default function PadronLista({ tipo }) {
  const config = PANTALLAS[tipo] ?? PANTALLAS.personas
  const oculto = campo => config.ocultar.includes(campo)

  const [filtros, setFiltros] = useState(FILTROS_VACIOS)
  const [datos, setDatos] = useState([])
  const [resumen, setResumen] = useState(null)
  const [provincias, setProvincias] = useState([])
  const [detalle, setDetalle] = useState(null)
  const [actividadAbierta, setActividadAbierta] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  // Resultado del último rastreo encolado desde la tabla.
  const [mensaje, setMensaje] = useState(null)

  // Paginación por keyset: el backend sólo sabe avanzar (`ruc > cursor`), así
  // que se apila el cursor de cada página para poder volver atrás.
  const [cursores, setCursores] = useState([null])
  const [pagina, setPagina] = useState(0)
  const [cursorSiguiente, setCursorSiguiente] = useState(null)

  useEffect(() => {
    obtenerResumen().then(setResumen).catch(() => {})
    listarProvincias().then(setProvincias).catch(() => {})
  }, [])

  // Al cambiar de pantalla se limpia todo: los filtros de una población no
  // tienen por qué valer para la otra.
  useEffect(() => {
    setFiltros(FILTROS_VACIOS)
    setDetalle(null)
    setActividadAbierta(null)
    setMensaje(null)
    setCursores([null])
    setPagina(0)
  }, [tipo])

  const cargar = useCallback(
    async (cursor, f) => {
      setCargando(true)
      setError(null)
      try {
        // Los filtros fijos van los ÚLTIMOS: definen la pantalla y ninguno de
        // los controles visibles puede pisarlos.
        const res = await config.cargar({ ...f, ...config.fijos, cursor, limit: 50 })
        setDatos(res.datos)
        // El backend pide una fila de más para saberlo: si no hay siguiente,
        // devuelve null y con eso basta para deshabilitar el botón.
        setCursorSiguiente(res.cursorSiguiente ?? null)
      } catch (e) {
        setError(e?.response?.data?.message ?? e.message)
        setDatos([])
        setCursorSiguiente(null)
      } finally {
        setCargando(false)
      }
    },
    [config],
  )

  // Cambiar un filtro invalida los cursores ya recorridos: se vuelve a la
  // primera página en vez de seguir paginando sobre el resultado anterior.
  const timer = useRef(null)
  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setCursores([null])
      setPagina(0)
      setDetalle(null)
      setActividadAbierta(null)
      cargar(null, filtros)
    }, 300)
    return () => clearTimeout(timer.current)
  }, [filtros, cargar])

  /** Cambio de página: lo desplegado pertenece a la página que se abandona. */
  const irA = (indice, cursor) => {
    setPagina(indice)
    setDetalle(null)
    setActividadAbierta(null)
    cargar(cursor, filtros)
  }

  const siguiente = () => {
    if (!cursorSiguiente) return
    setCursores(c => [...c.slice(0, pagina + 1), cursorSiguiente])
    irA(pagina + 1, cursorSiguiente)
  }

  const anterior = () => {
    if (pagina === 0) return
    irA(pagina - 1, cursores[pagina - 1])
  }

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

  const totales = config.cajas(resumen)

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
        {/* En las pantallas de activas el estado ya está fijado, y en la de
            inactivas sólo tiene sentido elegir entre suspendida y pasiva. */}
        {!oculto('estado') && (
          <select value={filtros.estado} onChange={e => set('estado', e.target.value)}>
            <option value="">Cualquier estado</option>
            <option value="ACTIVO">Activo</option>
            <option value="PASIVO">Pasivo</option>
            <option value="SUSPENDIDO">Suspendido</option>
          </select>
        )}
        {tipo === 'personas-inactivas' && (
          <select value={filtros.estado} onChange={e => set('estado', e.target.value)}>
            <option value="">Suspendidas y pasivas</option>
            <option value="SUSPENDIDO">Sólo suspendidas</option>
            <option value="PASIVO">Sólo pasivas</option>
          </select>
        )}
        <select value={filtros.provincia} onChange={e => set('provincia', e.target.value)}>
          <option value="">Todas las provincias</option>
          {provincias.map(p => (
            <option key={p.provincia} value={p.provincia}>
              {p.provincia}
            </option>
          ))}
        </select>
        {/* Los tres indicadores tributarios del padrón. Separan a las 33.396
            personas obligadas a llevar contabilidad de las que no lo están, que
            es una división comercial de primer orden. */}
        {!oculto('obligadoContabilidad') && (
          <select
            value={filtros.obligadoContabilidad}
            onChange={e => set('obligadoContabilidad', e.target.value)}
          >
            <option value="">Obligado a contabilidad: cualquiera</option>
            <option value="true">Obligado a llevar contabilidad</option>
            <option value="false">NO obligado a llevar contabilidad</option>
          </select>
        )}
        <select
          value={filtros.agenteRetencion}
          onChange={e => set('agenteRetencion', e.target.value)}
        >
          <option value="">Agente de retención: cualquiera</option>
          <option value="true">Agente de retención</option>
          <option value="false">No es agente de retención</option>
        </select>
        <select
          value={filtros.contribuyenteEspecial}
          onChange={e => set('contribuyenteEspecial', e.target.value)}
        >
          <option value="">Contribuyente especial: cualquiera</option>
          <option value="true">Contribuyente especial</option>
          <option value="false">No es contribuyente especial</option>
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

      {mensaje && (
        <div className={`alerta ${mensaje.tipo}`}>
          {mensaje.texto} <Link to="/scraping">Ver rastreos →</Link>
        </div>
      )}
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
                {/* Plegada a una línea: los nombres de actividad llegan a las
                    40 palabras y, envueltos, reparten de nuevo los anchos de
                    las 18 columnas en cada página. Se abre al pulsarla. */}
                <td
                  className={`actividad${actividadAbierta === d.ruc ? ' abierta' : ''}`}
                  title={d.actividadPrincipal ?? ''}
                  onClick={() => setActividadAbierta(r => (r === d.ruc ? null : d.ruc))}
                >
                  {d.actividadPrincipal ?? '—'}
                </td>
                <td className="acciones-fila">
                  <button
                    type="button"
                    className="ver"
                    aria-expanded={detalle?.ruc === d.ruc}
                    onClick={() => verLocales(d.ruc)}
                  >
                    Locales
                  </button>
                  {/* La clave es el RUC: el SRI no conoce el expediente. */}
                  <BotonRastrear
                    tipoSujeto={config.tipoSujeto}
                    clave={d.ruc}
                    onResultado={setMensaje}
                  />
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

      <div className="paginacion">
        <button type="button" onClick={anterior} disabled={pagina === 0 || cargando}>
          ← Anterior
        </button>
        <span>Página {pagina + 1}</span>
        <button type="button" onClick={siguiente} disabled={!cursorSiguiente || cargando}>
          Siguiente →
        </button>
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
  }, {}) as Record<string, number[]>

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
