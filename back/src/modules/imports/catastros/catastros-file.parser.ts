import { deaccent, headerKey } from '../../../common/text/normalize';
import { coerceBoolean, coerceDate, coerceRuc, coerceText } from '../transform/coercions';
import { buscarCabecera, faltantes } from '../transform/header-alias';
import { huellaDeFila } from '../transform/row-hash';
import { SourceRow, SourceSheet } from '../xlsx/xlsx-row-source';
import {
  CAMPOS_DIGITAL,
  CAMPOS_DIGITAL_REQUERIDOS,
  CAMPOS_EXPORTADOR,
  CAMPOS_EXPORTADOR_REQUERIDOS,
  CATASTRO_EXPORTADOR_BIENES_IR,
  CATASTRO_EXPORTADOR_BIENES_IVA,
  CATASTRO_EXPORTADOR_SERVICIOS_IVA,
  CATASTRO_SERVICIOS_DIGITALES,
  CampoDigital,
  CampoExportador,
  TipoCatastro,
} from './catastros.constants';

/**
 * Parseo de los catastros publicados por el SRI.
 *
 * Los tres de exportadores comparten forma —una hoja por ejercicio, cabecera a
 * media altura y un pie de página con notas— y el de servicios digitales es
 * otra cosa entera, así que este módulo hace dos trabajos: adivinar cuál de los
 * cuatro es el archivo y parsear el que sea.
 */

export interface FilaExportador {
  catastro: TipoCatastro;
  anio: number;
  ruc: string;
  razonSocial: string | null;
  jurisdiccion: string | null;
  provincia: string | null;
  tipoContribuyente: string | null;
  claseContribuyente: string | null;
  obligadoContabilidad: boolean | null;
  anioFiscalAnalizado: number | null;
  rowHash: string;
  hoja: string;
  fila: number;
}

export interface FilaDigital {
  proveedor: string;
  descripcion: string | null;
  referencia: string | null;
  marcaServiciosComision: string | null;
  domiciliadoOEp: boolean | null;
  registradoSri: boolean | null;
  fechaRegistro: string | null;
  fechaFinRegistro: string | null;
  rowHash: string;
  fila: number;
}

export interface IncidenciaCatastro {
  fila: number;
  columna?: string | null;
  motivo: string;
  raw: Record<string, unknown>;
}

export interface ResultadoParseoCatastros {
  tipo: TipoCatastro;
  exportadores: FilaExportador[];
  digitales: FilaDigital[];
  /** Años de aplicación que cubre el archivo; define el alcance del snapshot. */
  anios: number[];
  rechazos: IncidenciaCatastro[];
  avisos: IncidenciaCatastro[];
  duplicados: number;
  /** Notas del pie de página (fechas de publicación) para dejarlas en el job. */
  notas: string[];
}

const t = (cell: unknown): string | null => coerceText(cell).value;

/** Texto plano de una fila entera, para reconocer títulos y pies de página. */
function textoDeFila(fila: SourceRow): string {
  const partes: string[] = [];
  for (const c of fila.cells) {
    const v = t(c);
    if (v !== null && !partes.includes(v)) partes.push(v);
  }
  return deaccent(partes.join(' ')).toUpperCase();
}

/**
 * Deduce cuál de los cuatro catastros es el archivo.
 *
 * Se mira el título que llevan dentro las hojas, no el nombre del fichero: los
 * tres catastros de exportadores se descargan con nombres parecidos y cargar
 * uno como si fuera otro mezclaría dos beneficios tributarios distintos en la
 * misma serie histórica, sin que ningún error lo delatara.
 */
export function detectarTipo(hojas: SourceSheet[]): TipoCatastro | null {
  const cabecerasDigital = hojas.some((h) =>
    h.rows
      .slice(0, 5)
      .some((f) => f.cells.some((c) => headerKey(t(c) ?? '') === 'PROVEEDOR')),
  );
  if (cabecerasDigital) return CATASTRO_SERVICIOS_DIGITALES;

  const titulo = hojas
    .flatMap((h) => h.rows.slice(0, 8))
    .map(textoDeFila)
    .join(' ');

  // El orden importa: el catastro de la rebaja de renta TAMBIÉN dice
  // "EXPORTADORES HABITUALES DE BIENES", y lo que lo distingue es la rebaja.
  if (/REBAJA DE TRES|REBAJA DE 3|3 PUNTOS|TRES \(3\) PUNTOS/.test(titulo)) {
    return CATASTRO_EXPORTADOR_BIENES_IR;
  }
  if (/EXPORTACION DE SERVICIOS|EXPORTADORES HABITUALES DE SERVICIOS/.test(titulo)) {
    return CATASTRO_EXPORTADOR_SERVICIOS_IVA;
  }
  if (/EXPORTADORES HABITUALES DE BIENES/.test(titulo)) {
    return CATASTRO_EXPORTADOR_BIENES_IVA;
  }
  return null;
}

