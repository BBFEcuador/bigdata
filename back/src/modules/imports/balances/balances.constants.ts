/**
 * Fuente única de verdad del import de balances.
 *
 * Igual que en compañías, estos arrays alimentan a la vez el DDL del staging, la
 * lista del `COPY`, el serializador y el `INSERT` del merge. Si se
 * desincronizaran, los datos entrarían desplazados de columna sin ningún error.
 *
 * A diferencia de compañías, aquí hay DOS destinos —cabecera y detalle— porque
 * el archivo viene en formato ancho y se guarda en largo.
 */

/** Campos de identidad del archivo, en el orden de la tabla `balance`. */
export const BALANCE_COLUMNS = [
  'anio',
  'expediente',
  'ruc',
  'nombre',
  'rama_actividad',
  'descripcion_rama',
  'ciiu',
] as const;

export type BalanceColumn = (typeof BALANCE_COLUMNS)[number];

/**
 * Cabecera esperada en el .txt para cada campo de identidad, ya en forma
 * canónica (`headerKey`: sin tildes, mayúsculas, separadores a `_`).
 * "AÑO" se normaliza a "ANO".
 */
export const CABECERAS_IDENTIDAD: Record<BalanceColumn, string> = {
  anio: 'ANO',
  expediente: 'EXPEDIENTE',
  ruc: 'RUC',
  nombre: 'NOMBRE',
  rama_actividad: 'RAMA_ACTIVIDAD',
  descripcion_rama: 'DESCRIPCION_RAMA',
  ciiu: 'CIIU',
};

/** Sin estos dos la fila no identifica a nadie y se rechaza entera. */
export const BALANCE_REQUERIDAS: BalanceColumn[] = ['anio', 'expediente'];

/**
 * Columnas del COPY al staging de cabeceras, en el orden EXACTO en que el
 * servicio serializa cada fila.
 *
 * `formulario` va aquí pero NO en `BALANCE_COLUMNS`: no es una columna del
 * archivo (se detecta una vez, del encabezado), pero sí una columna de la tabla.
 * Confundir ambas listas fue el primer bug real de este importador — el COPY
 * recibía 10 campos esperando 9 y fallaba con "extra data after last expected
 * column". Hay un test que fija la correspondencia con `STAGING_TYPES_BALANCE`.
 */
export const COPY_COLUMNS_BALANCE = [
  'source_row_number',
  'anio',
  'formulario',
  'expediente',
  'ruc',
  'nombre',
  'rama_actividad',
  'descripcion_rama',
  'ciiu',
  'row_hash',
] as const;

export const STAGING_TYPES_BALANCE: Record<string, string> = {
  source_row_number: 'bigint NOT NULL',
  anio: 'smallint',
  formulario: 'smallint',
  expediente: 'text',
  ruc: 'text',
  nombre: 'text',
  rama_actividad: 'text',
  descripcion_rama: 'text',
  ciiu: 'text',
  row_hash: 'uuid NOT NULL',
};

/** Columnas del COPY al staging de detalle, en orden de serialización. */
export const COPY_COLUMNS_CUENTA = [
  'anio',
  'formulario',
  'expediente',
  'codigo_cuenta',
  'valor',
] as const;

export const STAGING_TYPES_CUENTA: Record<string, string> = {
  anio: 'smallint NOT NULL',
  formulario: 'smallint NOT NULL',
  expediente: 'text NOT NULL',
  codigo_cuenta: 'text NOT NULL',
  valor: 'numeric(18,2) NOT NULL',
};

export const IMPORT_KIND_BALANCES = 'supercias_balances';

/** Prefijo de las columnas de cuenta: `CUENTA_10102010101`. */
export const PREFIJO_CUENTA = 'CUENTA_';

/**
 * Año mínimo y máximo admisibles. El rango existe para que un archivo con la
 * columna corrida no cree una partición `balance_cuenta_1329498`.
 */
export const ANIO_MIN = 1990;
export const ANIO_MAX = 2100;

/**
 * Mínimo de columnas de cuenta para dar la cabecera por buena. El archivo real
 * trae 622; muy por debajo significa que el separador no es el tabulador o que
 * el archivo no es el que se cree.
 */
export const MIN_COLUMNAS_CUENTA = 50;

/**
 * Formularios que se pueden cargar.
 *
 * La detección del formulario a partir del número de cuentas vive en
 * `../formularios.ts`, compartida con el importador de catálogo: los dos tienen
 * que llegar al mismo número o el detalle no encontraría sus cuentas.
 *
 * El 2 (868 cuentas) queda fuera porque de él sólo hay archivos de muestra con
 * una fila. Cargar un formulario exige tener antes su plan de cuentas.
 */
export const FORMULARIOS_SOPORTADOS = [1, 3];
