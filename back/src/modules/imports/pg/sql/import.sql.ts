import {
  BUSINESS_COLUMNS,
  COPY_COLUMNS,
  STAGING_COLUMN_TYPES,
} from '../../imports.constants';

/**
 * Todo el SQL del import se genera desde `COPY_COLUMNS` / `BUSINESS_COLUMNS`.
 * Nada de listas de columnas escritas a mano: si el DDL del staging, la lista
 * del COPY y el INSERT del merge se desincronizan, los datos entran desplazados
 * de columna y no lo detecta ningún error de Postgres.
 */

/** Nombre de la tabla de staging de un job (identificador seguro). */
export function stagingTableName(jobId: string): string {
  return `stg_companias_${jobId.replace(/-/g, '')}`;
}

export function createStagingTableSql(table: string): string {
  const cols = COPY_COLUMNS.map((c) => `  ${c} ${STAGING_COLUMN_TYPES[c]}`).join(',\n');
  // UNLOGGED: no escribe WAL. Sobre un millón de filas son cientos de MB de WAL
  // que no se generan, y no hay nada que recuperar ante un fallo porque la tabla
  // se reconstruye desde el archivo.
  return `CREATE UNLOGGED TABLE ${table} (\n${cols}\n)`;
}

export function dropStagingTableSql(table: string): string {
  return `DROP TABLE IF EXISTS ${table}`;
}

export function copyIntoStagingSql(table: string): string {
  return `COPY ${table} (${COPY_COLUMNS.join(', ')}) FROM STDIN WITH (FORMAT text)`;
}

/**
 * Merge idempotente de una partición del staging.
 *
 * Puntos que importan:
 *
 * - `DISTINCT ON (expediente) ... ORDER BY expediente, source_row_number DESC`
 *   es OBLIGATORIO. Si el archivo trae el mismo expediente dos veces, ON CONFLICT
 *   falla con "cannot affect row a second time" — después de haber procesado el
 *   archivo entero. Gana la última aparición.
 *
 * - `WHERE row_hash IS DISTINCT FROM ... OR ausente_desde_job IS NOT NULL`
 *   suprime la escritura de las filas que no cambiaron. Volver a subir el mismo
 *   archivo no genera un millón de tuplas muertas. La segunda condición es la
 *   que resucita una compañía que había desaparecido y vuelve con datos
 *   idénticos: sin ella el guard la saltaría y se quedaría marcada como ausente.
 *
 * - `xmax = 0` distingue inserciones de actualizaciones en el RETURNING.
 *
 * - La partición se hace por hash del EXPEDIENTE, nunca por número de fila: los
 *   duplicados de un mismo expediente tienen que caer en la misma partición para
 *   que el DISTINCT ON los vea juntos.
 */
export function mergeChunkSql(table: string): string {
  const updatable = BUSINESS_COLUMNS.filter((c) => c !== 'expediente');

  return `
WITH src AS (
  SELECT DISTINCT ON (s.expediente) s.*
  FROM ${table} s
  WHERE s.expediente IS NOT NULL
    AND ((hashtext(s.expediente) % $2) + $2) % $2 = $3
  ORDER BY s.expediente, s.source_row_number DESC
),
merged AS (
  INSERT INTO companias (
    ${BUSINESS_COLUMNS.join(', ')},
    row_hash, primer_job_id, ultimo_job_id, ausente_desde_job
  )
  SELECT
    ${BUSINESS_COLUMNS.map((c) => `src.${c}`).join(', ')},
    src.row_hash, $1, $1, NULL
  FROM src
  ON CONFLICT (expediente) DO UPDATE SET
    ${updatable.map((c) => `${c} = EXCLUDED.${c}`).join(',\n    ')},
    row_hash = EXCLUDED.row_hash,
    ultimo_job_id = EXCLUDED.ultimo_job_id,
    ausente_desde_job = NULL,
    updated_at = now()
  WHERE companias.row_hash IS DISTINCT FROM EXCLUDED.row_hash
     OR companias.ausente_desde_job IS NOT NULL
  RETURNING (xmax = 0) AS inserted
)
SELECT
  count(*) FILTER (WHERE inserted)     AS inserted,
  count(*) FILTER (WHERE NOT inserted) AS updated
FROM merged
`;
}

/**
 * Marca como ausentes las compañías que ya no vienen en el archivo.
 *
 * No se borra nada: sólo se sella `ausente_desde_job` en las filas que todavía
 * no estaban marcadas. Como sólo escribe las que realmente desaparecieron
 * (normalmente unas pocas), es un anti-join barato y no toca el millón de filas.
 */
export function markMissingSql(table: string): string {
  return `
UPDATE companias c
SET ausente_desde_job = $1, updated_at = now()
WHERE c.ausente_desde_job IS NULL
  AND NOT EXISTS (SELECT 1 FROM ${table} s WHERE s.expediente = c.expediente)
`;
}

/** Cuántas filas marcaría `markMissingSql`, para el control de seguridad. */
export function countMissingSql(table: string): string {
  return `
SELECT count(*)::bigint AS missing,
       (SELECT count(*)::bigint FROM companias WHERE ausente_desde_job IS NULL) AS vivas
FROM companias c
WHERE c.ausente_desde_job IS NULL
  AND NOT EXISTS (SELECT 1 FROM ${table} s WHERE s.expediente = c.expediente)
`;
}

/**
 * Índices secundarios, creados DESPUÉS de la primera carga.
 *
 * Construir un índice sobre filas ya cargadas es varias veces más rápido que
 * mantenerlo fila a fila durante la inserción, y el GIN de trigramas es el caso
 * extremo: es el motivo habitual de que una primera carga se arrastre. En cargas
 * posteriores ya existen y esto no hace nada.
 *
 * CONCURRENTLY no puede ir dentro de una transacción: se ejecutan sueltos.
 */
export const SECONDARY_INDEXES: { name: string; sql: string }[] = [
  {
    name: 'idx_companias_ruc',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companias_ruc ON companias (ruc)',
  },
  {
    name: 'idx_companias_provincia_canton',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companias_provincia_canton ON companias (provincia, canton)',
  },
  {
    name: 'idx_companias_situacion',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companias_situacion ON companias (situacion_legal)',
  },
  {
    name: 'idx_companias_ciiu1',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companias_ciiu1 ON companias (ciiu_nivel_1)',
  },
  {
    name: 'idx_companias_nombre_trgm',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companias_nombre_trgm ON companias USING gin (nombre gin_trgm_ops)',
  },
];

/**
 * Ajustes de sesión para la conexión dedicada del import.
 *
 * `synchronous_commit = off` es el de mayor impacto y aquí no arriesga nada: si
 * el servidor cae, lo que se pierde es un staging que se reconstruye desde el
 * archivo. `jit = off` evita que Postgres gaste cientos de milisegundos
 * compilando el plan del merge sin ganancia alguna en DML masivo.
 */
export const SESSION_TUNING: string[] = [
  'SET synchronous_commit = off',
  "SET maintenance_work_mem = '1GB'",
  "SET work_mem = '256MB'",
  "SET temp_buffers = '256MB'",
  'SET statement_timeout = 0',
  'SET idle_in_transaction_session_timeout = 0',
  "SET lock_timeout = '30s'",
  'SET jit = off',
];
