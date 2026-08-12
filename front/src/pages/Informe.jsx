import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  obtenerComparativo,
  obtenerEstados,
  obtenerIndicadores,
  obtenerSectorial,
} from '../services/balances.service'
import { MARCA, NOTA_LEGAL } from '../marca'
import './Informe.css'

const dinero = n =>
  n === null || n === undefined
    ? '—'
    : n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const ratio = n => (n === null || n === undefined ? '—' : n.toFixed(2))
const pct = n => (n === null || n === undefined ? '—' : `${(n * 100).toFixed(1)} %`)

const formatear = (valor, formato) =>
  formato === 'pct' ? pct(valor) : formato === 'dinero' ? dinero(valor) : ratio(valor)

/** Misma regla que en pantalla: sin variación sobre cero ni sobre cambio de signo. */
function variacion(antes, ahora) {
  if (antes === null || antes === undefined || ahora === null || ahora === undefined) return null
  if (antes === 0) return null
  if (antes < 0 && ahora >= 0) return null
  if (antes > 0 && ahora < 0) return null
  return ((ahora - antes) / Math.abs(antes)) * 100
}

const textoVar = v => (v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)} %`)
const claseVar = v => (v === null ? '' : v > 0.05 ? 'sube' : v < -0.05 ? 'baja' : '')

const hoy = () =>
  new Date().toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' })

/**
 * Informe financiero imprimible de una compañía.
 *
 * Es una pantalla aparte y no una pestaña más del análisis, por tres motivos:
 *
 * 1. **Se imprime entero.** El análisis muestra una pestaña cada vez; un informe
 *    que sólo llevara la pestaña abierta sería un documento distinto según desde
 *    dónde se pulsara el botón.
 * 2. **No lleva la aplicación alrededor.** La ruta va fuera del `Layout`, así que
 *    no hay menú lateral que esconder al imprimir ni riesgo de que se cuele.
 * 3. **Es un documento con autor.** Lleva la marca de quien lo emite, la fecha y
 *    la nota de procedencia de las cifras; eso no pinta en una pantalla de
 *    consulta interna.
 *
 * El PDF lo genera el propio navegador con `window.print()`: no hay ninguna
 * librería de PDF en el proyecto y meter uno de 300 MB para maquetar tablas
 * sería desproporcionado. El diálogo de impresión ofrece «Guardar como PDF», y
 * el resultado sale con texto vectorial y seleccionable, que es mejor que el de
 * casi cualquier generador de cliente.
 */
export default function Informe() {
  const { expediente } = useParams()
  const [params] = useSearchParams()

  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(true)

  /**
   * Profundidad del plan de cuentas que entra en el informe.
   *
   * Por defecto 3. Con todas las cuentas el documento pasa de 40 páginas y deja
   * de ser un informe para ser un volcado; con nivel 3 caben activo, pasivo,
   * patrimonio y resultados con su primer desglose útil.
   */
  const [nivelMax, setNivelMax] = useState(Number(params.get('nivel')) || 3)
  const [secciones, setSecciones] = useState({
    resumen: true,
    indicadores: true,
    sector: true,
    estados: true,
  })

  useEffect(() => {
    let vigente = true
    setCargando(true)
    Promise.all([
      obtenerEstados(expediente),
      obtenerIndicadores(expediente),
      obtenerComparativo(expediente),
      // Una compañía sin percentiles calculados no invalida el informe: la
      // sección lo dice y el resto se emite igual.
      obtenerSectorial(expediente).catch(() => null),
    ])
      .then(([estados, indicadores, resumen, sectorial]) => {
        if (vigente) setDatos({ estados, indicadores, resumen, sectorial })
      })
      .catch(e => vigente && setError(e?.response?.data?.message ?? e.message))
      .finally(() => vigente && setCargando(false))
    return () => {
      vigente = false
    }
  }, [expediente])

  const imprimir = useCallback(() => window.print(), [])

  if (cargando) return <p className="informe-aviso">Preparando el informe…</p>
  if (error) return <p className="informe-aviso error">{error}</p>
  if (!datos) return null

  const { estados, indicadores, resumen, sectorial } = datos
  const empresa = indicadores

  return (
    <div
      className="informe"
      style={{
        '--marca': MARCA.colores.primario,
        '--acento': MARCA.colores.acento,
        '--acento-oscuro': MARCA.colores.acentoOscuro,
        '--tinta': MARCA.colores.tinta,
        '--tenue': MARCA.colores.tenue,
        '--arena': MARCA.colores.arena,
        '--arena-borde': MARCA.colores.arenaBorde,
        '--tipo': MARCA.tipografia,
      }}
    >
      {/* Barra de control: existe sólo en pantalla, nunca en el papel. */}
      <div className="barra-informe">
        <Link className="volver" to={`/analisis?expediente=${expediente}`}>
          ← Volver al análisis
        </Link>

        <label className="control">
          Detalle de cuentas
          <select value={nivelMax} onChange={e => setNivelMax(Number(e.target.value))}>
            <option value={1}>Sólo totales</option>
            <option value={2}>Hasta nivel 2</option>
            <option value={3}>Hasta nivel 3</option>
            <option value={4}>Hasta nivel 4</option>
            <option value={9}>Todas las cuentas</option>
          </select>
        </label>

        {[
          ['resumen', 'Resumen'],
          ['indicadores', 'Indicadores'],
          ['sector', 'Sector'],
          ['estados', 'Estados'],
        ].map(([id, etiqueta]) => (
          <label className="control check" key={id}>
            <input
              type="checkbox"
              checked={secciones[id]}
              onChange={e => setSecciones(s => ({ ...s, [id]: e.target.checked }))}
            />
            {etiqueta}
          </label>
        ))}

        <button type="button" className="descargar" onClick={imprimir}>
          Descargar PDF
        </button>
      </div>

      <p className="pista-impresion">
        Se abrirá el diálogo de impresión: elige <b>Guardar como PDF</b> como destino. Si
        no quieres la fecha y la dirección del navegador en los márgenes, desmarca
        «Encabezados y pies de página» en las opciones del diálogo.
      </p>

      {/* ------------------------------------------------ documento */}
      <article className="hoja">
        <header className="portada">
          <div className="emisor">
            {MARCA.logo}
            <span className="descripcion">{MARCA.descripcion}</span>
          </div>

          <div className="titulo">
            <p className="tipo-doc">{MARCA.tituloInforme}</p>
            <p className="tipo-doc-sub">{MARCA.subtituloInforme}</p>
            <h1>{empresa.nombre}</h1>
            <p className="identificacion">
              RUC {empresa.ruc} · Expediente {empresa.expediente}
            </p>
            {empresa.descripcionRama && (
              <p className="rama">
                {empresa.ramaActividad} · {empresa.descripcionRama}
              </p>
            )}
          </div>

          <dl className="meta">
            <div>
              <dt>Ejercicios analizados</dt>
              <dd>
                {empresa.anios[0]} – {empresa.anios[empresa.anios.length - 1]}
              </dd>
            </div>
            <div>
              <dt>Fecha de emisión</dt>
              <dd>{hoy()}</dd>
            </div>
            <div>
              <dt>Emitido por</dt>
              <dd>{MARCA.nombre}</dd>
            </div>
          </dl>
        </header>

        {secciones.resumen && <SeccionResumen datos={resumen} />}
        {secciones.indicadores && <SeccionIndicadores datos={indicadores} />}
        {secciones.sector && <SeccionSector datos={sectorial} />}
        {secciones.estados && <SeccionEstados datos={estados} nivelMax={nivelMax} />}

        <footer className="pie-documento">
          <p>{NOTA_LEGAL}</p>
          <p className="firma">
            {MARCA.nombre}
            {MARCA.contacto ? ` · ${MARCA.contacto}` : ''} · Emitido el {hoy()}
          </p>
        </footer>
      </article>
    </div>
  )
}

/** Cabecera de años con la variación intercalada entre cada par. */
function CabeceraAnios({ anios, formularios }) {
  const celdas = []
  anios.forEach((a, i) => {
    celdas.push(
      <th key={`a${a}`} className="der">
        {a}
        {formularios && formularios[i] !== 1 && <sup>F</sup>}
      </th>,
    )
    if (i < anios.length - 1) {
      celdas.push(
        <th key={`v${a}`} className="der var">
          {String(anios[i + 1]).slice(2)}/{String(a).slice(2)}
        </th>,
      )
    }
  })
  return <tr>{[<th key="c">Concepto</th>, ...celdas]}</tr>
}

function Fila({ etiqueta, valores, formato, sangria = 0, destacada = false }) {
  const celdas = []
  valores.forEach((v, i) => {
    celdas.push(
      <td key={`v${i}`} className="der mono">
        {formatear(v, formato)}
      </td>,
    )
    if (i < valores.length - 1) {
      const d = variacion(v, valores[i + 1])
      celdas.push(
        <td key={`d${i}`} className={`der mono var ${claseVar(d)}`}>
          {textoVar(d)}
        </td>,
      )
    }
  })
  return (
    <tr className={destacada ? 'destacada' : ''}>
      <td style={{ paddingLeft: `${0.35 + sangria * 0.75}rem` }}>{etiqueta}</td>
      {celdas}
    </tr>
  )
}

/**
 * Envoltura de tabla.
 *
 * En pantalla estrecha scrollea la tabla, nunca el documento: una hoja que se
 * mueve en horizontal deja de parecer una hoja. Al imprimir el marco
 * desaparece, porque en A4 las columnas sí caben.
 */
function Tabla({ children, className }) {
  return (
    <div className="marco-tabla">
      <table className={className}>{children}</table>
    </div>
  )
}

function Seccion({ numero, titulo, nota, children }) {
  return (
    <section className="seccion">
      <h2>
        <span className="num">{numero}</span>
        {titulo}
      </h2>
      {children}
      {nota && <p className="nota">{nota}</p>}
    </section>
  )
}

function SeccionResumen({ datos }) {
  if (!datos) return null
  const bloques = [
    { id: 'situacion', titulo: 'Situación financiera' },
    { id: 'resultados', titulo: 'Resultados' },
  ]
  return (
    <Seccion
      numero="1"
      titulo="Magnitudes principales"
      nota={
        datos.formularios.some(f => f !== 1)
          ? 'Los años marcados con F se declararon en el formulario fiscal, con otro plan de cuentas. Las magnitudes están mapeadas a su equivalente, por eso esta sección sí cubre todos los ejercicios.'
          : null
      }
    >
      {bloques.map(b => (
        <div className="grupo" key={b.id}>
          <h3>{b.titulo}</h3>
          <Tabla>
            <thead>
              <CabeceraAnios anios={datos.anios} formularios={datos.formularios} />
            </thead>
            <tbody>
              {datos.conceptos
                .filter(c => c.bloque === b.id)
                .map(c => (
                  <Fila key={c.clave} etiqueta={c.etiqueta} valores={c.valores} formato="dinero" />
                ))}
            </tbody>
          </Tabla>
        </div>
      ))}
    </Seccion>
  )
}

function SeccionIndicadores({ datos }) {
  if (!datos) return null
  return (
    <Seccion
      numero="2"
      titulo="Indicadores financieros"
      nota="Un guion significa que el indicador no se puede calcular ese año: o el denominador es cero, o el formulario de ese ejercicio no desglosa la cuenta que hace falta. No se aproxima."
    >
      {datos.grupos.map(g => {
        const filas = datos.indicadores.filter(i => i.grupo === g.id)
        if (filas.length === 0) return null
        return (
          <div className="grupo" key={g.id}>
            <h3>{g.titulo}</h3>
            <Tabla>
              <thead>
                <CabeceraAnios anios={datos.anios} formularios={datos.formularios} />
              </thead>
              <tbody>
                {filas.map(i => (
                  <Fila key={i.clave} etiqueta={i.etiqueta} valores={i.valores} formato={i.formato} />
                ))}
              </tbody>
            </Tabla>
          </div>
        )
      })}
    </Seccion>
  )
}

/** Verde/rojo sólo cuando el indicador dice hacia dónde es mejor estar. */
function claseP(p, mejor) {
  if (p === null || p === undefined || mejor === 'neutro') return ''
  const bueno = mejor === 'alto' ? p >= 75 : p <= 25
  const malo = mejor === 'alto' ? p <= 25 : p >= 75
  return bueno ? 'bien' : malo ? 'mal' : ''
}

function SeccionSector({ datos }) {
  if (!datos || datos.anios?.length === 0) {
    return (
      <Seccion numero="3" titulo="Posición frente al sector">
        <p className="nota">
          Esta compañía todavía no tiene percentiles calculados, o ninguno de sus
          indicadores pudo compararse. El resto del informe no se ve afectado.
        </p>
      </Seccion>
    )
  }

  const ultimo = datos.anios.length - 1

  return (
    <Seccion
      numero="3"
      titulo={`Posición frente al sector · ${datos.anios[ultimo]}`}
      nota="El percentil es el porcentaje de empresas del sector que quedan por debajo. El grupo de pares es la división CIIU del año; cuando la división tiene menos de 30 empresas se compara contra la sección."
    >
      <p className="sector-pares">
        Grupo de comparación: <b>{datos.sectores[ultimo]?.codigo}</b>{' '}
        {datos.sectores[ultimo]?.nombre} ·{' '}
        {datos.sectores[ultimo]?.nivel === 'division' ? 'división CIIU' : 'sección CIIU'}
      </p>

      {datos.grupos.map(g => {
        const filas = datos.indicadores.filter(i => i.grupo === g.id)
        if (filas.length === 0) return null
        return (
          <div className="grupo" key={g.id}>
            <h3>{g.titulo}</h3>
            <Tabla className="tabla-sector">
              <thead>
                <tr>
                  <th>Indicador</th>
                  <th className="der">La compañía</th>
                  <th className="der">Mediana del sector</th>
                  <th className="der">Percentil</th>
                  <th className="posicion">Posición</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(i => {
                  const p = i.percentiles[ultimo]
                  const c = i.cortes[ultimo]
                  return (
                    <tr key={i.clave}>
                      <td>{i.etiqueta}</td>
                      <td className="der mono">{formatear(i.valores[ultimo], i.formato)}</td>
                      <td className="der mono tenue">
                        {c ? formatear(c.p50, i.formato) : '—'}
                      </td>
                      <td className={`der mono pct ${claseP(p, i.mejor)}`}>
                        {p === null || p === undefined ? '—' : `p${p}`}
                      </td>
                      <td className="posicion">
                        {p !== null && p !== undefined && (
                          <span className="barra">
                            <span
                              className={`relleno ${claseP(p, i.mejor)}`}
                              style={{ width: `${p}%` }}
                            />
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Tabla>
          </div>
        )
      })}
    </Seccion>
  )
}

function SeccionEstados({ datos, nivelMax }) {
  if (!datos) return null
  const visibles = datos.cuentas.filter(
    c => c.nivel <= nivelMax && c.valores.some(v => v !== 0),
  )
  return (
    <Seccion
      numero="4"
      titulo="Estados financieros"
      nota={
        `Se muestran las cuentas hasta el nivel ${nivelMax === 9 ? 'más detallado' : nivelMax}` +
        ` con algún valor distinto de cero: ${visibles.length} de ${datos.cuentas.length} cuentas del plan.` +
        (datos.formulariosDisponibles.length > 1
          ? ` La compañía declaró en más de un formulario; aquí constan los años del formulario ${datos.formulario}, porque los planes de cuentas no tienen equivalencia cuenta a cuenta.`
          : '')
      }
    >
      <Tabla>
        <thead>
          <CabeceraAnios anios={datos.anios} />
        </thead>
        <tbody>
          {visibles.map(c => (
            <Fila
              key={c.codigo}
              etiqueta={
                <>
                  <span className="codigo">{c.codigo}</span> {c.nombre}
                </>
              }
              valores={c.valores}
              formato="dinero"
              sangria={Math.min(c.nivel - 1, 4)}
              destacada={c.nivel === 1}
            />
          ))}
        </tbody>
      </Tabla>
    </Seccion>
  )
}
