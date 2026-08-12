import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import './FichaCompania.css'

const texto = v => (v === null || v === undefined || v === '' ? '—' : String(v))
const fecha = v => (v ? String(v).slice(0, 10) : '—')
const sino = v => (v === true ? 'Sí' : v === false ? 'No' : '—')
const dinero = v =>
  v === null || v === undefined
    ? '—'
    : Number(v).toLocaleString('es-EC', { minimumFractionDigits: 2 })

/**
 * Ficha completa de una compañía: TODO lo que la base sabe de ella.
 *
 * Existe porque la tabla no da abasto. Entre el directorio de la
 * Superintendencia (24 campos), el padrón del SRI (9 más) y los
 * establecimientos, son más de 30 datos por compañía: en columnas obligarían a
 * un scroll horizontal permanente y a leer cada fila dos veces.
 *
 * Cada dato lleva marcada su procedencia, porque no es lo mismo: la situación
 * legal la dice la Superintendencia y el estado de contribuyente el SRI, y una
 * compañía puede estar ACTIVA en una y SUSPENDIDA en el otro.
 */
export default function FichaCompania({ expediente, onCerrar, cargar }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vigente = true
    setDatos(null)
    setError(null)
    cargar(expediente)
      .then(d => vigente && setDatos(d))
      .catch(e => vigente && setError(e?.response?.data?.message ?? e.message))
    return () => {
      vigente = false
    }
  }, [expediente, cargar])

  // Cerrar con Escape: la ficha tapa la tabla y buscar el botón cansa.
  useEffect(() => {
    const alPulsar = e => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [onCerrar])

  const c = datos?.compania

  return (
    <div className="ficha-fondo" onClick={onCerrar}>
      <div className="ficha" onClick={e => e.stopPropagation()}>
        <div className="ficha-cabecera">
          <div>
            <h3>{c ? c.nombre : `Expediente ${expediente}`}</h3>
            {c && (
              <p className="sub">
                RUC {texto(c.ruc)} · Expediente {c.expediente}
              </p>
            )}
          </div>
          <button type="button" onClick={onCerrar}>
            Cerrar
          </button>
        </div>

        {error && <p className="error">{error}</p>}
        {!datos && !error && <p className="cargando">Cargando ficha…</p>}

        {datos && (
          <div className="ficha-cuerpo">
            <Bloque titulo="Identificación" fuente="Superintendencia de Compañías">
              <Dato k="Razón social" v={texto(c.nombre)} />
              <Dato k="RUC" v={texto(c.ruc)} mono />
              <Dato k="Expediente" v={texto(c.expediente)} mono />
              <Dato k="Tipo de compañía" v={texto(c.tipo)} />
              <Dato k="Situación legal" v={texto(c.situacionLegal)} />
              <Dato k="Fecha de constitución" v={fecha(c.fechaConstitucion)} />
              <Dato k="Capital suscrito" v={dinero(c.capitalSuscrito)} />
            </Bloque>

            <Bloque titulo="Representación legal" fuente="Superintendencia de Compañías">
              <Dato k="Representante legal" v={texto(c.representante)} destacado />
              <Dato k="Cargo" v={texto(c.cargo)} destacado />
              <Dato k="Teléfono" v={texto(c.telefono)} mono destacado />
            </Bloque>

            <Bloque titulo="Domicilio" fuente="Superintendencia de Compañías">
              <Dato k="País" v={texto(c.pais)} />
              <Dato k="Región" v={texto(c.region)} />
              <Dato k="Provincia" v={texto(c.provincia)} />
              <Dato k="Cantón" v={texto(c.canton)} />
              <Dato k="Ciudad" v={texto(c.ciudad)} />
              <Dato k="Parroquia" v={texto(c.sriParroquia)} nota="SRI" />
              <Dato k="Calle" v={texto(c.calle)} />
              <Dato k="Número" v={texto(c.numero)} />
              <Dato k="Intersección" v={texto(c.interseccion)} />
              <Dato k="Barrio" v={texto(c.barrio)} />
            </Bloque>

            <Bloque titulo="Actividad económica" fuente="Superintendencia de Compañías / CIIU">
              <Dato k="CIIU nivel 1" v={texto(c.ciiuNivel1)} />
              <Dato k="CIIU nivel 6" v={texto(c.ciiuNivel6)} mono />
              <Dato k="Actividad" v={texto(c.actividad)} ancho />
            </Bloque>

            <Bloque titulo="Situación tributaria" fuente="Padrón del SRI">
              {c.sriEstadoContribuyente === null ? (
                <p className="vacio-bloque">
                  Esta compañía no se cruzó con el padrón del SRI. Puede que su RUC no
                  esté en el padrón, que esté vacío en el directorio, o que apunte a dos
                  expedientes (8 casos en toda la base, que no se enlazan a propósito).
                </p>
              ) : (
                <>
                  <Dato k="Estado del contribuyente" v={texto(c.sriEstadoContribuyente)} destacado />
                  <Dato k="Clase de contribuyente" v={texto(c.sriClaseContribuyente)} />
                  <Dato k="Inicio de actividades" v={fecha(c.sriFechaInicioActividades)} />
                  <Dato k="Obligado a contabilidad" v={sino(c.sriObligadoContabilidad)} />
                  <Dato k="Agente de retención" v={sino(c.sriAgenteRetencion)} />
                  <Dato k="Contribuyente especial" v={sino(c.sriContribuyenteEspecial)} />
                  <Dato k="Nombre comercial" v={texto(c.sriNombreComercial)} />
                  <Dato k="Establecimientos" v={texto(c.sriNumEstablecimientos)} />
                </>
              )}
            </Bloque>

            <Bloque titulo="Balances presentados" fuente="Superintendencia de Compañías">
              {datos.ejercicios.length === 0 ? (
                <p className="vacio-bloque">No hay balances cargados de esta compañía.</p>
              ) : (
                <div className="ejercicios">
                  {datos.ejercicios.map(e => (
                    <span key={`${e.anio}-${e.formulario}`} className="anio">
                      {e.anio}
                      {e.formulario !== 1 && <sup title="Formulario fiscal">F</sup>}
                    </span>
                  ))}
                  <Link className="enlace-analisis" to={`/analisis?expediente=${c.expediente}`}>
                    Ver análisis financiero →
                  </Link>
                </div>
              )}
            </Bloque>

            {datos.establecimientos.length > 0 && (
              <Bloque titulo={`Establecimientos (${datos.establecimientos.length})`} fuente="Padrón del SRI" ancho>
                <div className="tabla-locales">
                  <table>
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
                          <td>{texto(e.nombre_comercial)}</td>
                          <td>{texto(e.estado)}</td>
                          <td>{texto(e.provincia)}</td>
                          <td>{texto(e.canton)}</td>
                          <td>{texto(e.parroquia)}</td>
                          <td className="mono">{texto(e.codigo_ciiu)}</td>
                          <td className="actividad" title={e.actividad ?? ''}>
                            {texto(e.actividad)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Bloque>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Bloque({ titulo, fuente, children, ancho = false }) {
  return (
    <section className={`bloque${ancho ? ' ancho' : ''}`}>
      <h4>
        {titulo}
        <span className="fuente">{fuente}</span>
      </h4>
      <div className="datos">{children}</div>
    </section>
  )
}

function Dato({ k, v, mono = false, destacado = false, ancho = false, nota }) {
  return (
    <div className={`dato${ancho ? ' ancho' : ''}${destacado ? ' destacado' : ''}`}>
      <span className="clave">
        {k}
        {nota && <em className="nota-fuente">{nota}</em>}
      </span>
      <span className={`valor${mono ? ' mono' : ''}`}>{v}</span>
    </div>
  )
}
