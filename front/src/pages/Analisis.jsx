import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  listarBalances,
  obtenerComparativo,
  obtenerEstados,
  obtenerIndicadores,
} from '../services/balances.service'
import './Analisis.css'

const dinero = n =>
  n === null || n === undefined
    ? '—'
    : n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const ratio = n => (n === null || n === undefined ? '—' : n.toFixed(2))
const pct = n => (n === null || n === undefined ? '—' : `${(n * 100).toFixed(1)} %`)

const formatear = (valor, formato) =>
  formato === 'pct' ? pct(valor) : formato === 'dinero' ? dinero(valor) : ratio(valor)

/**
 * Variación porcentual entre dos períodos.
 *
 * Devuelve null cuando la base es cero —no hay variación porcentual sobre cero—
 * y también cuando cambia de signo: pasar de -100 a +50 no es "un 150 % más",
 * es una recuperación, y expresarla como porcentaje engaña más que informa.
 */
function variacion(antes, ahora) {
  if (antes === null || antes === undefined || ahora === null || ahora === undefined) return null
  if (antes === 0) return null
  if (antes < 0 && ahora >= 0) return null
  if (antes > 0 && ahora < 0) return null
  return ((ahora - antes) / Math.abs(antes)) * 100
}

const claseVar = v => (v === null ? '' : v > 0.05 ? 'sube' : v < -0.05 ? 'baja' : '')
const textoVar = v => (v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)} %`)

const PESTANAS = [
  { id: 'estados', titulo: 'Estados financieros' },
  { id: 'indicadores', titulo: 'Indicadores' },
  { id: 'resumen', titulo: 'Resumen comparable' },
]

export default function Analisis() {
  const [params] = useSearchParams()
  const [busqueda, setBusqueda] = useState('')
  const [candidatas, setCandidatas] = useState([])
  const [empresa, setEmpresa] = useState(null)
  const [pestana, setPestana] = useState('estados')
  const [error, setError] = useState(null)

  const [estados, setEstados] = useState(null)
  const [indicadores, setIndicadores] = useState(null)
  const [resumen, setResumen] = useState(null)
  const [cargando, setCargando] = useState(false)

  // Buscador con debounce; una consulta por letra sería una por cada 578.000 filas.
  const timer = useRef(null)
  useEffect(() => {
    if (busqueda.trim().length < 3) {
      setCandidatas([])
      return
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const esRuc = /^\d+$/.test(busqueda.trim())
        const res = await listarBalances({
          [esRuc ? 'ruc' : 'nombre']: busqueda.trim(),
          anio: 2025,
          limit: 15,
        })
        setCandidatas(res.datos)
      } catch (e) {
        setError(e?.response?.data?.message ?? e.message)
      }
    }, 300)
    return () => clearTimeout(timer.current)
  }, [busqueda])

  const seleccionar = useCallback(async exp => {
    setCargando(true)
    setError(null)
    setCandidatas([])
    try {
      const [e, i, r] = await Promise.all([
        obtenerEstados(exp),
        obtenerIndicadores(exp),
        obtenerComparativo(exp),
      ])
      setEstados(e)
      setIndicadores(i)
      setResumen(r)
      setEmpresa({ expediente: exp, nombre: i.nombre, ruc: i.ruc, rama: i.descripcionRama })
    } catch (err) {
      setError(err?.response?.data?.message ?? err.message)
    } finally {
      setCargando(false)
    }
  }, [])

  // Permite llegar desde la pantalla de Balances con la compañía ya elegida.
  const expedienteUrl = params.get('expediente')
  useEffect(() => {
    if (expedienteUrl) void seleccionar(expedienteUrl)
  }, [expedienteUrl, seleccionar])

  return (
    <div className="analisis">
      <h2>Análisis financiero</h2>

      <div className="buscador">
        <input
          placeholder="Busca una compañía por razón social o RUC…"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
        {candidatas.length > 0 && (
          <ul className="sugerencias">
            {candidatas.map(c => (
              <li key={c.expediente}>
                <button type="button" onClick={() => seleccionar(c.expediente)}>
                  <strong>{c.nombre}</strong>
                  <span>
                    {c.ruc} · exp. {c.expediente}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {cargando && <p className="cargando">Cargando análisis…</p>}

      {empresa && !cargando && (
        <>
          <div className="ficha">
            <h3>{empresa.nombre}</h3>
            <p className="sub">
              RUC {empresa.ruc} · Expediente {empresa.expediente}
              {empresa.rama ? ` · ${empresa.rama}` : ''}
            </p>
          </div>

          <div className="pestanas">
            {PESTANAS.map(p => (
              <button
                key={p.id}
                type="button"
                className={pestana === p.id ? 'activa' : ''}
                onClick={() => setPestana(p.id)}
              >
                {p.titulo}
              </button>
            ))}
          </div>

          {pestana === 'estados' && <Estados datos={estados} />}
          {pestana === 'indicadores' && <Indicadores datos={indicadores} />}
          {pestana === 'resumen' && <Resumen datos={resumen} />}
        </>
      )}

      {!empresa && !cargando && (
        <p className="pista">
          Escribe al menos tres caracteres para buscar una compañía.
        </p>
      )}
    </div>
  )
}

/**
 * Cabecera de una tabla comparativa: un año, y entre cada par de años su
 * variación. No sólo la del último período — el objetivo es ver la evolución
 * completa de un vistazo.
 */
function CabeceraAnios({ anios, formularios }) {
  const celdas = []
  anios.forEach((a, i) => {
    celdas.push(
      <th key={`a${a}`} className="derecha">
        {a}
        {formularios && formularios[i] !== 1 && <sup title="Formulario fiscal">F</sup>}
      </th>
    )
    if (i < anios.length - 1) {
      celdas.push(
        <th key={`v${a}`} className="derecha var">
          {String(anios[i + 1]).slice(2)}/{String(a).slice(2)}
        </th>
      )
    }
  })
  return <tr>{[<th key="c">Concepto</th>, ...celdas]}</tr>
}

/** Fila con un valor por año y la variación intercalada entre cada par. */
function FilaComparativa({ etiqueta, valores, formato, sangria = 0, destacada = false }) {
  const celdas = []
  valores.forEach((v, i) => {
    celdas.push(
      <td key={`v${i}`} className="derecha mono">
        {formatear(v, formato)}
      </td>
    )
    if (i < valores.length - 1) {
      const d = variacion(v, valores[i + 1])
      celdas.push(
        <td key={`d${i}`} className={`derecha mono var ${claseVar(d)}`}>
          {textoVar(d)}
        </td>
      )
    }
  })
  return (
    <tr className={destacada ? 'destacada' : ''}>
      <td style={{ paddingLeft: `${0.7 + sangria * 0.9}rem` }}>{etiqueta}</td>
      {celdas}
    </tr>
  )
}

/** Estados financieros completos: TODAS las cuentas del plan, no sólo las madre. */
function Estados({ datos }) {
  const [soloConValor, setSoloConValor] = useState(true)
  const [nivelMax, setNivelMax] = useState(9)
  if (!datos) return null

  const visibles = datos.cuentas.filter(
    c => c.nivel <= nivelMax && (!soloConValor || c.valores.some(v => v !== 0))
  )

  return (
    <div className="bloque">
      <div className="controles">
        <label className="check">
          <input
            type="checkbox"
            checked={soloConValor}
            onChange={e => setSoloConValor(e.target.checked)}
          />
          Ocultar cuentas en cero en todos los años
        </label>
        <label className="check">
          Nivel máximo
          <select value={nivelMax} onChange={e => setNivelMax(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 9].map(n => (
              <option key={n} value={n}>
                {n === 9 ? 'Todos' : n}
              </option>
            ))}
          </select>
        </label>
        <span className="conteo">
          {visibles.length} de {datos.cuentas.length} cuentas
        </span>
      </div>

      {datos.formulariosDisponibles.length > 1 && (
        <p className="aviso">
          Esta compañía declaró en más de un formulario. Aquí se muestran sólo los años
          del formulario {datos.formulario}: los planes de cuentas no tienen equivalencia
          cuenta a cuenta. Para comparar todos los años, usa «Resumen comparable».
        </p>
      )}

      <div className="scroll">
        <table className="tabla">
          <thead>
            <CabeceraAnios anios={datos.anios} />
          </thead>
          <tbody>
            {visibles.map(c => (
              <FilaComparativa
                key={c.codigo}
                etiqueta={
                  <>
                    <span className="codigo">{c.codigo}</span> {c.nombre}
                  </>
                }
                valores={c.valores}
                formato="dinero"
                sangria={Math.min(c.nivel - 1, 5)}
                destacada={c.nivel === 1}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Indicadores financieros, agrupados y comparados año a año. */
function Indicadores({ datos }) {
  if (!datos) return null
  return (
    <div className="bloque">
      {datos.grupos.map(g => {
        const filas = datos.indicadores.filter(i => i.grupo === g.id)
        if (filas.length === 0) return null
        return (
          <div key={g.id}>
            <h4>{g.titulo}</h4>
            <div className="scroll">
              <table className="tabla">
                <thead>
                  <CabeceraAnios anios={datos.anios} formularios={datos.formularios} />
                </thead>
                <tbody>
                  {filas.map(i => (
                    <FilaComparativa
                      key={i.clave}
                      etiqueta={i.etiqueta}
                      valores={i.valores}
                      formato={i.formato}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
      <p className="aviso">
        Un guion significa que el indicador no se puede calcular ese año: o el
        denominador es cero, o el formulario de ese ejercicio no desglosa la cuenta que
        hace falta. No se aproxima.
      </p>
    </div>
  )
}

/** Magnitudes grandes: las únicas comparables entre formularios distintos. */
function Resumen({ datos }) {
  if (!datos) return null
  const bloques = [
    { id: 'situacion', titulo: 'Situación financiera' },
    { id: 'resultados', titulo: 'Resultados' },
  ]
  return (
    <div className="bloque">
      {bloques.map(b => (
        <div key={b.id}>
          <h4>{b.titulo}</h4>
          <div className="scroll">
            <table className="tabla">
              <thead>
                <CabeceraAnios anios={datos.anios} formularios={datos.formularios} />
              </thead>
              <tbody>
                {datos.conceptos
                  .filter(c => c.bloque === b.id)
                  .map(c => (
                    <FilaComparativa
                      key={c.clave}
                      etiqueta={c.etiqueta}
                      valores={c.valores}
                      formato="dinero"
                    />
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {datos.formularios.some(f => f !== 1) && (
        <p className="aviso">
          Los años marcados con <sup>F</sup> se declararon en el formulario fiscal, con
          otro plan de cuentas. Las magnitudes están mapeadas a su equivalente, por eso
          esta vista sí cubre todos los ejercicios.
        </p>
      )}
    </div>
  )
}
