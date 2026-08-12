/**
 * Definición única de las rutas de la aplicación.
 *
 * De aquí salen a la vez el `<Routes>` y las entradas del menú lateral, para
 * que no puedan desincronizarse: añadir una pantalla es añadir una entrada aquí
 * y nada más.
 */

// Iconos como SVG en línea: el proyecto no tiene librería de iconos y no merece
// añadir una dependencia entera por cinco entradas de menú.
const Icono = ({ d }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)

const ICONO_EMPRESA = 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4M9 11h.01M15 11h.01'
const ICONO_LISTA = 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'
const ICONO_ARBOL = 'M5 3v4h6M5 11h6M5 11v8h6M17 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM17 13a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM17 21a2 2 0 1 1-4 0 2 2 0 0 1 4 0z'
const ICONO_SUBIR = 'M12 16V4M6 10l6-6 6 6M4 20h16'
const ICONO_BALANCE = 'M3 20h18M7 20V10M12 20V4M17 20v-7'
const ICONO_HISTORIAL = 'M12 8v4l3 2M3 12a9 9 0 1 0 3-6.7L3 8'

export const NAVEGACION = [
  {
    titulo: 'Datos',
    items: [
      { ruta: '/companias', etiqueta: 'Compañías', icono: <Icono d={ICONO_EMPRESA} /> },
      { ruta: '/balances', etiqueta: 'Balances', icono: <Icono d={ICONO_BALANCE} /> },
      { ruta: '/catalogo', etiqueta: 'Catálogo de cuentas', icono: <Icono d={ICONO_LISTA} /> },
      { ruta: '/ciiu', etiqueta: 'Catálogo CIIU', icono: <Icono d={ICONO_ARBOL} /> },
    ],
  },
  {
    titulo: 'Importación',
    items: [
      { ruta: '/importar/companias', etiqueta: 'Importar compañías', icono: <Icono d={ICONO_SUBIR} /> },
      { ruta: '/importar/balances', etiqueta: 'Importar balances', icono: <Icono d={ICONO_SUBIR} /> },
      { ruta: '/importar/catalogo', etiqueta: 'Importar catálogo', icono: <Icono d={ICONO_SUBIR} /> },
      { ruta: '/importar/ciiu', etiqueta: 'Importar CIIU', icono: <Icono d={ICONO_SUBIR} /> },
      { ruta: '/importaciones', etiqueta: 'Historial', icono: <Icono d={ICONO_HISTORIAL} /> },
    ],
  },
]

/** Ruta a la que se redirige desde `/`. */
export const RUTA_INICIAL = '/companias'
