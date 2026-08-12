import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listarCompanias, obtenerFacetas, obtenerFicha } from '../services/companias.service'
import FichaCompania from '../components/FichaCompania'
import SelectorCiiu from '../components/SelectorCiiu'
import { MarcasCatastro, SelectorCatastro } from '../components/Catastros'
import './Companias.css'

const FILTROS_VACIOS = {
  nombre: '',
  ruc: '',
  provincia: '',
  situacionLegal: '',
  tipo: '',
  ciiu: '',
  catastro: '',
  catastroAnio: '',
}

const num = n => (n ?? 0).toLocaleString('es-EC')

export default function Companias() {
  // Expediente cuya ficha completa está abierta, o null.
  const [ficha, setFicha] = useState(null)
  // El catálogo CIIU enlaza aquí con `?ciiu=G4669`, así que el filtro arranca
  // desde la URL en vez de vacío.
  const [searchParams] = useSearchParams()
  const [filtros, setFiltros] = useState({
    ...FILTROS_VACIOS,
    ciiu: searchParams.get('ciiu') ?? '',
  })
  const [datos, setDatos] = useState([])
  const [total, setTotal] = useState(null)
  const [facetas, setFacetas] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)

  // Paginación por keyset: se apila el cursor de cada página para poder volver.
  const [cursores, setCursores] = useState([null])
  const [pagina, setPagina] = useState(0)
  const [hayMas, setHayMas] = useState(false)

  useEffect(() => {
    obtenerFacetas().then(setFacetas).catch(() => {})
  }, [])

  const cargar = useCallback(
    async (cursor, filtrosActuales) => {
      setCargando(true)
      setError(null)
      try {
        const res = await listarCompanias({ ...filtrosActuales, cursor, limit: 50 })
        setDatos(res.datos)
        setHayMas(res.hayMas)
        setTotal(res.total)
      } catch (e) {
        setError(e?.response?.data?.message ?? e.message)
        setDatos([])
      } finally {
        setCargando(false)
      }
    },
    []
  )

  // Debounce del tecleo: sin esto cada letra dispara una consulta con ILIKE
  // sobre un millón de filas.
  const timer = useRef(null)
  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setCursores([null])
      setPagina(0)
      cargar(null, filtros)
    }, 350)
    return () => clearTimeout(timer.current)
  }, [filtros, cargar])

  const siguiente = () => {
    const ultimo = datos[datos.length - 1]
    if (!ultimo) return
    const nuevos = [...cursores.slice(0, pagina + 1), ultimo.expediente]
    setCursores(nuevos)
    setPagina(pagina + 1)
    cargar(ultimo.expediente, filtros)
  }

  const anterior = () => {
    if (pagina === 0) return
    setPagina(pagina - 1)
    cargar(cursores[pagina - 1], filtros)
  }

  const set = (campo, valor) => setFiltros(f => ({ ...f, [campo]: valor }))

  return (
    <div className="companias">
      <h2>Compañías</h2>

      <div className="filtros">
        <input
          placeholder="Nombre contiene…"
          value={filtros.nombre}
          onChange={e => set('nombre', e.target.value)}
        />
        <input
          placeholder="RUC empieza por…"
          value={filtros.ruc}
          onChange={e => set('ruc', e.target.value)}
        />
        <select value={filtros.provincia} onChange={e => set('provincia', e.target.value)}>
          <option value="">Toda provincia</option>
          {facetas?.provincias?.map(p => (
            <option key={p.valor} value={p.valor}>
              {p.valor} ({num(p.n)})
            </option>
          ))}
        </select>
        <select
          value={filtros.situacionLegal}
          onChange={e => set('situacionLegal', e.target.value)}
        >
          <option value="">Toda situación</option>
          {facetas?.situaciones?.map(s => (
            <option key={s.valor} value={s.valor}>
              {s.valor} ({num(s.n)})
            </option>
          ))}
        </select>
        <select value={filtros.tipo} onChange={e => set('tipo', e.target.value)}>
          <option value="">Todo tipo</option>
          {facetas?.tipos?.map(t => (
            <option key={t.valor} value={t.valor}>
              {t.valor} ({num(t.n)})
            </option>
          ))}
        </select>
        <SelectorCiiu value={filtros.ciiu} onChange={v => set('ciiu', v)} />
        <SelectorCatastro
          catastro={filtros.catastro}
          anio={filtros.catastroAnio}
          aniosCatastro={facetas?.aniosCatastro}
          onChange={({ catastro, anio }) =>
            setFiltros(f => ({ ...f, catastro, catastroAnio: anio }))
          }
        />
        <button type="button" onClick={() => setFiltros(FILTROS_VACIOS)}>
          Limpiar
        </button>
      </div>

      <p className="resumen">
        {total &&
          (total.exacto
            ? `${num(total.valor)} resultado(s)`
            : `más de ${num(total.valor)} resultados`)}
        {cargando && ' · cargando…'}
      </p>

      {error && <div className="alerta error">{error}</div>}

      <div className="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th>Expediente</th>
              <th>RUC</th>
              <th>Nombre</th>
              <th>Situación</th>
              <th>SRI</th>
              <th>Representante legal</th>
              <th>Cargo</th>
              <th>Teléfono</th>
              <th>Tipo</th>
              <th>Provincia</th>
              <th>Cantón</th>
              <th>Parroquia</th>
              <th className="der">Capital</th>
              <th>Constitución</th>
              <th className="der">Locales</th>
              <th>Catastros</th>
              <th>Actividad económica</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {datos.map(c => (
              <tr key={c.expediente}>
                <td>{c.expediente}</td>
                <td className="mono">{c.ruc ?? '—'}</td>
                <td>{c.nombre}</td>
                <td>{c.situacionLegal ?? '—'}</td>
                {/* Estado ante el SRI: es distinto de la situación legal en
                    Supercias, y para prospección comercial manda éste. */}
                <td>
                  {c.sriEstadoContribuyente ? (
                    <span className={`estado ${String(c.sriEstadoContribuyente).toLowerCase()}`}>
                      {c.sriEstadoContribuyente}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{c.representante ?? '—'}</td>
                <td>{c.cargo ?? '—'}</td>
                <td className="mono">{c.telefono ?? '—'}</td>
                <td>{c.tipo ?? '—'}</td>
                <td>{c.provincia ?? '—'}</td>
                <td>{c.canton ?? '—'}</td>
                <td>{c.sriParroquia ?? '—'}</td>
                <td className="der mono">
                  {c.capitalSuscrito === null
                    ? '—'
                    : c.capitalSuscrito.toLocaleString('es-EC', {
                        minimumFractionDigits: 2,
                      })}
                </td>
                <td>{c.fechaConstitucion ?? '—'}</td>
                <td className="der mono">{c.sriNumEstablecimientos ?? '—'}</td>
                {/* Turismo y exportadores habituales, enlazados por RUC. */}
                <td className="catastros">
                  <MarcasCatastro fila={c} />
                </td>
                {/* Un código que no esté en el catálogo se muestra tal cual, sin
                    descripción: hay unos pocos, incluido un ZZZZZ.ZZ de relleno. */}
                <td className="actividad" title={c.ciiuNivel6 ?? ''}>
                  {c.actividad ?? (c.ciiuNivel6 ? <span className="tenue">{c.ciiuNivel6}</span> : '—')}
                </td>
                <td>
                  <button type="button" className="ver" onClick={() => setFicha(c.expediente)}>
                    Ficha
                  </button>
                </td>
              </tr>
            ))}
            {!cargando && datos.length === 0 && (
              <tr>
                <td colSpan={18} className="vacio">
                  Sin resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {ficha && <FichaCompania expediente={ficha} onCerrar={() => setFicha(null)} cargar={obtenerFicha} />}

      <div className="paginacion">
        <button type="button" onClick={anterior} disabled={pagina === 0 || cargando}>
          ← Anterior
        </button>
        <span>Página {pagina + 1}</span>
        <button type="button" onClick={siguiente} disabled={!hayMas || cargando}>
          Siguiente →
        </button>
      </div>
    </div>
  )
}
