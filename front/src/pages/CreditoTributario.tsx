import { useCallback, useEffect, useRef, useState } from 'react'
import { listarCreditoTributario } from '../services/tributario.service'
import { ADVERTENCIA_CREDITO, leer } from '../diagnosticoCredito'

const dinero = n =>
  n === null || n === undefined || Number(n) === 0
    ? '—'
    : Number(n).toLocaleString('es-EC', { maximumFractionDigits: 0 })

const millones = n =>
  n === null || n === undefined
    ? '—'
    : `${(Number(n) / 1e6).toLocaleString('es-EC', { maximumFractionDigits: 0 })} M`

/**
 * Crédito tributario por compañía y ejercicio.
 *
 * Los años van en columnas y no en filas: la pregunta que se le hace a esta
 * tabla es "¿cuánto lleva acumulado y desde cuándo?", y en formato largo hay
 * que leer cinco filas para responderla.
 *
 * Cada celda lleva el IVA arriba y el impuesto a la renta debajo. Sumarlos en
 * un solo número habría escondido la diferencia que importa: el crédito de IVA
 * se devuelve por un procedimiento distinto al de renta, y una empresa con todo
 * el saldo en uno de los dos no tiene el mismo caso que otra repartida.
 */
export default function CreditoTributario() {
  const [filtros, setFiltros] = useState({ minimo: '10000', rama: '', q: '', soloComparables: true })
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
      setRes(await listarCreditoTributario(params))
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
  const anios = res?.anios ?? []

  return (
    <>
      <p className="nota">
        <strong>Crédito tributario a favor de la empresa.</strong> Impuesto ya pagado que sigue
        registrado como activo: cuenta <strong>1010501</strong> para el IVA y{' '}
        <strong>1010502</strong> para el impuesto a la renta. Es la devolución o compensación a la
        que la compañía tendría derecho. <strong>Es un saldo contable declarado por ella</strong>, no
        una devolución aprobada: recuperarlo depende de la solicitud y de la verificación del SRI.
      </p>

      {res && (
        <div className="panorama">
          <div className="tarjeta destacada">
            <div className="anio">Ejercicio {res.ultimo}</div>
            <div className="cifra">{dinero(res.totales.companias)}</div>
            <div className="pie">compañías con balance</div>
          </div>
          <div className="tarjeta">
            <div className="anio">Crédito por IVA</div>
            <div className="cifra">{millones(res.totales.suma_iva)}</div>
            <div className="pie">cuenta 1010501</div>
          </div>
          <div className="tarjeta">
            <div className="anio">Crédito por renta</div>
            <div className="cifra">{millones(res.totales.suma_ir)}</div>
            <div className="pie">cuenta 1010502</div>
          </div>
          <div className="tarjeta destacada">
            <div className="anio">Devolución potencial</div>
            <div className="cifra">
              {millones(Number(res.totales.suma_iva) + Number(res.totales.suma_ir))}
            </div>
            <div className="pie">suma de ambos créditos</div>
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
          <option value="10000">Desde 10 mil</option>
          <option value="100000">Desde 100 mil</option>
          <option value="1000000">Desde 1 millón</option>
        </select>
        <input
          type="text"
          className="rama"
          placeholder="Rama (C, H52, H522)"
          value={filtros.rama}
          onChange={e => cambiar('rama', e.target.value)}
        />
        <label className="control-check">
          <input
            type="checkbox"
            checked={filtros.soloComparables}
            onChange={e => cambiar('soloComparables', e.target.checked)}
          />
          Sólo comparables
        </label>
      </div>

      <p className="ayuda">
        El umbral se aplica al crédito del ejercicio {res?.ultimo ?? 'más reciente'}, no a la suma de
        todos: un saldo de hace cuatro años que ya se compensó no es una devolución pendiente.
      </p>

      {error && <p className="error">{error}</p>}

      <div className="resultado">
        {res ? dinero(res.totales.companias) : '—'} compañías en el universo
        {cargando && <span className="cargando"> · cargando…</span>}
      </div>

      <table className="tabla credito">
        <thead>
          <tr>
            <th>Compañía</th>
            <th>Rama</th>
            {anios.map(a => (
              <th key={a} className="num">
                {a}
              </th>
            ))}
            <th className="diag">Diagnóstico</th>
            <th className="acciones">Informe</th>
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
              {anios.map(a => {
                const v = d.por_anio?.[a]
                return (
                  <td key={a} className="num celda-credito">
                    <span className="iva">{dinero(v?.iva)}</span>
                    <span className="ir">{dinero(v?.ir)}</span>
                  </td>
                )
              })}
              <td className="diag">
                {['iva', 'ir'].map(tipo => {
                  const dg = leer(tipo === 'iva' ? d.diagnostico_iva : d.diagnostico_ir)
                  return (
                    <span key={tipo} className={`etiqueta ${dg.tono}`} title={dg.texto}>
                      <b>{tipo === 'iva' ? 'IVA' : 'Renta'}</b> {dg.titulo}
                    </span>
                  )
                })}
              </td>
              <td className="acciones">
                <a
                  className="pdf"
                  href={`/informe-tributario/${d.expediente}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  PDF
                </a>
              </td>
            </tr>
          ))}
          {!cargando && res?.datos.length === 0 && (
            <tr>
              <td colSpan={anios.length + 4} className="vacio">
                Ninguna compañía con esos filtros.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="ayuda leyenda">
        En cada celda: arriba el crédito por <b>IVA</b>, abajo el de <b>impuesto a la renta</b>. El
        diagnóstico lee la trayectoria de cada uno por separado — una misma compañía puede estar
        compensando el IVA y acumulando el de renta. {ADVERTENCIA_CREDITO}
      </p>

      <div className="paginacion">
        <button disabled={offset === 0} onClick={() => buscar(filtros, Math.max(0, offset - LIMIT))}>
          ← Anterior
        </button>
        <button disabled={!res || res.datos.length < LIMIT} onClick={() => buscar(filtros, offset + LIMIT)}>
          Siguiente →
        </button>
      </div>
    </>
  )
}
