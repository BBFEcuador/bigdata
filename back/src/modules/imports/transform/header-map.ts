import { headerKey } from '../../../common/text/normalize';
import { BUSINESS_COLUMNS, BusinessColumn, REQUIRED_COLUMNS } from '../imports.constants';

/**
 * Mapeo de cabeceras del Excel a columnas de la base.
 *
 * La resolución se hace UNA vez contra la fila de cabecera y produce un array
 * posicional; en las filas siguientes no se busca por nombre. Con un millón de
 * filas, buscar por nombre en cada una es un coste que no hace falta pagar.
 */

/** Claves canónicas (ver `headerKey`) aceptadas para cada columna. */
const ALIASES: Record<BusinessColumn, string[]> = {
  expediente: ['EXPEDIENTE', 'NO_EXPEDIENTE', 'NUM_EXPEDIENTE', 'NUMERO_EXPEDIENTE'],
  ruc: ['RUC', 'R_U_C', 'NUMERO_RUC', 'RUC_COMPANIA'],
  nombre: ['NOMBRE', 'RAZON_SOCIAL', 'NOMBRE_COMPANIA', 'DENOMINACION'],
  situacion_legal: ['SITUACION_LEGAL', 'SITUACION', 'ESTADO_LEGAL', 'ESTADO'],
  fecha_constitucion: ['FECHA_CONSTITUCION', 'FECHA_DE_CONSTITUCION', 'F_CONSTITUCION'],
  tipo: ['TIPO', 'TIPO_COMPANIA', 'TIPO_DE_COMPANIA'],
  pais: ['PAIS', 'PAIS_DOMICILIO', 'PAIS_DE_DOMICILIO'],
  region: ['REGION', 'REGION_NATURAL', 'ZONA'],
  provincia: ['PROVINCIA'],
  canton: ['CANTON'],
  ciudad: ['CIUDAD', 'PARROQUIA_CIUDAD'],
  calle: ['CALLE', 'DIRECCION', 'CALLE_PRINCIPAL'],
  numero: ['NUMERO', 'NUM', 'NRO', 'NUMERO_CASA'],
  interseccion: ['INTERSECCION', 'CALLE_SECUNDARIA', 'TRANSVERSAL'],
  barrio: ['BARRIO', 'SECTOR', 'BARRIO_SECTOR'],
  telefono: ['TELEFONO', 'TELEFONOS', 'TELF', 'TLF'],
  representante: ['REPRESENTANTE', 'REPRESENTANTE_LEGAL', 'NOMBRE_REPRESENTANTE'],
  cargo: ['CARGO', 'CARGO_REPRESENTANTE'],
  capital_suscrito: ['CAPITAL_SUSCRITO', 'CAPITAL', 'CAPITAL_SUSCRITO_USD'],
  ciiu_nivel_1: ['CIIU_NIVEL_1', 'CIIU_N1', 'CIIU1', 'CIIU_NIVEL1', 'ACTIVIDAD_NIVEL_1'],
  ciiu_nivel_6: ['CIIU_NIVEL_6', 'CIIU_N6', 'CIIU6', 'CIIU_NIVEL6', 'ACTIVIDAD_NIVEL_6'],
  ultimo_balance: ['ULTIMO_BALANCE', 'ANIO_ULTIMO_BALANCE', 'ULTIMO_BALANCE_PRESENTADO'],
  presento_balance_inicial: ['PRESENTO_BALANCE_INICIAL', 'BALANCE_INICIAL', 'PRESENTO_BAL_INICIAL'],
  fecha_presentacion_balance_inicial: [
    'FECHA_PRESENTACION_BALANCE_INICIAL',
    'FECHA_PRESENTACION_BAL_INICIAL',
    'FECHA_BALANCE_INICIAL',
  ],
};

const LOOKUP: Map<string, BusinessColumn> = (() => {
  const m = new Map<string, BusinessColumn>();
  for (const col of BUSINESS_COLUMNS) {
    for (const alias of ALIASES[col]) m.set(alias, col);
  }
  return m;
})();

export interface HeaderResolution {
  /** Índice (0-based dentro de `cells`) de cada columna encontrada. */
  indexByColumn: Partial<Record<BusinessColumn, number>>;
  /** Cabeceras del archivo que no corresponden a ninguna columna conocida. */
  unknownHeaders: string[];
  /** Columnas conocidas que el archivo no trae. */
  missingColumns: BusinessColumn[];
}

/**
 * Resuelve la fila de cabecera.
 *
 * `cells` viene de ExcelJS con índice 1-based (la posición 0 está vacía); aquí
 * se guarda el índice tal cual, para poder indexar directamente el array de
 * cada fila sin correcciones posteriores.
 */
export function resolveHeader(cells: unknown[]): HeaderResolution {
  const indexByColumn: Partial<Record<BusinessColumn, number>> = {};
  const unknownHeaders: string[] = [];

  for (let i = 0; i < cells.length; i++) {
    const raw = cells[i];
    if (raw === null || raw === undefined) continue;
    const key = headerKey(typeof raw === 'object' ? (raw as any).text ?? raw : raw);
    if (key === '') continue;
    const col = LOOKUP.get(key);
    if (!col) {
      unknownHeaders.push(String(key));
      continue;
    }
    // Si una columna aparece dos veces gana la primera.
    if (indexByColumn[col] === undefined) indexByColumn[col] = i;
  }

  const missingColumns = BUSINESS_COLUMNS.filter((c) => indexByColumn[c] === undefined);
  return { indexByColumn, unknownHeaders, missingColumns };
}

/**
 * Falla el import si faltan columnas imprescindibles.
 * Es mejor abortar en el segundo 1 que cargar un millón de filas de NULLs.
 */
export function assertRequiredColumns(res: HeaderResolution, foundHeaders: string[]): void {
  const faltan = REQUIRED_COLUMNS.filter((c) => res.indexByColumn[c] === undefined);
  if (faltan.length > 0) {
    throw new Error(
      `El archivo no tiene las columnas obligatorias: ${faltan.join(', ')}. ` +
        `Cabeceras encontradas: ${foundHeaders.join(' | ')}`,
    );
  }
}
