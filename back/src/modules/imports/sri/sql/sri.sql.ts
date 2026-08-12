import { COPY_COLUMNS_SRI, STAGING_TYPES_SRI } from '../sri.constants';

/**
 * SQL del import del padrón del SRI.
 *
 * Todo el trabajo pesado es set-based sobre el staging: 8,4 millones de filas
 * no se recorren en Node ni se clasifican fila a fila.
 */

export const stagingSriTable = (jobId: string) => `stg_sri_${jobId.replace(/-/g, '')}`;

export function createStagingSriSql(tabla: string): string {
  const cols = COPY_COLUMNS_SRI.map((c) => `  ${c} ${STAGING_TYPES_SRI[c]}`).join(',\n');
  return `CREATE UNLOGGED TABLE ${tabla} (\n${cols}\n)`;
}

export const copyIntoSriSql = (tabla: string) =>
  `COPY ${tabla} (${COPY_COLUMNS_SRI.join(', ')}) FROM STDIN WITH (FORMAT text)`;

/**
 * Índices del staging. Sin ellos, los cuatro merges de abajo hacen cuatro
 * recorridos completos de una tabla de cientos de miles de filas.
 */
export const indicesStagingSql = (tabla: string) => [
  `CREATE INDEX ON ${tabla} (ruc)`,
  `CREATE INDEX ON ${tabla} (tipo_contribuyente)`,
];

/**
 * Una fila por RUC a partir de las filas por establecimiento.
 *
 * Los datos del contribuyente se repiten en cada establecimiento suyo. Gana el
 * establecimiento de número más bajo (la matriz), que es determinista: sin el
 * `DISTINCT ON`, `ON CONFLICT` fallaría con "cannot affect row a second time"
 * en cuanto un RUC tuviera dos locales — es decir, casi siempre.
 */
function contribuyentesSql(tabla: string, filtroTipo: string): string {
  return `
  SELECT DISTINCT ON (s.ruc)
         s.ruc, s.razon_social, s.jurisdiccion, s.estado_contribuyente,
         s.clase_contribuyente, s.fecha_inicio_actividades, s.fecha_actualizacion,
         s.fecha_suspension_definitiva, s.fecha_reinicio_actividades,
         s.obligado_contabilidad, s.agente_retencion, s.contribuyente_especial,
         s.row_hash,
         (SELECT count(*) FROM ${tabla} e WHERE e.ruc = s.ruc)::smallint AS num_establecimientos
  FROM ${tabla} s
  WHERE ${filtroTipo}
  ORDER BY s.ruc, s.numero_establecimiento
`;
}

const COLUMNAS_CONTRIBUYENTE = `
  ruc, razon_social, jurisdiccion, estado_contribuyente, clase_contribuyente,
  fecha_inicio_actividades, fecha_actualizacion, fecha_suspension_definitiva,
  fecha_reinicio_actividades, obligado_contabilidad, agente_retencion,
  contribuyente_especial, row_hash, num_establecimientos`;

const ACTUALIZABLES = `
    razon_social = EXCLUDED.razon_social,
    jurisdiccion = EXCLUDED.jurisdiccion,
    estado_contribuyente = EXCLUDED.estado_contribuyente,
    clase_contribuyente = EXCLUDED.clase_contribuyente,
    fecha_inicio_actividades = EXCLUDED.fecha_inicio_actividades,
    fecha_actualizacion = EXCLUDED.fecha_actualizacion,
    fecha_suspension_definitiva = EXCLUDED.fecha_suspension_definitiva,
    fecha_reinicio_actividades = EXCLUDED.fecha_reinicio_actividades,
    obligado_contabilidad = EXCLUDED.obligado_contabilidad,
    agente_retencion = EXCLUDED.agente_retencion,
    contribuyente_especial = EXCLUDED.contribuyente_especial,
    num_establecimientos = EXCLUDED.num_establecimientos,
    row_hash = EXCLUDED.row_hash,
    ultimo_job_id = EXCLUDED.ultimo_job_id,
    ausente_desde_job = NULL,
    updated_at = now()`;

