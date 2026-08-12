import { createHash } from 'node:crypto';
import { CuentaCruda } from './catalogo-file.parser';

/**
 * Derivación de la jerarquía del plan de cuentas.
 *
 * El padre se calcula como el PREFIJO PROPIO MÁS LARGO que exista en el propio
 * catálogo, nunca a partir de la longitud del código. La regla intuitiva
 * "1 dígito y luego 2 por nivel" no se cumple: en el archivo real `30` y `31`
 * tienen longitud 2, y conviven con códigos de longitud 1, 3, 5, 7, 9 y 11.
 *
 * Además el resultado es un BOSQUE, no un árbol: el archivo no trae los códigos
 * `4`, `5`, `6`, `7` ni `8`, así que `401`, `501`, `600`, `700` y `800` quedan
 * sin ancestro y son raíces legítimas.
 */

export interface CuentaJerarquica {
  codigo: string;
  nombre: string;
  codigoPadre: string | null;
  nivel: number;
  esHoja: boolean;
  longitud: number;
  rowHash: string;
}

/** Separador de control para el hash; evita que "AB"+"C" colisione con "A"+"BC". */
const SEPARADOR_HASH = String.fromCharCode(31);

/** md5 (128 bits) formateado como uuid, igual que en el importador de compañías. */
function comoUuid(texto: string): string {
  const h = createHash('md5').update(texto, 'utf8').digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function construirJerarquia(cuentas: CuentaCruda[]): CuentaJerarquica[] {
  const codigos = new Set(cuentas.map((c) => c.codigo));

  /** Prefijo propio más largo presente en el catálogo. */
  const padreDe = (codigo: string): string | null => {
    for (let corte = codigo.length - 1; corte >= 1; corte--) {
      const prefijo = codigo.slice(0, corte);
      if (codigos.has(prefijo)) return prefijo;
    }
    return null;
  };

  const padres = new Map<string, string | null>();
  for (const c of cuentas) padres.set(c.codigo, padreDe(c.codigo));

  // Un código con hijos no es hoja. Se calcula de una pasada sobre los padres.
  const conHijos = new Set<string>();
  for (const padre of padres.values()) if (padre) conHijos.add(padre);

  /**
   * Profundidad, subiendo por los padres con memoización.
   * No hace falta detectar ciclos: el padre siempre es un prefijo ESTRICTAMENTE
   * más corto, así que la cadena decrece en longitud y termina siempre.
   */
  const niveles = new Map<string, number>();
  const nivelDe = (codigo: string): number => {
    const memo = niveles.get(codigo);
    if (memo !== undefined) return memo;
    const padre = padres.get(codigo) ?? null;
    const nivel = padre === null ? 1 : nivelDe(padre) + 1;
    niveles.set(codigo, nivel);
    return nivel;
  };

  return cuentas.map((c) => {
    const codigoPadre = padres.get(c.codigo) ?? null;
    const nivel = nivelDe(c.codigo);
    const esHoja = !conHijos.has(c.codigo);

    // El hash cubre todo lo que puede cambiar entre versiones del catálogo: si
    // sólo cubriera el nombre, una recolocación en la jerarquía pasaría por
    // "sin cambios" y no se escribiría.
    const huella = [c.nombre, codigoPadre ?? '', String(nivel), esHoja ? '1' : '0'].join(
      SEPARADOR_HASH,
    );

    return {
      codigo: c.codigo,
      nombre: c.nombre,
      codigoPadre,
      nivel,
      esHoja,
      longitud: c.codigo.length,
      rowHash: comoUuid(huella),
    };
  });
}
