import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { obtenerFichaTributaria } from '../services/tributario.service'
import { MARCA, NOTA_LEGAL } from '../marca'
import { ADVERTENCIA_CREDITO, leer } from '../diagnosticoCredito'
import './Informe.css'

const dinero = n =>
  n === null || n === undefined
    ? '—'
    : Number(n).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const coef = n => (n === null || n === undefined ? '—' : Number(n).toFixed(4))
const pctil = n => (n === null || n === undefined ? '—' : `${(Number(n) * 100).toFixed(0)}`)

const ETIQUETA_BASE = {
  activos: 'Activos',
  costos_gastos: 'Costos y gastos',
  ingresos: 'Ingresos',
}

const hoy = () =>
  new Date().toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' })

/**
 * Informe tributario imprimible de una compañía.
 *
 * Hermano del financiero y con su misma maquetación —misma hoja, misma marca,
 * mismo `window.print()`—, pero documento aparte: se entrega a otro interlocutor
 * y responde a otra pregunta.
 *
 * Lo que más cuida este informe es **no prometer certezas que no tiene**. Cada
 * sección lleva su advertencia pegada a la tabla y no escondida en el pie,
 * porque la página que se imprime puede acabar circulando suelta:
 *
 * - la presuntiva mide exposición, no deuda;
 * - la base del anticipo es un techo (faltan dividendos y capitalizaciones);
 * - la tarifa es provisional mientras no esté cargada la escala;
 * - el crédito tributario es un saldo contable, no una devolución aprobada.
 */
