import { deaccent, nullify } from '../../../common/text/normalize';
import { coerceDate, coerceRuc, coerceText } from '../transform/coercions';
import { CabeceraResuelta, buscarCabecera, faltantes } from '../transform/header-alias';
import { huellaDeFila } from '../transform/row-hash';
import { SourceRow } from '../xlsx/xlsx-row-source';
import { CAMPOS_TURISMO, CAMPOS_TURISMO_REQUERIDOS, CampoTurismo } from './turismo.constants';

/**
 * Parseo del Catastro Nacional de Turismo.
 *
 * El archivo es plano y limpio de estructura —una cabecera y 35.571 filas— así
 * que lo que hay aquí no es parseo sino saneamiento: el mismo dato viene
 * escrito de varias formas y hay tres puntos donde copiar la celda tal cual
 * rompería las consultas después.
 */

export interface RegistroTurismo {
  numeroRegistro: string;
  ruc: string;
  codigoEstablecimiento: string | null;
  codigoEstablecimientoRaw: string | null;
  nombreComercial: string | null;
  fechaRegistro: string | null;
  fechaRegistroRaw: string | null;
  actividad: string;
  clasificacion: string | null;
  categoria: string | null;
  categoriaNorm: string | null;
  razonSocialPropietario: string | null;
  representanteLegal: string | null;
  provincia: string | null;
  canton: string | null;
  parroquia: string | null;
  tipoParroquia: string | null;
  direccion: string | null;
  referenciaDireccion: string | null;
  telefono: string | null;
  correo: string | null;
  sitioWeb: string | null;
  estadoRegistro: string | null;
  rowHash: string;
  fila: number;
}

export interface IncidenciaTurismo {
  fila: number;
  columna?: string | null;
  motivo: string;
  raw: Record<string, unknown>;
}

export interface ResultadoParseoTurismo {
  registros: RegistroTurismo[];
  rechazos: IncidenciaTurismo[];
  avisos: IncidenciaTurismo[];
  duplicados: number;
}

const t = (cell: unknown): string | null => coerceText(cell).value;

/**
 * Código de establecimiento sin ceros a la izquierda.
 *
 * El archivo escribe el mismo local como "1", "01" o "001" —las tres formas
 * conviven en el mismo fichero— mientras que el padrón del SRI lo guarda
 * siempre sin relleno. Sin esto, el join con `establecimiento` fallaría en las
 * 18.146 filas que vienen con tres dígitos.
 */
export function normalizarCodigoEstablecimiento(valor: string | null): string | null {
  if (valor === null) return null;
  const limpio = valor.replace(/\s+/g, '');
  if (limpio === '') return null;
  if (!/^\d+$/.test(limpio)) return limpio;
  return String(Number(limpio));
}

/**
 * El código de establecimiento que va dentro del número de registro.
 *
 * `0100024025001.001.1013877` -> RUC, establecimiento, número de trámite.
 * Sólo se usa como respaldo cuando la columna propia viene vacía: donde las dos
 * fuentes discrepan (120 filas), la columna acierta 115 veces contra el padrón
 * del SRI y el número de registro sólo 57.
 */
export function codigoDesdeNumeroRegistro(numeroRegistro: string): string | null {
  const partes = numeroRegistro.split('.');
  if (partes.length !== 3) return null;
  return normalizarCodigoEstablecimiento(partes[1]);
}

/**
 * Categoría en mayúsculas y sin tildes.
 *
 * Las 42 categorías distintas del archivo son en realidad muchas menos: "3
 * Estrellas" y "3 estrellas" son la misma, y "Categoría Única" aparece además
 * como "Categoria Unica", "CategoríaÚnica", "Categoría ünica" y "CAtegoría
 * Única". Agrupar por la columna cruda daría un grupo por errata.
 */
export function normalizarCategoria(valor: string | null): string | null {
  if (valor === null) return null;
  return deaccent(valor).toUpperCase().replace(/\s+/g, ' ').trim();
}

/** 'urbana' | 'rural'; el archivo mezcla "URBANA", "Urbana" y "urbana". */
export function normalizarTipoParroquia(valor: string | null): string | null {
  if (valor === null) return null;
  const k = deaccent(valor).toUpperCase().trim();
  if (k === 'URBANA') return 'urbana';
  if (k === 'RURAL') return 'rural';
  return null;
}

/**
 * Correo electrónico, sólo si lo parece.
 *
 * Se guarda en su propia columna indexada porque es el dato con valor comercial
 * del catastro; meter ahí un "no tiene" o un teléfono la haría inútil.
 */
