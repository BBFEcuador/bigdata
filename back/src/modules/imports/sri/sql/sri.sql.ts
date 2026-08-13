import { COPY_COLUMNS_SRI, STAGING_TYPES_SRI } from '../sri.constants';

export const stagingSriTable = (jobId: string) =>
  `stg_sri_${jobId.replace(/-/g, '')}`;

export function createStagingSriSql(tabla: string): string {
  const cols = COPY_COLUMNS_SRI.map(
    (c) => `  ${c} ${STAGING_TYPES_SRI[c]}`,
  ).join(',\n');
  return `CREATE UNLOGGED TABLE ${tabla} (\n${cols}\n)`;
}

export const copyIntoSriSql = (tabla: string) =>
  `COPY ${tabla} (${COPY_COLUMNS_SRI.join(', ')}) FROM STDIN WITH (FORMAT text)`;

export const indicesStagingSql = (tabla: string) => [
  `CREATE INDEX ON ${tabla} (ruc)`,
  `CREATE INDEX ON ${tabla} (tipo_contribuyente)`,
];

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
   ORDER BY s.ruc, s.numero_establecimiento`;
}

const COLUMNAS_CONTRIBUYENTE = `
  tipo, ruc, nombre, jurisdiccion, estado_contribuyente, clase_contribuyente,
  fecha_inicio_actividades, fecha_actualizacion, fecha_suspension_definitiva,
  fecha_reinicio_actividades, obligado_contabilidad, agente_retencion,
  contribuyente_especial, row_hash, num_establecimientos`;

export function mergePersonasSql(tabla: string): string {
  return `
WITH src AS (${contribuyentesSql(tabla, `s.tipo_contribuyente = 'PERSONA NATURAL'`)}),
merged AS (
  INSERT INTO contribuyentes (${COLUMNAS_CONTRIBUYENTE}, primer_job_id, ultimo_job_id)
  SELECT CASE WHEN src.obligado_contabilidad IS TRUE
              THEN 'natural_contable' ELSE 'natural_no_contable' END,
         src.ruc, src.razon_social, src.jurisdiccion, src.estado_contribuyente,
         src.clase_contribuyente, src.fecha_inicio_actividades,
         src.fecha_actualizacion, src.fecha_suspension_definitiva,
         src.fecha_reinicio_actividades, src.obligado_contabilidad,
         src.agente_retencion, src.contribuyente_especial, src.row_hash,
         src.num_establecimientos, $1, $1
    FROM src
  ON CONFLICT (tipo, ruc) WHERE tipo <> 'companies' AND ruc IS NOT NULL DO UPDATE SET
    nombre = EXCLUDED.nombre, jurisdiccion = EXCLUDED.jurisdiccion,
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
    row_hash = EXCLUDED.row_hash, ultimo_job_id = EXCLUDED.ultimo_job_id,
    ausente_desde_job = NULL, updated_at = now()
   WHERE contribuyentes.row_hash IS DISTINCT FROM EXCLUDED.row_hash
      OR contribuyentes.ausente_desde_job IS NOT NULL
  RETURNING (xmax = 0) AS insertada
)
SELECT count(*) FILTER (WHERE insertada) AS insertadas,
       count(*) FILTER (WHERE NOT insertada) AS actualizadas
  FROM merged`;
}

export function mergeSociedadesNoSupervisadasSql(tabla: string): string {
  return `
WITH src AS (
  ${contribuyentesSql(
    tabla,
    `s.tipo_contribuyente = 'SOCIEDAD'
     AND NOT EXISTS (
       SELECT 1 FROM contribuyentes c
        WHERE c.tipo = 'companies' AND c.ruc = s.ruc
     )`,
  )}
),
merged AS (
  INSERT INTO contribuyentes (${COLUMNAS_CONTRIBUYENTE}, primer_job_id, ultimo_job_id)
  SELECT 'sociedad_no_supervisada', src.ruc, src.razon_social, src.jurisdiccion,
         src.estado_contribuyente, src.clase_contribuyente,
         src.fecha_inicio_actividades, src.fecha_actualizacion,
         src.fecha_suspension_definitiva, src.fecha_reinicio_actividades,
         src.obligado_contabilidad, src.agente_retencion,
         src.contribuyente_especial, src.row_hash, src.num_establecimientos,
         $1, $1
    FROM src
  ON CONFLICT (tipo, ruc) WHERE tipo <> 'companies' AND ruc IS NOT NULL DO UPDATE SET
    nombre = EXCLUDED.nombre, jurisdiccion = EXCLUDED.jurisdiccion,
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
    row_hash = EXCLUDED.row_hash, ultimo_job_id = EXCLUDED.ultimo_job_id,
    ausente_desde_job = NULL, updated_at = now()
   WHERE contribuyentes.row_hash IS DISTINCT FROM EXCLUDED.row_hash
      OR contribuyentes.ausente_desde_job IS NOT NULL
  RETURNING (xmax = 0) AS insertada
)
SELECT count(*) FILTER (WHERE insertada) AS insertadas,
       count(*) FILTER (WHERE NOT insertada) AS actualizadas
  FROM merged`;
}

/** Copia el enriquecimiento tributario al registro de compañía unificado. */
export function enriquecerCompaniasSql(tabla: string): string {
  return `
