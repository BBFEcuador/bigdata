import { useCallback, useEffect, useRef, useState } from 'react'
import { listarUtilidadesNoDistribuidas } from '../services/tributario.service'

const dinero = n =>
  n === null || n === undefined
    ? '—'
    : Number(n).toLocaleString('es-EC', { maximumFractionDigits: 0 })

const millones = n =>
  n === null || n === undefined ? '—' : `${(Number(n) / 1e6).toLocaleString('es-EC', { maximumFractionDigits: 0 })} M`

/**
 * Aviso del pago a cuenta sobre utilidades no distribuidas.
 *
 * Deliberadamente NO es un ranking de riesgo: aquí no hay percentil ni nada que
 * interpretar. Quien tiene utilidades acumuladas positivas en su último balance
 * tiene la obligación encima, y la lista sirve para avisarle.
 */
export default function UtilidadesNoDistribuidas() {
  const [filtros, setFiltros] = useState({ minimo: '1000000', rama: '', q: '' })
  const [res, setRes] = useState(null)
  const [offset, setOffset] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const LIMIT = 50

  const buscar = useCallback(async (f, desde) => {
    setCargando(true)
    setError(null)
    try {
      const params = { limit: LIMIT, offset: desde }
      Object.entries(f).forEach(([k, v]) => {
        if (v !== '' && v !== null && v !== undefined) params[k] = v
      })
      setRes(await listarUtilidadesNoDistribuidas(params))
      setOffset(desde)
    } catch (e) {
      setError(e?.response?.data?.message ?? e.message)
    } finally {
      setCargando(false)
    }
  }, [])

  const timer = useRef(null)
  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => buscar(filtros, 0), 300)
    return () => clearTimeout(timer.current)
  }, [filtros, buscar])

  const cambiar = (campo, valor) => setFiltros(f => ({ ...f, [campo]: valor }))

  return (
    <>
      <p className="nota aviso">
        <strong>Pago a cuenta sobre utilidades no distribuidas.</strong> La Resolución{' '}
        {res?.resolucion?.numero ?? 'NAC-DGERCGC26-00000026'} obliga a las sociedades residentes y
        establecimientos permanentes que <strong>no distribuyan</strong> las utilidades acumuladas de
        ejercicios anteriores hasta el <strong>{res?.resolucion?.corte ?? '31 de julio'}</strong>. Se
        declara en una cuota en agosto (código {res?.resolucion?.codigos?.unaCuota ?? '1077'}) o en
        tres —agosto, septiembre y octubre— por noveno dígito del RUC (código{' '}
        {res?.resolucion?.codigos?.tresCuotas ?? '1078'}). Elegida la modalidad, no se cambia con
        declaración sustitutiva ni hay convenio de pago.
      </p>

      <p className="nota">
        <strong>Cómo se calcula aquí.</strong> Base = resultados acumulados (cuenta 306) + utilidad
        del ejercicio con su signo, que ya viene neta del 15 % de participación y del impuesto a la
        renta. <strong>Es un techo</strong>: no descuenta dividendos ni capitalizaciones entre el 1
        de enero y el 31 de julio, ni ajustes por método de participación — nada de eso está en el
        balance de la Superintendencia. Tampoco la reserva legal, que es una decisión de junta
        todavía no tomada.{' '}
        <strong>
          El anticipo aplica el 1,25 % del tramo 3 a todos por igual porque la escala progresiva aún
          no está cargada: es un orden de magnitud, no la cifra de nadie.
        </strong>
      </p>

      {res && (
        <div className="panorama">
          <div className="tarjeta destacada">
            <div className="anio">Ejercicio {res.anio}</div>
            <div className="cifra">{dinero(res.total)}</div>
            <div className="pie">compañías con base positiva</div>
            <div className="reparto">
              <span>{millones(res.sumaBase)} USD de base</span>
              {res.sumaNiif > 0 && (
                <span title="Adopción por primera vez de NIIF: sumando del total, no repartible">
                  {millones(res.sumaNiif)} por NIIF
                </span>
              )}
              {res.financieras > 0 && (
                <span title="Financieras y aseguradoras: excluidas por utilidades restringidas">
                  {dinero(res.financieras)} financieras
                </span>
              )}
            </div>
          </div>

          <div className="tarjeta provisional">
            <div className="anio">Anticipo provisional</div>
            <div className="cifra">{millones(res.sumaAnticipo)}</div>
            <div className="pie">
              al {((res.tarifa?.tramos?.[0]?.tarifa ?? 0.0125) * 100).toFixed(2)} % — tarifa del
              tramo {res.tarifa?.tramos?.[0]?.tramo ?? 3}
            </div>
            <div className="reparto">
              <span>
                {res.tarifa?.completa
                  ? 'escala progresiva cargada'
                  : 'escala sin cargar: una sola tarifa para todos'}
              </span>
            </div>
          </div>
          <div className="tarjeta">
            <div className="anio">Acumularon más</div>
            <div className="cifra">{dinero(res.movimiento.subieron)}</div>
            <div className="pie">subieron respecto al ejercicio anterior</div>
          </div>
          <div className="tarjeta">
            <div className="anio">Bajaron</div>
            <div className="cifra">{dinero(res.movimiento.bajaron)}</div>
            <div className="pie">indicio de distribución, no prueba</div>
          </div>
        </div>
      )}

      <div className="filtros">
        <input
          type="search"
          placeholder="Nombre, RUC o expediente"
          value={filtros.q}
          onChange={e => cambiar('q', e.target.value)}
        />
        <select value={filtros.minimo} onChange={e => cambiar('minimo', e.target.value)}>
          <option value="">Cualquier monto</option>
          <option value="100000">Desde 100 mil</option>
          <option value="1000000">Desde 1 millón</option>
          <option value="10000000">Desde 10 millones</option>
        </select>
        <input
          type="text"
          className="rama"
          placeholder="Rama (C, H52, H522)"
          value={filtros.rama}
          onChange={e => cambiar('rama', e.target.value)}
        />
      </div>

      {error && <p className="error">{error}</p>}

      <div className="resultado">
        {res ? dinero(res.total) : '—'} compañías
        {res && ` · mostrando ${offset + 1}–${Math.min(offset + LIMIT, res.total)}`}
        {cargando && <span className="cargando"> · cargando…</span>}
      </div>

      <table className="tabla">
        <thead>
          <tr>
            <th>Compañía</th>
            <th>Rama</th>
            <th className="num" title="Cuenta 306: ganancias acumuladas, menos pérdidas, más adopción NIIF">
              Acumulados (306)
            </th>
            {/* No dice "de los cuales": la adopción NIIF puede superar al total
                cuando la compañía arrastra pérdidas acumuladas que lo netean, y
                ahí la frase sería falsa. Es un sumando, no una parte. */}
            <th className="num" title="Adopción por primera vez de NIIF: es un sumando del total y NO es utilidad repartible. Puede superar al total si hay pérdidas acumuladas.">
              Por adopción NIIF
            </th>
            <th className="num">Utilidad del ejercicio</th>
            <th className="num" title="Acumulados más utilidad del ejercicio, con su signo. Antes de dividendos y capitalizaciones de enero a julio.">
              Base
            </th>
            <th className="num" title="Base por la tarifa del tramo 3 (1,25 %). Provisional: la escala progresiva no está cargada.">
              Anticipo provisional
            </th>
            <th className="num">Variación vs. año anterior</th>
          </tr>
        </thead>
        <tbody>
          {res?.datos.map(d => (
            <tr key={d.expediente}>
              <td className="nombre">
                {d.nombre}
                <span className="ruc">{d.ruc}</span>
              </td>
              <td className="rama">{d.grupo_ciiu}</td>
              <td className="num">{dinero(d.netas)}</td>
              <td className="num niif">{d.niif ? dinero(d.niif) : '—'}</td>
              <td className={`num ${Number(d.utilidad_ejercicio) < 0 ? 'baja' : ''}`}>
                {dinero(d.utilidad_ejercicio)}
              </td>
              <td className="num fuerte">{dinero(d.base_anticipo)}</td>
              <td className="num anticipo">{dinero(d.anticipo_provisional)}</td>
              <td className={`num ${Number(d.variacion) < 0 ? 'baja' : 'sube'}`}>
                {d.variacion === null ? '—' : `${Number(d.variacion) > 0 ? '+' : ''}${dinero(d.variacion)}`}
              </td>
            </tr>
          ))}
          {!cargando && res?.datos.length === 0 && (
            <tr>
              <td colSpan={8} className="vacio">
                Ninguna compañía con esos filtros.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="paginacion">
        <button disabled={offset === 0} onClick={() => buscar(filtros, Math.max(0, offset - LIMIT))}>
          ← Anterior
        </button>
        <button
          disabled={!res || offset + LIMIT >= res.total}
          onClick={() => buscar(filtros, offset + LIMIT)}
        >
          Siguiente →
        </button>
      </div>
    </>
  )
}
