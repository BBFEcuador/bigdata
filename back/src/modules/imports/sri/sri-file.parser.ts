import { headerKey, nullify } from '../../../common/text/normalize';
import { coerceDate } from '../transform/coercions';

/**
 * Parseo del padrón del SRI: CSV separado por `|`, en UTF-8.
 *
 * El archivo es "casi" un split por barras, y ese "casi" es justo lo peligroso.
 */

export const CAMPOS_SRI = [
  'NUMERO_RUC',
  'RAZON_SOCIAL',
  'CODIGO_JURISDICCION',
  'ESTADO_CONTRIBUYENTE',
  'CLASE_CONTRIBUYENTE',
  'FECHA_INICIO_ACTIVIDADES',
  'FECHA_ACTUALIZACION',
  'FECHA_SUSPENSION_DEFINITIVA',
  'FECHA_REINICIO_ACTIVIDADES',
  'OBLIGADO',
  'TIPO_CONTRIBUYENTE',
  'NUMERO_ESTABLECIMIENTO',
  'NOMBRE_FANTASIA_COMERCIAL',
  'ESTADO_ESTABLECIMIENTO',
  'DESCRIPCION_PROVINCIA_EST',
  'DESCRIPCION_CANTON_EST',
  'DESCRIPCION_PARROQUIA_EST',
  'CODIGO_CIIU',
  'ACTIVIDAD_ECONOMICA',
  'AGENTE_RETENCION',
  'ESPECIAL',
] as const;

export const NUM_CAMPOS = CAMPOS_SRI.length;

export const TIPO_PERSONA_NATURAL = 'PERSONA NATURAL';
export const TIPO_SOCIEDAD = 'SOCIEDAD';

export interface FilaSri {
  ruc: string;
  razonSocial: string;
  jurisdiccion: string | null;
  estadoContribuyente: string | null;
  claseContribuyente: string | null;
  fechaInicioActividades: string | null;
  fechaActualizacion: string | null;
  fechaSuspensionDefinitiva: string | null;
  fechaReinicioActividades: string | null;
  obligadoContabilidad: string | null;
  tipoContribuyente: string;
  numeroEstablecimiento: string;
  nombreComercial: string | null;
  estadoEstablecimiento: string | null;
  provincia: string | null;
  canton: string | null;
  parroquia: string | null;
  codigoCiiu: string | null;
  actividad: string | null;
  agenteRetencion: string | null;
  contribuyenteEspecial: string | null;
}

export interface ResultadoFila {
  fila: FilaSri | null;
  motivo?: string;
  /** true si la línea venía mal formada y hubo que repararla con comillas. */
  reparada?: boolean;
}

/** Comprueba que la cabecera es la esperada, sin depender del orden del archivo. */
export function validarCabecera(linea: string): { indices: Record<string, number>; faltan: string[] } {
  const claves = partirSimple(linea).map((c) => headerKey(c));
  const indices: Record<string, number> = {};
  const faltan: string[] = [];
  for (const campo of CAMPOS_SRI) {
    const i = claves.indexOf(campo);
    if (i === -1) faltan.push(campo);
    indices[campo] = i;
  }
  return { indices, faltan };
}

const partirSimple = (linea: string): string[] => linea.split('|');

/**
 * Parte una línea respetando las comillas dobles.
 *
 * Se usa SÓLO cuando el split rápido no da el número de campos esperado. En el
 * padrón real eso ocurre en 97 de 8.432.317 filas: las que traen un `|` literal
 * dentro de `RAZON_SOCIAL`, entrecomillado.
 *
 *     0101888055001|"VINTIMILLA VIVAR PEDRO JOSE|"|AZUAY|ACTIVO|...
 *
 * Partir esas a ciegas da 22 campos en vez de 21 y **corre todas las columnas
 * una posición**: el tipo de contribuyente pasa a ser "N", la provincia deja de
 * ser la provincia, y nada de eso da error. Se cargarían 97 filas silenciosamente
 * corruptas.
 */