/**
 * Año de aplicación de una hoja, tomado de su nombre ("LISTADO 2024", "2024",
 * "Exp Serv 2026").
 *
 * Es la única fuente en los catastros de bienes. En los de servicios hay además
 * una columna con el año, que manda sobre esto porque la hoja de 2024 trae
 * siete filas añadidas después con año propio.
 */
export function anioDeHoja(nombre: string): number | null {
  const m = /(20\d{2})/.exec(nombre);
  if (!m) return null;
  return Number(m[1]);
}

/** ¿Es una nota al pie? Texto sólo en la primera columna y sin RUC. */
function esPieDePagina(fila: SourceRow, indiceRuc: number): boolean {
  const conValor = fila.cells.filter((c) => t(c) !== null);
  if (conValor.length === 0) return true;
  if (conValor.length > 2) return false;
  return coerceRuc(fila.cells[indiceRuc]).value === null;
}

function parsearHojaExportador(
  hoja: SourceSheet,
  tipo: TipoCatastro,
  res: ResultadoParseoCatastros,
  vistos: Map<string, number>,
): void {
  const cabecera = buscarCabecera<CampoExportador>(
    hoja.rows,
    CAMPOS_EXPORTADOR,
    CAMPOS_EXPORTADOR_REQUERIDOS,
  );
  const faltan = faltantes(cabecera, CAMPOS_EXPORTADOR_REQUERIDOS);
  if (!cabecera || faltan.length > 0) {
    res.avisos.push({
      fila: 0,
      motivo:
        `hoja_sin_columna_ruc: la hoja "${hoja.name}" no tiene columna de RUC y se ignoró ` +
        `entera. Rótulos: ${(cabecera?.rotulos ?? []).slice(0, 12).join(' | ') || '(ninguno)'}`,
      raw: { hoja: hoja.name },
    });
    return;
  }

  const anioHoja = anioDeHoja(hoja.name);
  const idx = cabecera.indices;
  const celda = (fila: SourceRow, campo: CampoExportador): unknown => {
    const i = idx[campo];
    return i === undefined ? null : fila.cells[i];
  };

  for (const fila of hoja.rows) {
    if (fila.rowNumber <= cabecera.fila) continue;
    if (esPieDePagina(fila, idx.ruc as number)) {
      const nota = t(fila.cells[idx.ruc as number]);
      if (nota) res.notas.push(`${hoja.name}: ${nota}`);
      continue;
    }

    const ruc = coerceRuc(celda(fila, 'ruc'));
    if (ruc.value === null) {
      res.rechazos.push({
        fila: fila.rowNumber,
        columna: 'ruc',
        motivo: `sin_ruc en la hoja "${hoja.name}"`,
        raw: { hoja: hoja.name, razonSocial: t(celda(fila, 'razonSocial')) },
      });
      continue;
    }
    if (ruc.error) {
      res.avisos.push({
        fila: fila.rowNumber,
        columna: 'ruc',
        motivo: `${ruc.error} (hoja "${hoja.name}")`,
        raw: { ruc: ruc.value },
      });
    }

    // La columna manda sobre el nombre de la hoja: la hoja "Exp Serv 2024"
    // trae siete filas cuyo año de aplicación es otro.
    const anioColumna = anioDeCelda(celda(fila, 'anioAplicacion'));
    const anio = anioColumna ?? anioHoja;
    if (anio === null) {
      res.rechazos.push({
        fila: fila.rowNumber,
        columna: 'anio',
        motivo:
          `sin_anio: la hoja "${hoja.name}" no lleva año en el nombre ni en una columna, ` +
          `y sin año la fila no se puede situar en la serie`,
        raw: { hoja: hoja.name, ruc: ruc.value },
      });
      continue;
    }

    const obligado = coerceBoolean(celda(fila, 'obligadoContabilidad'));
    if (obligado.error) {
      res.avisos.push({
        fila: fila.rowNumber,
        columna: 'obligado_contabilidad',
        motivo: obligado.error,
        raw: { ruc: ruc.value },
      });
    }

    const item: FilaExportador = {
      catastro: tipo,
      anio,
      ruc: ruc.value,
      razonSocial: t(celda(fila, 'razonSocial')),
      jurisdiccion: t(celda(fila, 'jurisdiccion')),
      provincia: t(celda(fila, 'provincia')),
      tipoContribuyente: t(celda(fila, 'tipoContribuyente')),
      claseContribuyente: t(celda(fila, 'claseContribuyente')),
      obligadoContabilidad: obligado.value === null ? null : obligado.value === 't',
      anioFiscalAnalizado: anioDeCelda(celda(fila, 'anioFiscalAnalizado')),
      rowHash: '',
      hoja: hoja.name,
      fila: fila.rowNumber,
    };
    item.rowHash = huellaDeFila([
      item.razonSocial,
      item.jurisdiccion,
      item.provincia,
      item.tipoContribuyente,
      item.claseContribuyente,
      item.obligadoContabilidad,
      item.anioFiscalAnalizado,
    ]);

    if (!res.anios.includes(anio)) res.anios.push(anio);

    // La clave real es (catastro, año, RUC). El archivo repite filas —354 en la
    // hoja de 2024 del catastro de bienes, idénticas— y sin deduplicar aquí el
    // ON CONFLICT del upsert fallaría con "cannot affect row a second time".
    const clave = `${anio}|${ruc.value}`;
    const previo = vistos.get(clave);
    if (previo !== undefined) {
      res.duplicados++;
      res.exportadores[previo] = item;
      continue;
    }
    vistos.set(clave, res.exportadores.length);
    res.exportadores.push(item);
  }
}

