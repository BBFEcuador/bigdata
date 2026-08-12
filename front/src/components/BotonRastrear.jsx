import { useState } from 'react'
import { crearJob, fijarUsuario, usuarioActual } from '../services/scraping.service'
import './BotonRastrear.css'

/**
 * Encola un rastreo de UN sujeto desde el listado donde está.
 *
 * Vive en un componente compartido y no copiado en cada pantalla porque el par
 * `(tipoSujeto, clave)` es lo único que cambia entre compañías y padrón: todo
 * lo demás —pedir la firma, el estado de "enviando", traducir el 409— es
 * idéntico, y duplicarlo garantizaba que una de las dos copias se quedara atrás.
 *
 * No navega a /scraping al terminar: quien revisa un listado de prospectos
 * quiere lanzar varios seguidos, y sacarlo de la lista en cada uno le haría
 * perder la página y los filtros. El aviso lo da el llamador.
 */
export default function BotonRastrear({ tipoSujeto, clave, onResultado }) {
  const [enviando, setEnviando] = useState(false)

  const lanzar = async () => {
    let usuario = usuarioActual()
    if (!usuario.trim()) {
      // El backend rechaza toda escritura sin firma, así que se pide una vez y
      // queda guardada. Es un apaño mientras no haya autenticación.
      usuario = window.prompt('¿Quién lanza el rastreo? Queda firmado.') ?? ''
      if (!usuario.trim()) return
      fijarUsuario(usuario.trim())
    }

    setEnviando(true)
    try {
      // Prioridad 10: el barrido masivo va con 0, y un job pedido a mano detrás
      // de trescientas mil compañías en cola no serviría de nada.
      await crearJob({ tipoSujeto, clave, prioridad: 10 })
      onResultado?.({ tipo: 'ok', texto: `Rastreo encolado para ${clave}.` })
    } catch (e) {
      onResultado?.({ tipo: 'error', texto: e?.response?.data?.message ?? e.message })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <button type="button" className="boton-rastrear" disabled={enviando} onClick={lanzar}>
      {enviando ? '…' : 'Rastrear'}
    </button>
  )
}