WITH rucs_unicos AS (
  SELECT ruc FROM contribuyentes
   WHERE tipo = 'companies' AND ruc IS NOT NULL
   GROUP BY ruc HAVING count(*) = 1
), src AS (
  SELECT DISTINCT ON (s.ruc)
         s.ruc, s.estado_contribuyente, s.clase_contribuyente,
         s.fecha_inicio_actividades, s.obligado_contabilidad,
         s.agente_retencion, s.contribuyente_especial, s.nombre_comercial,
         s.parroquia,
         (SELECT count(*) FROM ${tabla} e WHERE e.ruc = s.ruc)::smallint AS num_establecimientos
    FROM ${tabla} s
    JOIN rucs_unicos u ON u.ruc = s.ruc
   WHERE s.tipo_contribuyente = 'SOCIEDAD'
   ORDER BY s.ruc, s.numero_establecimiento
)
UPDATE contribuyentes c
   SET sri_estado_contribuyente = src.estado_contribuyente,
       sri_clase_contribuyente = src.clase_contribuyente,
       sri_fecha_inicio_actividades = src.fecha_inicio_actividades,
       sri_obligado_contabilidad = src.obligado_contabilidad,
       sri_agente_retencion = src.agente_retencion,
       sri_contribuyente_especial = src.contribuyente_especial,
       sri_nombre_comercial = src.nombre_comercial,
       sri_parroquia = src.parroquia,
       sri_num_establecimientos = src.num_establecimientos,
       estado_contribuyente = src.estado_contribuyente,
       clase_contribuyente = src.clase_contribuyente,
       obligado_contabilidad = src.obligado_contabilidad,
       agente_retencion = src.agente_retencion,
       contribuyente_especial = src.contribuyente_especial,
       num_establecimientos = src.num_establecimientos,
       sri_job_id = $1, updated_at = now()
  FROM src
 WHERE c.tipo = 'companies' AND c.ruc = src.ruc`;
}

export function mergeEstablecimientosSql(tabla: string): string {
  return `
WITH src AS (
  SELECT DISTINCT ON (s.ruc, s.numero_establecimiento)
         s.ruc, s.numero_establecimiento AS numero,
         CASE
           WHEN s.tipo_contribuyente = 'PERSONA NATURAL' THEN 'persona_natural'
           WHEN EXISTS (SELECT 1 FROM contribuyentes c
                         WHERE c.tipo = 'companies' AND c.ruc = s.ruc)
             THEN 'compania'
           ELSE 'sociedad_no_supervisada'
         END AS tipo_titular,
         (SELECT c.id FROM contribuyentes c
           WHERE c.ruc = s.ruc
             AND ((s.tipo_contribuyente = 'PERSONA NATURAL'
                    AND c.tipo IN ('natural_contable', 'natural_no_contable'))
               OR (s.tipo_contribuyente = 'SOCIEDAD' AND c.tipo = 'companies'
                   AND NOT EXISTS (SELECT 1 FROM contribuyentes c2
                                    WHERE c2.tipo = 'companies' AND c2.ruc = s.ruc
                                      AND c2.id <> c.id))
               OR (s.tipo_contribuyente = 'SOCIEDAD'
                   AND c.tipo = 'sociedad_no_supervisada'))
           LIMIT 1) AS titular_id,
         s.nombre_comercial, s.estado_establecimiento AS estado,
         s.provincia, s.canton, s.parroquia, s.codigo_ciiu, s.actividad,
         s.row_hash_estab
    FROM ${tabla} s
   ORDER BY s.ruc, s.numero_establecimiento
), merged AS (
  INSERT INTO establecimiento (
    ruc, numero, tipo_titular, nombre_comercial, estado,
    provincia, canton, parroquia, codigo_ciiu, actividad, row_hash,
    ultimo_job_id, titular_id
  )
  SELECT ruc, numero, tipo_titular, nombre_comercial, estado,
         provincia, canton, parroquia, codigo_ciiu, actividad,
         row_hash_estab, $1, titular_id
    FROM src
  ON CONFLICT (ruc, numero) DO UPDATE SET
    tipo_titular = EXCLUDED.tipo_titular,
    titular_id = EXCLUDED.titular_id,
    nombre_comercial = EXCLUDED.nombre_comercial, estado = EXCLUDED.estado,
    provincia = EXCLUDED.provincia, canton = EXCLUDED.canton,
    parroquia = EXCLUDED.parroquia, codigo_ciiu = EXCLUDED.codigo_ciiu,
    actividad = EXCLUDED.actividad, row_hash = EXCLUDED.row_hash,
    ultimo_job_id = EXCLUDED.ultimo_job_id, ausente_desde_job = NULL,
    updated_at = now()
   WHERE establecimiento.row_hash IS DISTINCT FROM EXCLUDED.row_hash
      OR establecimiento.ausente_desde_job IS NOT NULL
  RETURNING (xmax = 0) AS insertado
)
SELECT count(*) FILTER (WHERE insertado) AS insertados,
       count(*) FILTER (WHERE NOT insertado) AS actualizados
  FROM merged`;
}

export function rucAmbiguosSql(tabla: string): string {
  return `
SELECT c.ruc, count(*)::int AS expedientes
  FROM contribuyentes c
 WHERE c.tipo = 'companies' AND c.ruc IS NOT NULL
   AND EXISTS (SELECT 1 FROM ${tabla} s WHERE s.ruc = c.ruc)
 GROUP BY c.ruc HAVING count(*) > 1`;
}

export function estadisticasSql(tabla: string): string {
  return `
SELECT count(*)::bigint AS filas,
       count(DISTINCT ruc)::bigint AS rucs,
       count(DISTINCT ruc) FILTER (WHERE tipo_contribuyente = 'PERSONA NATURAL')::bigint AS personas,
       count(DISTINCT ruc) FILTER (WHERE tipo_contribuyente = 'SOCIEDAD')::bigint AS sociedades,
       count(DISTINCT s.ruc) FILTER (
         WHERE s.tipo_contribuyente = 'SOCIEDAD'
           AND EXISTS (SELECT 1 FROM contribuyentes c
                        WHERE c.tipo = 'companies' AND c.ruc = s.ruc)
       )::bigint AS sociedades_supercias
  FROM ${tabla} s`;
}