/** Personas naturales: todo lo que el archivo marca como tal. */
export function mergePersonasSql(tabla: string): string {
  return `
WITH src AS (${contribuyentesSql(tabla, `s.tipo_contribuyente = 'PERSONA NATURAL'`)}),
merged AS (
  INSERT INTO persona_natural (${COLUMNAS_CONTRIBUYENTE}, primer_job_id, ultimo_job_id)
  SELECT ${COLUMNAS_CONTRIBUYENTE.replace(/\s+/g, ' ').trim()}, $1, $1 FROM src
  ON CONFLICT (ruc) DO UPDATE SET ${ACTUALIZABLES}
  WHERE persona_natural.row_hash IS DISTINCT FROM EXCLUDED.row_hash
     OR persona_natural.ausente_desde_job IS NOT NULL
  RETURNING (xmax = 0) AS insertada
)
SELECT count(*) FILTER (WHERE insertada) AS insertadas,
       count(*) FILTER (WHERE NOT insertada) AS actualizadas
FROM merged`;
}

/**
 * Sociedades que NO están en el directorio de la Superintendencia.
 *
 * Fundaciones, cooperativas, entidades públicas, sociedades de hecho: ~40 % de
 * las sociedades del padrón. Tienen RUC, actividad y establecimientos, pero
 * nunca tendrán balances.
 *
 * El `NOT EXISTS` va contra `companias.ruc`, que es el único enlace que el SRI
 * permite. Los 8 RUC duplicados de `companias` se excluyen del enlace en la
 * consulta de arriba (`puenteRucSql`), así que aquí caerían del lado "no
 * supervisada"; el importador los registra como rechazo informativo.
 */
export function mergeSociedadesNoSupervisadasSql(tabla: string): string {
  return `
WITH src AS (
  ${contribuyentesSql(
    tabla,
    `s.tipo_contribuyente = 'SOCIEDAD'
      AND NOT EXISTS (SELECT 1 FROM companias c WHERE c.ruc = s.ruc)`,
  )}
),
merged AS (
  INSERT INTO sociedad_no_supervisada (${COLUMNAS_CONTRIBUYENTE}, primer_job_id, ultimo_job_id)
  SELECT ${COLUMNAS_CONTRIBUYENTE.replace(/\s+/g, ' ').trim()}, $1, $1 FROM src
  ON CONFLICT (ruc) DO UPDATE SET ${ACTUALIZABLES}
  WHERE sociedad_no_supervisada.row_hash IS DISTINCT FROM EXCLUDED.row_hash
     OR sociedad_no_supervisada.ausente_desde_job IS NOT NULL
  RETURNING (xmax = 0) AS insertada
)
SELECT count(*) FILTER (WHERE insertada) AS insertadas,
       count(*) FILTER (WHERE NOT insertada) AS actualizadas
FROM merged`;
}

/**
 * Enriquecimiento de `companias` con los datos del SRI.
 *
 * El puente RUC -> expediente se resuelve AQUÍ, una sola vez, y no en cada
 * consulta posterior. Los RUC que apuntan a más de un expediente se descartan
 * del enlace: elegir uno de los dos sería inventar, y son 8 en toda la base.
 *
 * Sólo se tocan las columnas `sri_*`: lo que trae el directorio de la
 * Superintendencia no se pisa nunca.
 */
export function enriquecerCompaniasSql(tabla: string): string {
  return `
WITH rucs_unicos AS (
  SELECT ruc FROM companias
  WHERE ruc IS NOT NULL
  GROUP BY ruc HAVING count(*) = 1
),
src AS (
  SELECT DISTINCT ON (s.ruc)
         s.ruc, s.estado_contribuyente, s.clase_contribuyente,
         s.fecha_inicio_actividades, s.obligado_contabilidad, s.agente_retencion,
         s.contribuyente_especial, s.nombre_comercial, s.parroquia,
         (SELECT count(*) FROM ${tabla} e WHERE e.ruc = s.ruc)::smallint AS num_establecimientos
  FROM ${tabla} s
  JOIN rucs_unicos u ON u.ruc = s.ruc
  WHERE s.tipo_contribuyente = 'SOCIEDAD'
  ORDER BY s.ruc, s.numero_establecimiento
)
UPDATE companias c
SET sri_estado_contribuyente     = src.estado_contribuyente,
    sri_clase_contribuyente      = src.clase_contribuyente,
    sri_fecha_inicio_actividades = src.fecha_inicio_actividades,
    sri_obligado_contabilidad    = src.obligado_contabilidad,
    sri_agente_retencion         = src.agente_retencion,
    sri_contribuyente_especial   = src.contribuyente_especial,
    sri_nombre_comercial         = src.nombre_comercial,
    sri_parroquia                = src.parroquia,
    sri_num_establecimientos     = src.num_establecimientos,
    sri_job_id                   = $1,
    updated_at                   = now()
FROM src
WHERE c.ruc = src.ruc`;
}