/** Año a partir de una celda que puede venir como número o como texto. */
function anioDeCelda(cell: unknown): number | null {
  const v = t(cell);
  if (v === null) return null;
  const m = /(20\d{2})/.exec(v);
  return m ? Number(m[1]) : null;
}

function parsearHojaDigital(hoja: SourceSheet, res: ResultadoParseoCatastros): void {
  const cabecera = buscarCabecera<CampoDigital>(hoja.rows, CAMPOS_DIGITAL, CAMPOS_DIGITAL_REQUERIDOS);
  const faltan = faltantes(cabecera, CAMPOS_DIGITAL_REQUERIDOS);
  if (!cabecera || faltan.length > 0) return;

  const idx = cabecera.indices;
  const celda = (fila: SourceRow, campo: CampoDigital): unknown => {
    const i = idx[campo];
    return i === undefined ? null : fila.cells[i];
  };
  const vistos = new Map<string, number>();

  for (const fila of hoja.rows) {
    if (fila.rowNumber <= cabecera.fila) continue;

    const proveedor = t(celda(fila, 'proveedor'));
    if (proveedor === null) continue;

    // El pie trae la fecha de publicación y la de la próxima, que son metadatos
    // del catastro y no proveedores.
    if (/PUBLICACION|^CATASTRO PUBLICADO/.test(deaccent(proveedor).toUpperCase())) {
      const valor = t(celda(fila, 'descripcion'));
      res.notas.push(valor ? `${proveedor} ${valor}` : proveedor);
      continue;
    }

    const item: FilaDigital = {
      proveedor,
      descripcion: t(celda(fila, 'descripcion')),
      referencia: t(celda(fila, 'referencia')),
      marcaServiciosComision: t(celda(fila, 'marcaServiciosComision')),
      domiciliadoOEp: boolOrNull(celda(fila, 'domiciliadoOEp')),
      registradoSri: boolOrNull(celda(fila, 'registradoSri')),
      fechaRegistro: coerceDate(celda(fila, 'fechaRegistro')).value,
      fechaFinRegistro: coerceDate(celda(fila, 'fechaFinRegistro')).value,
      rowHash: '',
      fila: fila.rowNumber,
    };
    item.rowHash = huellaDeFila([
      item.descripcion,
      item.referencia,
      item.marcaServiciosComision,
      item.domiciliadoOEp,
      item.registradoSri,
      item.fechaRegistro,
      item.fechaFinRegistro,
    ]);

    // 46 proveedores aparecen dos veces con el mismo texto exacto. Las
    // variantes de grafía ("NETFLIX" / "Netflix") NO son duplicados: cada una
    // es un patrón distinto con el que la operación llega al estado de cuenta.
    const previo = vistos.get(proveedor);
    if (previo !== undefined) {
      res.duplicados++;
      res.digitales[previo] = item;
      continue;
    }
    vistos.set(proveedor, res.digitales.length);
    res.digitales.push(item);
  }
}

function boolOrNull(cell: unknown): boolean | null {
  const r = coerceBoolean(cell);
  return r.value === null ? null : r.value === 't';
}

export function parsearCatastros(
  hojas: SourceSheet[],
  tipoForzado?: TipoCatastro,
): ResultadoParseoCatastros {
  const tipo = tipoForzado ?? detectarTipo(hojas);
  if (!tipo) {
    const titulos = hojas.map((h) => h.name).join(' | ');
    throw new Error(
      'No se pudo reconocer el catastro. Se esperaba uno de: exportadores habituales de ' +
        'bienes (rebaja de IR o retenciones de IVA), exportadores habituales de servicios, ' +
        `o prestadores de servicios digitales. Hojas del archivo: ${titulos}`,
    );
  }

  const res: ResultadoParseoCatastros = {
    tipo,
    exportadores: [],
    digitales: [],
    anios: [],
    rechazos: [],
    avisos: [],
    duplicados: 0,
    notas: [],
  };

  if (tipo === CATASTRO_SERVICIOS_DIGITALES) {
    for (const hoja of hojas) parsearHojaDigital(hoja, res);
    if (res.digitales.length === 0) {
      throw new Error('El catastro de servicios digitales no trajo ningún proveedor.');
    }
    return res;
  }

  const vistos = new Map<string, number>();
  for (const hoja of hojas) parsearHojaExportador(hoja, tipo, res, vistos);
  if (res.exportadores.length === 0) {
    throw new Error(
      'El archivo no trajo ninguna fila con RUC. Comprueba que sea el catastro completo ' +
        'y no un extracto sin la cabecera.',
    );
  }
  res.anios.sort((a, b) => a - b);
  return res;
}
