import { nullify } from '../../../common/text/normalize';

/**
 * Parseo del catálogo de cuentas: un archivo de texto con `código<TAB>nombre`
 * por línea.
 */

export interface CuentaCruda {
  codigo: string;
  nombre: string;
  /** Número de línea en el archivo (1-based), para poder reportar rechazos. */
  linea: number;
}

export interface RechazoLinea {
  linea: number;
  motivo: string;
  raw: string;
}

export interface ResultadoParseo {
  cuentas: CuentaCruda[];
  rechazos: RechazoLinea[];
  /** Códigos que aparecían más de una vez; gana la última aparición. */
  duplicados: number;
}

/** Recorta el contenido crudo guardado en el rechazo, para no inflar la tabla. */
const MAX_RAW = 200;

/**
 * Separa una línea en código y nombre.
 *
 * El formato oficial usa TAB, pero se admite como respaldo un separador de
 * espacios (`^dígitos + espacios + resto`) por si algún archivo llega
 * reformateado. No se usa un `split` genérico por espacios porque los nombres
 * contienen espacios: sólo cuenta la PRIMERA separación.
 */
function separar(linea: string): { codigo: string; nombre: string } | null {
  const tab = linea.indexOf('\t');
  if (tab >= 0) {
    return { codigo: linea.slice(0, tab), nombre: linea.slice(tab + 1) };
  }
  const m = /^(\d+)\s+(.+)$/.exec(linea.trim());
  return m ? { codigo: m[1], nombre: m[2] } : null;
}

export function parsearCatalogo(texto: string): ResultadoParseo {
  const cuentas: CuentaCruda[] = [];
  const rechazos: RechazoLinea[] = [];
  const vistos = new Map<string, number>(); // código -> índice en `cuentas`
  let duplicados = 0;

  const lineas = texto.split(/\r?\n/);

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    const numero = i + 1;

    // Las líneas en blanco (incluida la final del archivo) no son un error.
    if (linea.trim() === '') continue;

    const partes = separar(linea);
    if (!partes) {
      rechazos.push({
        linea: numero,
        motivo: 'formato_no_reconocido: se esperaba "codigo<TAB>nombre"',
        raw: linea.slice(0, MAX_RAW),
      });
      continue;
    }

    const codigo = partes.codigo.trim();
    if (!/^\d+$/.test(codigo)) {
      rechazos.push({
        linea: numero,
        motivo: `codigo_no_numerico: "${codigo.slice(0, 40)}"`,
        raw: linea.slice(0, MAX_RAW),
      });
      continue;
    }

    // `nullify` recorta, colapsa espacios y elimina el byte nulo, que Postgres
    // no puede almacenar en una columna `text`.
    const nombre = nullify(partes.nombre);
    if (nombre === null) {
      rechazos.push({
        linea: numero,
        motivo: 'nombre_vacio',
        raw: linea.slice(0, MAX_RAW),
      });
      continue;
    }

    // Gana la última aparición, igual que el DISTINCT ON del importador de
    // compañías. Sin esto, un código repetido rompería el ON CONFLICT.
    const previo = vistos.get(codigo);
    if (previo !== undefined) {
      duplicados++;
      cuentas[previo] = { codigo, nombre, linea: numero };
      continue;
    }

    vistos.set(codigo, cuentas.length);
    cuentas.push({ codigo, nombre, linea: numero });
  }

  return { cuentas, rechazos, duplicados };
}
