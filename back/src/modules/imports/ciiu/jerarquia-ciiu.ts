import { huellaDeFila } from '../../../common/text/hash';
import { ActividadCruda, NOMBRE_NIVEL } from './ciiu-file.parser';

/**
 * Derivación de la jerarquía CIIU.
 *
 * OJO: esta lógica NO es la misma que la del plan de cuentas, aunque se le
 * parezca. Copiar aquella tal cual produce un árbol que parece correcto y no lo
 * es. Las dos diferencias son deliberadas:
 *
 * 1. El NIVEL sale de la longitud del código (la regla oficial CIIU), no de la
 *    cadena de padres. Excepción: si el nombre venía en la columna "Sección",
 *    la fila es de nivel 1 pase lo que pase.
 *
 * 2. El PADRE es el prefijo más largo con un nivel ESTRICTAMENTE MENOR, no
 *    simplemente el prefijo más largo.
 *
 * Sin el punto 1, `N000000` ("CONSUMO - NO PRODUCTIVO") sería nivel 6; sin el
 * punto 2, colgaría de la sección `N` ("Actividades de servicios
 * administrativos y de apoyo"), que es sencillamente falso. Lo mismo con
 * `E000000` ("EDUCATIVO") y la sección `E` ("Distribución de agua"). Son
 * categorías especiales añadidas al final del archivo, no subdivisiones.
 */

export interface ActividadJerarquica {
  codigo: string;
  nombre: string;
  /** Forma con punto que usa el archivo de compañías (`A0111.11`); sólo nivel 6. */
  codigoSupercias: string | null;
  codigoPadre: string | null;
  nivel: number;
  nivelNombre: string;
  esHoja: boolean;
  longitud: number;
  aplicacion: string | null;
  rowHash: string;
}

export interface Discrepancia {
  fila: number;
  codigo: string;
  nivelColumna: number;
  nivelLongitud: number;
}

export interface ResultadoJerarquia {
  actividades: ActividadJerarquica[];
  /** Filas donde la columna del nombre no cuadra con la longitud del código. */
  discrepancias: Discrepancia[];
}

/**
 * Nivel según la longitud del código, que es la definición oficial CIIU:
 * `A` Sección, `A01` División, `A011` Grupo, `A0111` Clase, `A01111` Subclase,
 * `A011111` Actividad Económica.
 */
export function nivelPorLongitud(longitud: number): number {
  if (longitud <= 1) return 1;
  if (longitud === 2) return 2; // no aparece hoy, pero mantiene la escala monótona
  return Math.min(6, longitud - 1);
}

/** `A011111` -> `A0111.11`. Sólo tiene sentido en el último nivel. */
export function aFormatoSupercias(codigo: string): string | null {
  if (codigo.length !== 7) return null;
  return `${codigo.slice(0, 5)}.${codigo.slice(5)}`;
}

export function construirJerarquiaCiiu(actividades: ActividadCruda[]): ResultadoJerarquia {
  const discrepancias: Discrepancia[] = [];

  // --- Paso 1: nivel de cada código ---
  const nivelDe = new Map<string, number>();
  for (const a of actividades) {
    const porLongitud = nivelPorLongitud(a.codigo.length);

    // La columna "Sección" manda: identifica las categorías especiales que
    // llevan código largo pero son de primer nivel.
    const nivel = a.nivelColumna === 1 ? 1 : porLongitud;

    if (a.nivelColumna !== porLongitud) {
      discrepancias.push({
        fila: a.fila,
        codigo: a.codigo,
        nivelColumna: a.nivelColumna,
        nivelLongitud: porLongitud,
      });
    }
    nivelDe.set(a.codigo, nivel);
  }

  // --- Paso 2: padre = prefijo más largo con nivel estrictamente menor ---
  const padreDe = (codigo: string): string | null => {
    const propio = nivelDe.get(codigo) ?? 1;
    for (let corte = codigo.length - 1; corte >= 1; corte--) {
      const prefijo = codigo.slice(0, corte);
      const nivelPrefijo = nivelDe.get(prefijo);
      if (nivelPrefijo !== undefined && nivelPrefijo < propio) return prefijo;
    }
    return null;
  };

  const padres = new Map<string, string | null>();
  for (const a of actividades) padres.set(a.codigo, padreDe(a.codigo));

  const conHijos = new Set<string>();
  for (const p of padres.values()) if (p) conHijos.add(p);

  // --- Paso 3: materializar ---
  const resultado = actividades.map((a) => {
    const nivel = nivelDe.get(a.codigo)!;
    const codigoPadre = padres.get(a.codigo) ?? null;
    const esHoja = !conHijos.has(a.codigo);
    const codigoSupercias = aFormatoSupercias(a.codigo);

    return {
      codigo: a.codigo,
      nombre: a.nombre,
      codigoSupercias,
      codigoPadre,
      nivel,
      nivelNombre: NOMBRE_NIVEL[nivel] ?? `Nivel ${nivel}`,
      esHoja,
      longitud: a.codigo.length,
      aplicacion: a.aplicacion,
      // El hash cubre todo lo que puede cambiar entre versiones: si sólo cubriera
      // el nombre, una recolocación en la jerarquía pasaría por "sin cambios".
      rowHash: huellaDeFila([a.nombre, codigoPadre, nivel, esHoja, a.aplicacion]),
    };
  });

  return { actividades: resultado, discrepancias };
}