/**
 * Establecimientos, con el tipo de titular resuelto en la misma sentencia.
 *
 * `tipo_titular` existe porque un local puede colgar de una persona natural, de
 * una compañía de Supercias o de una sociedad no supervisada, y una clave
 * foránea sólo puede apuntar a una tabla.
 */
export function mergeEstablecimientosSql(tabla: string): string {
  return `
WITH src AS (
  SELECT DISTINCT ON (s.ruc, s.numero_establecimiento)
         s.ruc, s.numero_establecimiento AS numero,
         CASE
           WHEN s.tipo_contribuyente = 'PERSONA NATURAL' THEN 'persona_natural'
           WHEN EXISTS (SELECT 1 FROM companias c WHERE c.ruc = s.ruc) THEN 'compania'
           ELSE 'sociedad_no_supervisada'
         END AS tipo_titular,
         s.nombre_comercial, s.estado_establecimiento AS estado,
         s.provincia, s.canton, s.parroquia, s.codigo_ciiu, s.actividad,
         s.row_hash_estab
  FROM ${tabla} s
  ORDER BY s.ruc, s.numero_establecimiento
),
merged AS (
  INSERT INTO establecimiento (
    ruc, numero, tipo_titular, nombre_comercial, estado,
    provincia, canton, parroquia, codigo_ciiu, actividad, row_hash, ultimo_job_id
  )
  SELECT ruc, numero, tipo_titular, nombre_comercial, estado,
         provincia, canton, parroquia, codigo_ciiu, actividad, row_hash_estab, $1
  FROM src
  ON CONFLICT (ruc, numero) DO UPDATE SET
    tipo_titular = EXCLUDED.tipo_titular,
    nombre_comercial = EXCLUDED.nombre_comercial,
    estado = EXCLUDED.estado,
    provincia = EXCLUDED.provincia,
    canton = EXCLUDED.canton,
    parroquia = EXCLUDED.parroquia,
    codigo_ciiu = EXCLUDED.codigo_ciiu,
    actividad = EXCLUDED.actividad,
    row_hash = EXCLUDED.row_hash,
    ultimo_job_id = EXCLUDED.ultimo_job_id,
    ausente_desde_job = NULL,
    updated_at = now()
  WHERE establecimiento.row_hash IS DISTINCT FROM EXCLUDED.row_hash
     OR establecimiento.ausente_desde_job IS NOT NULL
  RETURNING (xmax = 0) AS insertado
)
SELECT count(*) FILTER (WHERE insertado) AS insertados,
       count(*) FILTER (WHERE NOT insertado) AS actualizados
FROM merged`;
}

/** RUC del archivo que apuntan a más de un expediente: no se enlazan. */
export function rucAmbiguosSql(tabla: string): string {
  return `
SELECT c.ruc, count(*)::int AS expedientes
FROM companias c
WHERE c.ruc IS NOT NULL
  AND EXISTS (SELECT 1 FROM ${tabla} s WHERE s.ruc = c.ruc)
GROUP BY c.ruc
HAVING count(*) > 1`;
}

/** Reparto del archivo, para los avisos del job. */
export function estadisticasSql(tabla: string): string {
  return `
SELECT
  count(*)::bigint AS filas,
  count(DISTINCT ruc)::bigint AS rucs,
  count(DISTINCT ruc) FILTER (WHERE tipo_contribuyente = 'PERSONA NATURAL')::bigint AS personas,
  count(DISTINCT ruc) FILTER (WHERE tipo_contribuyente = 'SOCIEDAD')::bigint AS sociedades,
  count(DISTINCT s.ruc) FILTER (
    WHERE s.tipo_contribuyente = 'SOCIEDAD'
      AND EXISTS (SELECT 1 FROM companias c WHERE c.ruc = s.ruc)
  )::bigint AS sociedades_supercias
FROM ${tabla} s`;
}
