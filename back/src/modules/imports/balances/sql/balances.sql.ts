import {
  COPY_COLUMNS_BALANCE,
  COPY_COLUMNS_CUENTA,
  STAGING_TYPES_BALANCE,
  STAGING_TYPES_CUENTA,
} from '../balances.constants';

/**
 * SQL del import de balances.
 *
 * Igual que en compañías, las listas de columnas se derivan de las constantes y
 * nunca se escriben a mano: el DDL del staging, el `COPY`, el serializador y el
 * merge tienen que coincidir, y un desfase mete los datos desplazados de columna
 * sin que Postgres se queje.
 */

const sufijo = (jobId: string) => jobId.replace(/-/g, '');

export const stagingBalanceTable = (jobId: string) => `stg_balance_${sufijo(jobId)}`;
export const stagingCuentaTable = (jobId: string) => `stg_balance_cuenta_${sufijo(jobId)}`;
/** Expedientes cuyo balance cambió respecto a lo que ya hay en la base. */
export const cambiadasTable = (jobId: string) => `stg_bal_cambiadas_${sufijo(jobId)}`;

function ddl(tabla: string, columnas: readonly string[], tipos: Record<string, string>): string {
  const cols = columnas.map((c) => `  ${c} ${tipos[c]}`).join(',\n');
  // UNLOGGED: no escribe WAL. Con ~10 M filas de detalle por carga son varios GB
  // que no se generan, y no hay nada que recuperar: el staging se reconstruye
  // desde el archivo.
  return `CREATE UNLOGGED TABLE ${tabla} (\n${cols}\n)`;
}

export const createStagingBalanceSql = (t: string) =>
  ddl(t, COPY_COLUMNS_BALANCE, STAGING_TYPES_BALANCE);

export const createStagingCuentaSql = (t: string) =>
  ddl(t, COPY_COLUMNS_CUENTA, STAGING_TYPES_CUENTA);

export const copyIntoBalanceSql = (t: string) =>
  `COPY ${t} (${COPY_COLUMNS_BALANCE.join(', ')}) FROM STDIN WITH (FORMAT text)`;

export const copyIntoCuentaSql = (t: string) =>
  `COPY ${t} (${COPY_COLUMNS_CUENTA.join(', ')}) FROM STDIN WITH (FORMAT text)`;

/**
 * Crea la partición de un año si no existe.
 *
 * No va en la migración porque los años que se van a cargar no se conocen en
 * tiempo de migración: el año sale del propio archivo.
 */
export function crearParticionSql(anio: number): string {
  return `CREATE TABLE IF NOT EXISTS balance_cuenta_${anio}
          PARTITION OF balance_cuenta FOR VALUES IN (${anio})`;
}

/**
 * Materializa qué expedientes del archivo traen un balance DISTINTO del que ya
 * está guardado.
 *
 * Es la pieza que hace la reimportación gratuita. El `row_hash` de la cabecera
 * cubre la identidad **y todos los importes de la fila**, así que "el hash no
 * cambió" significa "este balance es idéntico al que ya tengo" y su detalle
 * —hasta 622 filas— no hace falta tocarlo. Sin esta tabla, volver a subir el
 * mismo archivo reescribiría 10 millones de filas para dejarlas igual.
 *
 * Tiene que calcularse ANTES de mezclar las cabeceras: después, todos los hashes
 * coincidirían y no quedaría ninguna cambiada.
 */
export function crearCambiadasSql(cambiadas: string, staging: string): string {
  return `
CREATE UNLOGGED TABLE ${cambiadas} AS
SELECT s.anio, s.formulario, s.expediente
FROM (
  SELECT DISTINCT ON (anio, formulario, expediente) anio, formulario, expediente, row_hash
  FROM ${staging}
  WHERE expediente IS NOT NULL
  ORDER BY anio, formulario, expediente, source_row_number DESC
) s
LEFT JOIN balance b
  ON b.anio = s.anio AND b.formulario = s.formulario AND b.expediente = s.expediente
WHERE b.row_hash IS DISTINCT FROM s.row_hash
   OR b.ausente_desde_job IS NOT NULL
`;
}

/**
 * Merge de una partición de cabeceras.
 *
 * `DISTINCT ON` es obligatorio: si el archivo repite un expediente dentro del
 * mismo año y formulario, `ON CONFLICT` falla con "cannot affect row a second
 * time" tras haber procesado el archivo entero. Gana la última aparición.
 *
 * La partición se calcula por hash del EXPEDIENTE y no por número de fila, para
 * que los duplicados de un mismo expediente caigan juntos y el `DISTINCT ON` los
 * vea.
 */
export function mergeBalanceChunkSql(staging: string): string {
  return `
WITH src AS (
  SELECT DISTINCT ON (s.anio, s.formulario, s.expediente) s.*
  FROM ${staging} s
  WHERE s.expediente IS NOT NULL
    AND ((hashtext(s.expediente) % $2) + $2) % $2 = $3
  ORDER BY s.anio, s.formulario, s.expediente, s.source_row_number DESC
),
merged AS (
  INSERT INTO balance (
    anio, formulario, expediente, ruc, nombre, rama_actividad, descripcion_rama, ciiu,
    row_hash, primer_job_id, ultimo_job_id, ausente_desde_job
  )
  SELECT
    src.anio, src.formulario, src.expediente, src.ruc, src.nombre,
    src.rama_actividad, src.descripcion_rama, src.ciiu,
    src.row_hash, $1, $1, NULL
  FROM src
  ON CONFLICT (anio, formulario, expediente) DO UPDATE SET
    ruc = EXCLUDED.ruc,
    nombre = EXCLUDED.nombre,
    rama_actividad = EXCLUDED.rama_actividad,
    descripcion_rama = EXCLUDED.descripcion_rama,
    ciiu = EXCLUDED.ciiu,
    row_hash = EXCLUDED.row_hash,
    ultimo_job_id = EXCLUDED.ultimo_job_id,
    ausente_desde_job = NULL,
    updated_at = now()
  WHERE balance.row_hash IS DISTINCT FROM EXCLUDED.row_hash
     OR balance.ausente_desde_job IS NOT NULL
  RETURNING (xmax = 0) AS inserted
)
SELECT
  count(*) FILTER (WHERE inserted)     AS inserted,
  count(*) FILTER (WHERE NOT inserted) AS updated
FROM merged
`;
}