export function normalizarCorreo(valor: string | null): string | null {
  if (valor === null) return null;
  const v = valor.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

export function parsearTurismo(filas: SourceRow[]): ResultadoParseoTurismo {
  const registros: RegistroTurismo[] = [];
  const rechazos: IncidenciaTurismo[] = [];
  const avisos: IncidenciaTurismo[] = [];
  const vistos = new Map<string, number>();
  let duplicados = 0;

  const cabecera = buscarCabecera<CampoTurismo>(
    filas,
    CAMPOS_TURISMO,
    CAMPOS_TURISMO_REQUERIDOS,
  ) as CabeceraResuelta<CampoTurismo> | null;

  const faltan = faltantes(cabecera, CAMPOS_TURISMO_REQUERIDOS);
  if (!cabecera || faltan.length > 0) {
    throw new Error(
      `El archivo no parece el Catastro Nacional de Turismo: faltan las columnas ` +
        `${faltan.join(', ')}. Cabeceras encontradas: ` +
        `${(cabecera?.rotulos ?? []).slice(0, 25).join(' | ') || '(ninguna)'}`,
    );
  }

  const idx = cabecera.indices;
  const celda = (fila: SourceRow, campo: CampoTurismo): unknown => {
    const i = idx[campo];
    return i === undefined ? null : fila.cells[i];
  };

  for (const fila of filas) {
    if (fila.rowNumber <= cabecera.fila) continue;

    const numeroRegistro = t(celda(fila, 'numeroRegistro'));
    const rucCoerced = coerceRuc(celda(fila, 'ruc'));
    const actividad = t(celda(fila, 'actividad'));

    // Fila vacía del final de la hoja: ni se rechaza ni se cuenta.
    if (numeroRegistro === null && rucCoerced.value === null && actividad === null) continue;

    if (numeroRegistro === null) {
      rechazos.push({
        fila: fila.rowNumber,
        columna: 'numero_registro',
        motivo: 'sin_numero_registro: la fila no identifica ningún registro turístico',
        raw: { ruc: rucCoerced.value, actividad },
      });
      continue;
    }
    if (rucCoerced.value === null) {
      rechazos.push({
        fila: fila.rowNumber,
        columna: 'ruc',
        motivo: 'sin_ruc: no se puede enlazar con ningún contribuyente',
        raw: { numeroRegistro },
      });
      continue;
    }
    if (actividad === null) {
      rechazos.push({
        fila: fila.rowNumber,
        columna: 'actividad',
        motivo: 'sin_actividad: la actividad/modalidad es la clasificación primaria del catastro',
        raw: { numeroRegistro, ruc: rucCoerced.value },
      });
      continue;
    }

    // Un RUC ilegible no invalida la fila —el resto de datos sigue sirviendo—
    // pero sí impide enlazarla, así que queda constancia.
    if (rucCoerced.error) {
      avisos.push({
        fila: fila.rowNumber,
        columna: 'ruc',
        motivo: rucCoerced.error,
        raw: { numeroRegistro, ruc: rucCoerced.value },
      });
    }

    // La fecha se rechaza sola: hay filas con dos fechas en la misma celda
    // ("6/07/2026; 28/07/2026"). Perder la fecha no justifica perder el local.
    const fechaCruda = celda(fila, 'fechaRegistro');
    const fecha = coerceDate(fechaCruda);
    let fechaRegistroRaw: string | null = null;
    if (fecha.error) {
      fechaRegistroRaw = nullify(String(fechaCruda ?? ''))?.slice(0, 100) ?? null;
      avisos.push({
        fila: fila.rowNumber,
        columna: 'fecha_registro',
        motivo: fecha.error,
        raw: { numeroRegistro, valor: fechaRegistroRaw },
      });
    }

    const codigoRaw = t(celda(fila, 'codigoEstablecimiento'));
    const categoria = t(celda(fila, 'categoria'));

    const item: RegistroTurismo = {
      numeroRegistro,
      ruc: rucCoerced.value,
      codigoEstablecimiento:
        normalizarCodigoEstablecimiento(codigoRaw) ?? codigoDesdeNumeroRegistro(numeroRegistro),
      codigoEstablecimientoRaw: codigoRaw,
      nombreComercial: t(celda(fila, 'nombreComercial')),
      fechaRegistro: fecha.value,
      fechaRegistroRaw,
      actividad,
      clasificacion: t(celda(fila, 'clasificacion')),
      categoria,
      categoriaNorm: normalizarCategoria(categoria),
      razonSocialPropietario: t(celda(fila, 'razonSocialPropietario')),
      representanteLegal: t(celda(fila, 'representanteLegal')),
      provincia: t(celda(fila, 'provincia')),
      canton: t(celda(fila, 'canton')),
      parroquia: t(celda(fila, 'parroquia')),
      tipoParroquia: normalizarTipoParroquia(t(celda(fila, 'tipoParroquia'))),
      direccion: t(celda(fila, 'direccion')),
      referenciaDireccion: t(celda(fila, 'referenciaDireccion')),
      telefono: t(celda(fila, 'telefono')),
      correo: normalizarCorreo(t(celda(fila, 'correo'))),
      sitioWeb: t(celda(fila, 'sitioWeb')),
      estadoRegistro: t(celda(fila, 'estadoRegistro')),
      rowHash: '',
      fila: fila.rowNumber,
    };

    item.rowHash = huellaDeFila([
      item.ruc,
      item.codigoEstablecimiento,
      item.nombreComercial,
      item.fechaRegistro,
      item.fechaRegistroRaw,
      item.actividad,
      item.clasificacion,
      item.categoria,
      item.razonSocialPropietario,
      item.representanteLegal,
      item.provincia,
      item.canton,
      item.parroquia,
      item.tipoParroquia,
      item.direccion,
      item.referenciaDireccion,
      item.telefono,
      item.correo,
      item.sitioWeb,
      item.estadoRegistro,
    ]);

    // Gana la última aparición, como en los demás importadores: dos filas con
    // el mismo número de registro reventarían el ON CONFLICT del upsert. El
    // archivo trae dos casos, y en uno de ellos las dos filas difieren en el
    // nombre comercial, así que la elección importa.
    const previo = vistos.get(numeroRegistro);
    if (previo !== undefined) {
      duplicados++;
      if (registros[previo].rowHash !== item.rowHash) {
        avisos.push({
          fila: fila.rowNumber,
          columna: 'numero_registro',
          motivo: `numero_registro_duplicado_con_datos_distintos: gana la fila ${fila.rowNumber}`,
          raw: { numeroRegistro, filaPrevia: registros[previo].fila },
        });
      }
      registros[previo] = item;
      continue;
    }
    vistos.set(numeroRegistro, registros.length);
    registros.push(item);
  }

  return { registros, rechazos, avisos, duplicados };
}