export function partirConComillas(linea: string): string[] {
  const campos: string[] = [];
  let actual = '';
  let dentro = false;

  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      // Comilla doble escapada dentro de un campo entrecomillado.
      if (dentro && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else {
        dentro = !dentro;
      }
    } else if (c === '|' && !dentro) {
      campos.push(actual);
      actual = '';
    } else {
      actual += c;
    }
  }
  campos.push(actual);
  return campos;
}

/**
 * Interpreta una línea de datos.
 *
 * Primero el camino rápido (`split`), que cubre 8,4 millones de filas; sólo si
 * el número de campos no cuadra se reintenta con el parser de comillas. Hacer el
 * caro siempre costaría minutos sobre este volumen.
 */
export function parsearFilaSri(linea: string): ResultadoFila {
  let campos = partirSimple(linea);
  let reparada = false;

  if (campos.length !== NUM_CAMPOS) {
    const reparados = partirConComillas(linea);
    if (reparados.length === NUM_CAMPOS) {
      campos = reparados;
      reparada = true;
    } else {
      return {
        fila: null,
        motivo: `campos_inesperados:${campos.length}_esperados_${NUM_CAMPOS}`,
      };
    }
  }

  const ruc = nullify(campos[0]);
  if (ruc === null) return { fila: null, motivo: 'ruc_vacio' };

  const razonSocial = nullify(campos[1]);
  if (razonSocial === null) return { fila: null, motivo: 'razon_social_vacia' };

  const tipo = nullify(campos[10]);
  if (tipo === null) return { fila: null, motivo: 'tipo_contribuyente_vacio' };
  if (tipo !== TIPO_PERSONA_NATURAL && tipo !== TIPO_SOCIEDAD) {
    // No se adivina: un tipo desconocido significa casi siempre que la fila
    // viene desplazada, y clasificarla mal es peor que rechazarla.
    return { fila: null, motivo: `tipo_contribuyente_desconocido:${tipo.slice(0, 30)}` };
  }

  const numero = nullify(campos[11]) ?? '1';

  return {
    reparada,
    fila: {
      ruc,
      razonSocial,
      jurisdiccion: nullify(campos[2]),
      estadoContribuyente: nullify(campos[3]),
      claseContribuyente: nullify(campos[4]),
      fechaInicioActividades: fecha(campos[5]),
      fechaActualizacion: fecha(campos[6]),
      fechaSuspensionDefinitiva: fecha(campos[7]),
      fechaReinicioActividades: fecha(campos[8]),
      obligadoContabilidad: sino(campos[9]),
      tipoContribuyente: tipo,
      numeroEstablecimiento: numero,
      nombreComercial: nullify(campos[12]),
      estadoEstablecimiento: nullify(campos[13]),
      provincia: nullify(campos[14]),
      canton: nullify(campos[15]),
      parroquia: nullify(campos[16]),
      codigoCiiu: nullify(campos[17]),
      actividad: nullify(campos[18]),
      agenteRetencion: sino(campos[19]),
      contribuyenteEspecial: sino(campos[20]),
    },
  };
}

/** `2001-05-28 00:00:00` -> `2001-05-28`. Un valor ilegible es NULL, no un error. */
function fecha(bruto: string | undefined): string | null {
  const limpio = nullify(bruto ?? null);
  if (limpio === null) return null;
  const soloFecha = limpio.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(soloFecha)) {
    // Se valida de verdad: `2024-02-31` pasa el regex y revienta el COPY.
    return coerceDate(soloFecha).value;
  }
  return coerceDate(limpio).value;
}

/** `S`/`N` -> `t`/`f` en formato COPY. Vacío o desconocido -> NULL. */
function sino(bruto: string | undefined): string | null {
  const limpio = nullify(bruto ?? null);
  if (limpio === null) return null;
  const k = limpio.toUpperCase();
  if (k === 'S') return 't';
  if (k === 'N') return 'f';
  return null;
}
