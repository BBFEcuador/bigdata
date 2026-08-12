import { useCallback, useEffect, useRef, useState } from 'react'
import { listarUtilidadesNoDistribuidas } from '../services/tributario.service'

const dinero = n =>
  n === null || n === undefined
    ? '—'
    : Number(n).toLocaleString('es-EC', { maximumFractionDigits: 0 })

const pct = n => (n === null || n === undefined ? '—' : `${(Number(n) * 100).toFixed(0)} %`)

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

      {res && (
        <div className="panorama">
          <div className="tarjeta destacada">
            <div className="anio">Ejercicio {res.anio}</div>
            <div className="cifra">{dinero(res.total)}</div>
            <div className="pie">compañías con resultados acumulados positivos</div>
            <div className="reparto">
              <span>{millones(res.suma)} USD en la cuenta 306</span>
              {res.sumaNiif > 0 && (
                <span title="Adopción por primera vez de NIIF: no es utilidad repartible">
                  de los cuales {millones(res.sumaNiif)} por NIIF
                </span>
              )}
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
              Resultados acumulados
            </th>
            <th className="num" title="Adopción por primera vez de NIIF: está dentro del total y NO es repartible">
              de los cuales NIIF
            </th>
            <th className="num">Variación vs. año anterior</th>
            <th className="num">Peso sobre patrimonio</th>
            <th className="num">Utilidad del ejercicio</th>
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
              <td className="num fuerte">{dinero(d.netas)}</td>
              <td className="num niif">{d.niif ? dinero(d.niif) : '—'}</td>
              <td className={`num ${Number(d.variacion) < 0 ? 'baja' : 'sube'}`}>
                {d.variacion === null ? '—' : `${Number(d.variacion) > 0 ? '+' : ''}${dinero(d.variacion)}`}
              </td>
              <td className="num">{pct(d.peso_patrimonio)}</td>
              <td className="num">{dinero(d.utilidad_ejercicio)}</td>
            </tr>
          ))}
          {!cargando && res?.datos.length === 0 && (
            <tr>
              <td colSpan={7} className="vacio">
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