export default function InformeTributario() {
  const { expediente } = useParams()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [secciones, setSecciones] = useState({
    presuntiva: true,
    noDistribuidas: true,
    credito: true,
  })

  const imprimir = useCallback(() => window.print(), [])

  useEffect(() => {
    let vivo = true
    obtenerFichaTributaria(expediente)
      .then(d => vivo && setDatos(d))
      .catch(e => vivo && setError(e?.response?.data?.message ?? e.message))
      .finally(() => vivo && setCargando(false))
    return () => {
      vivo = false
    }
  }, [expediente])

  if (cargando) return <p className="informe-aviso">Preparando el informe…</p>
  if (error) return <p className="informe-aviso error">{error}</p>
  if (!datos) return null

  const { empresa, ejercicios, noDistribuidas, credito, diagnostico, tarifa, resoluciones } = datos
  const anios = [
    ...new Set([
      ...ejercicios.map(e => e.anio),
      ...noDistribuidas.map(n => n.anio),
      ...credito.map(c => c.anio),
    ]),
  ].sort()

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
      <div className="barra-informe">
        <Link className="volver" to="/tributario">
          ← Volver al análisis tributario
        </Link>

        {[
          ['presuntiva', 'Estimación presuntiva'],
          ['noDistribuidas', 'Utilidades no distribuidas'],
          ['credito', 'Crédito tributario'],
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
        Se abrirá el diálogo de impresión: elige <b>Guardar como PDF</b> como destino. Si no quieres
        la fecha y la dirección del navegador en los márgenes, desmarca «Encabezados y pies de
        página» en las opciones del diálogo.
      </p>

      <article className="hoja">
        <header className="portada">
          <div className="emisor">
            {MARCA.logo}
            <span className="descripcion">{MARCA.descripcion}</span>
          </div>

          <div className="titulo">
            <p className="tipo-doc">{MARCA.tituloInformeTributario}</p>
            <p className="tipo-doc-sub">{MARCA.subtituloInformeTributario}</p>
            <h1>{empresa.nombre}</h1>
            <p className="identificacion">
              RUC {empresa.ruc} · Expediente {empresa.expediente}
            </p>
            {empresa.actividad && (
              <p className="rama">
                {empresa.grupo_ciiu} · {empresa.actividad}
              </p>
            )}
          </div>

          <dl className="meta">
            <div>
              <dt>Ejercicios analizados</dt>
              <dd>
                {anios[0]} – {anios[anios.length - 1]}
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

          {empresa.rimpe && (
            <p className="aviso-portada">
              Contribuyente RIMPE. La estimación presuntiva no le aplica (art. 7 de las
              resoluciones); las cifras de esa sección se muestran sólo como referencia.
            </p>
          )}
        </header>

        {secciones.presuntiva && ejercicios.length > 0 && (
          <section className="seccion">
            <h2>Estimación presuntiva del impuesto a la renta</h2>
            <p className="intro">
              Los coeficientes del SRI se aplican por separado sobre los ingresos, los costos y
              gastos y los activos; la base imponible presunta es <b>el mayor de los tres</b> (art. 4
              de cada resolución). <b>Mide exposición, no deuda</b>: este método sólo procede cuando
              la contabilidad no permite determinar la base de forma directa. La base declarada que
              se compara es contable —utilidad antes de impuestos— y no incorpora la conciliación
              tributaria.
            </p>

            <table className="tabla-tributaria">
              <thead>
                <tr>
                  <th>Concepto</th>
                  {ejercicios.map(e => (
                    <th key={e.anio} className="der">
                      {e.anio}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Ingresos</td>
                  {ejercicios.map(e => (
                    <td key={e.anio} className="der">{dinero(e.ingresos)}</td>
                  ))}
                </tr>
                <tr>
                  <td>Costos y gastos</td>
                  {ejercicios.map(e => (
                    <td key={e.anio} className="der">{dinero(e.costos_gastos)}</td>
                  ))}
                </tr>
                <tr>
                  <td>Activos</td>
                  {ejercicios.map(e => (
                    <td key={e.anio} className="der">{dinero(e.activo)}</td>
                  ))}
                </tr>
                <tr className="tenue">
                  <td>Coeficientes (ingresos / costos y gastos / activos)</td>
                  {ejercicios.map(e => (
                    <td key={e.anio} className="der">
                      {coef(e.coef_ingresos)} / {coef(e.coef_costos_gastos)} /{' '}
                      {coef(e.coef_activos)}
                      {!e.coef_especifico && <em> general art. 3</em>}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>Base sobre ingresos</td>
                  {ejercicios.map(e => (
                    <td key={e.anio} className={`der ${e.base_manda === 'ingresos' ? 'manda' : ''}`}>
                      {dinero(e.base_ingresos)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>Base sobre costos y gastos</td>
                  {ejercicios.map(e => (
                    <td
                      key={e.anio}
                      className={`der ${e.base_manda === 'costos_gastos' ? 'manda' : ''}`}
                    >
                      {dinero(e.base_costos_gastos)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>Base sobre activos</td>
                  {ejercicios.map(e => (
                    <td key={e.anio} className={`der ${e.base_manda === 'activos' ? 'manda' : ''}`}>
                      {dinero(e.base_activos)}
                    </td>
                  ))}
                </tr>
                <tr className="destacada">
                  <td>Base imponible presunta (la mayor)</td>
                  {ejercicios.map(e => (
                    <td key={e.anio} className="der">{dinero(e.base_presunta)}</td>
                  ))}
                </tr>
                <tr>
                  <td>Base que determina el resultado</td>
                  {ejercicios.map(e => (
                    <td key={e.anio} className="der">{ETIQUETA_BASE[e.base_manda] ?? '—'}</td>
                  ))}
                </tr>
                <tr>
                  <td>Declarado (utilidad antes de impuestos)</td>
                  {ejercicios.map(e => (
                    <td key={e.anio} className="der">{dinero(e.declarada)}</td>
                  ))}
                </tr>
                <tr className="destacada">
                  <td>Brecha</td>
                  {ejercicios.map(e => (
                    <td key={e.anio} className="der">{dinero(e.brecha)}</td>
                  ))}
                </tr>
                <tr>
                  <td>Percentil dentro de su rama</td>
                  {ejercicios.map(e => (
                    <td key={e.anio} className="der">
                      {pctil(e.percentil)}
                      {e.percentil !== null && e.percentil !== undefined && (
                        <em>
                          {' '}
                          {e.nivel_pares} {e.clave_pares}, n={e.n_pares}
                        </em>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="nota">
              El percentil compara la brecha relativa a los ingresos contra las compañías de la
              misma rama y ejercicio. Se calcula sólo cuando la compañía declaró ingresos y utilidad
              positivos.
            </p>
          </section>
        )}

        {secciones.noDistribuidas && noDistribuidas.length > 0 && (
          <section className="seccion">
            <h2>Pago a cuenta sobre utilidades no distribuidas</h2>
            <p className="intro">
              Resolución NAC-DGERCGC26-00000026. Las sociedades que no distribuyan las utilidades
              acumuladas de ejercicios anteriores hasta el 31 de julio declaran y pagan un anticipo:
              una cuota en agosto (código 1077) o tres —agosto, septiembre y octubre— por noveno
              dígito del RUC (código 1078). Elegida la modalidad no se cambia con declaración
              sustitutiva.
            </p>

            <table className="tabla-tributaria">
              <thead>
                <tr>
                  <th>Concepto</th>
                  {noDistribuidas.map(n => (
                    <th key={n.anio} className="der">
                      {n.anio}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Resultados acumulados (cuenta 306)</td>
                  {noDistribuidas.map(n => (
                    <td key={n.anio} className="der">{dinero(n.netas)}</td>
                  ))}
                </tr>
                <tr className="tenue">
                  <td>Por adopción de NIIF (no repartible)</td>
                  {noDistribuidas.map(n => (
                    <td key={n.anio} className="der">{dinero(n.niif)}</td>
                  ))}
                </tr>
                <tr>
                  <td>Utilidad del ejercicio</td>
                  {noDistribuidas.map(n => (
                    <td key={n.anio} className="der">{dinero(n.utilidad_ejercicio)}</td>
                  ))}
                </tr>
                <tr className="destacada">
                  <td>Base de cálculo</td>
                  {noDistribuidas.map(n => (
                    <td key={n.anio} className="der">{dinero(n.base_anticipo)}</td>
                  ))}
                </tr>
                <tr className="destacada">
                  <td>
                    Anticipo estimado ({((tarifa?.tarifa ?? 0.0125) * 100).toFixed(2)} %)
                  </td>
                  {noDistribuidas.map(n => (
                    <td key={n.anio} className="der">{dinero(n.anticipo_provisional)}</td>
                  ))}
                </tr>
              </tbody>
            </table>

            <p className="nota aviso">
              <b>Dos salvedades que afectan a la cifra.</b> La base es un <b>techo</b>: no descuenta
              los dividendos ni las capitalizaciones realizadas entre el 1 de enero y el 31 de julio,
              ni los ajustes por método de participación ni la reserva legal, porque ninguno de esos
              datos consta en los estados financieros publicados. Y el anticipo aplica una tarifa
              única del {((tarifa?.tarifa ?? 0.0125) * 100).toFixed(2)} % —la del tramo{' '}
              {tarifa?.tramo ?? 3}— porque la escala progresiva de la Ley de Régimen Tributario
              Interno no está incorporada: sirve como orden de magnitud y no sustituye al cálculo del
              formulario.
              {noDistribuidas.some(n => n.financiera) &&
                ' Además, esta compañía pertenece al sector financiero o asegurador, excluido respecto de las utilidades restringidas por su organismo de control.'}
            </p>
          </section>
        )}

        {secciones.credito && credito.length > 0 && (
          <section className="seccion">
            <h2>Crédito tributario · devolución potencial</h2>
            <p className="intro">
              Impuesto ya pagado que permanece registrado como activo de la compañía, y que
              constituye la devolución o compensación a la que tendría derecho.
            </p>

            <table className="tabla-tributaria">
              <thead>
                <tr>
                  <th>Concepto</th>
                  {credito.map(c => (
                    <th key={c.anio} className="der">
                      {c.anio}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Crédito tributario a favor de la empresa (IVA)</td>
                  {credito.map(c => (
                    <td key={c.anio} className="der">{dinero(c.iva)}</td>
                  ))}
                </tr>
                <tr>
                  <td>Crédito tributario a favor de la empresa (impuesto a la renta)</td>
                  {credito.map(c => (
                    <td key={c.anio} className="der">{dinero(c.ir)}</td>
                  ))}
                </tr>
                <tr className="destacada">
                  <td>Devolución potencial</td>
                  {credito.map(c => (
                    <td key={c.anio} className="der">{dinero(c.total)}</td>
                  ))}
                </tr>
              </tbody>
            </table>
            {diagnostico && (
              <>
                <h3 className="diagnostico-titulo">Diagnóstico de la trayectoria</h3>
                <dl className="diagnostico">
                  {[
                    ['Crédito por IVA', diagnostico.diagnostico_iva, diagnostico.iva_sube, diagnostico.iva_baja],
                    ['Crédito por impuesto a la renta', diagnostico.diagnostico_ir, diagnostico.ir_sube, diagnostico.ir_baja],
                  ].map(([etiqueta, clave, sube, baja]) => {
                    const d = leer(clave)
                    return (
                      <div key={etiqueta} className={`caso ${d.tono}`}>
                        <dt>
                          {etiqueta}: <b>{d.titulo}</b>
                        </dt>
                        <dd>
                          {d.texto}
                          {(sube > 0 || baja > 0) && (
                            <em>
                              {' '}
                              En los {diagnostico.anios} ejercicios analizados el saldo subió {sube}{' '}
                              {sube === 1 ? 'vez' : 'veces'} y bajó {baja}.
                            </em>
                          )}
                        </dd>
                      </div>
                    )
                  })}
                </dl>
              </>
            )}

            <p className="nota">
              Es el saldo contable declarado por la compañía, no una devolución aprobada: su
              recuperación depende de la solicitud correspondiente y de la verificación del SRI.{' '}
              {ADVERTENCIA_CREDITO}
            </p>
          </section>
        )}

        <footer className="pie-documento">
          <p>{NOTA_LEGAL}</p>
          <p>
            Las estimaciones tributarias de este informe se elaboran aplicando la normativa vigente
            a cifras públicas, sin acceso a las declaraciones del contribuyente. No constituyen una
            liquidación ni anticipan la posición de la Administración Tributaria.
            {resoluciones?.length > 0 && (
              <>
                {' '}
                Coeficientes presuntivos según{' '}
                {resoluciones.map(r => `${r.anio}: ${r.resolucion}`).join(' · ')}.
              </>
            )}
          </p>
          <p className="firma">
            {MARCA.nombre}
            {MARCA.contacto ? ` · ${MARCA.contacto}` : ''} · Emitido el {hoy()}
          </p>
        </footer>
      </article>
    </div>
  )
}