/**
 * Borra el detalle de los balances que cambiaron, antes de reinsertarlo.
 *
 * Un `ON CONFLICT DO UPDATE` no bastaría: una cuenta que el año pasado tenía
 * importe y este año está a cero no viene en el archivo —los ceros no se
 * guardan— y se quedaría ahí para siempre, inflando el activo de esa empresa
 * con un saldo que ya no existe.
 */
export function borrarDetalleChunkSql(cambiadas: string): string {
  return `
DELETE FROM balance_cuenta bc
USING ${cambiadas} c
WHERE bc.anio = c.anio
  AND bc.formulario = c.formulario
  AND bc.expediente = c.expediente
  AND ((hashtext(c.expediente) % $1) + $1) % $1 = $2
`;
}

/**
 * Inserta el detalle de los balances que cambiaron.
 *
 * El `JOIN` contra `categoria_cuenta` es la integridad referencial de esta
 * tabla. No hay FK a propósito: una FK dispara un trigger por fila y aquí son
 * ~10 M por carga. Un hash join contra una tabla de 622 filas cachada hace lo
 * mismo de una vez, y lo que no casa simplemente no entra (y se cuenta aparte).
 */
export function insertarDetalleChunkSql(staging: string, cambiadas: string): string {
  return `
WITH src AS (
  SELECT DISTINCT ON (s.anio, s.formulario, s.expediente, s.codigo_cuenta)
         s.anio, s.formulario, s.expediente, s.codigo_cuenta, s.valor
  FROM ${staging} s
  JOIN ${cambiadas} c
    ON c.anio = s.anio AND c.formulario = s.formulario AND c.expediente = s.expediente
  JOIN categoria_cuenta cc ON cc.codigo = s.codigo_cuenta
  WHERE ((hashtext(s.expediente) % $1) + $1) % $1 = $2
)
INSERT INTO balance_cuenta (anio, formulario, expediente, codigo_cuenta, valor)
SELECT anio, formulario, expediente, codigo_cuenta, valor FROM src
`;
}

/** Códigos del archivo que no existen en el catálogo cargado. */
export function codigosDesconocidosSql(staging: string): string {
  return `
SELECT DISTINCT s.codigo_cuenta
FROM ${staging} s
LEFT JOIN categoria_cuenta cc ON cc.codigo = s.codigo_cuenta
WHERE cc.codigo IS NULL
LIMIT 20
`;
}

/**
 * Cuántos balances vivos de ese año y formulario no vienen en el archivo.
 * El recuento se limita al mismo (año, formulario): que una empresa no presente
 * en 2024 no dice nada sobre su balance de 2025.
 */
export function contarAusentesSql(staging: string): string {
  return `
SELECT count(*)::bigint AS missing,
       (SELECT count(*)::bigint FROM balance
        WHERE ausente_desde_job IS NULL AND anio = $1 AND formulario = $2) AS vivas
FROM balance b
WHERE b.ausente_desde_job IS NULL
  AND b.anio = $1 AND b.formulario = $2
  AND NOT EXISTS (
    SELECT 1 FROM ${staging} s
    WHERE s.anio = b.anio AND s.formulario = b.formulario AND s.expediente = b.expediente
  )
`;
}

export function marcarAusentesSql(staging: string): string {
  return `
UPDATE balance b
SET ausente_desde_job = $3, updated_at = now()
WHERE b.ausente_desde_job IS NULL
  AND b.anio = $1 AND b.formulario = $2
  AND NOT EXISTS (
    SELECT 1 FROM ${staging} s
    WHERE s.anio = b.anio AND s.formulario = b.formulario AND s.expediente = b.expediente
  )
`;
}

/** Balances cuyo expediente no está en el directorio de compañías. */
export function contarHuerfanasSql(staging: string): string {
  return `
SELECT count(DISTINCT s.expediente)::bigint AS huerfanas
FROM ${staging} s
LEFT JOIN companias c ON c.expediente = s.expediente
WHERE c.expediente IS NULL
`;
}

/**
 * Comprueba la ecuación contable por empresa: ACTIVO = PASIVO + PATRIMONIO.
 *
 * Es un control de calidad, no un filtro: la fila se carga igual y el recuento
 * queda en los avisos del job. Los códigos 1, 2 y 3 son las tres raíces del
 * catálogo IFRS y sólo tienen ese significado en el formulario 1.
 */
export function contarDescuadresSql(staging: string): string {
  return `
WITH totales AS (
  SELECT expediente,
         sum(valor) FILTER (WHERE codigo_cuenta = '1') AS activo,
         sum(valor) FILTER (WHERE codigo_cuenta = '2') AS pasivo,
         sum(valor) FILTER (WHERE codigo_cuenta = '3') AS patrimonio
  FROM ${staging}
  WHERE formulario = 1 AND codigo_cuenta IN ('1','2','3')
  GROUP BY expediente
)
SELECT count(*)::bigint AS descuadres
FROM totales
WHERE abs(coalesce(activo,0) - (coalesce(pasivo,0) + coalesce(patrimonio,0))) > 0.05
`;
}
