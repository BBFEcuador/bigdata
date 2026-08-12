/**
 * Fuente única del orden de columnas del import del SRI.
 *
 * Igual que en los otros importadores: el DDL del staging, la lista del `COPY`
 * y el orden en que el servicio serializa cada fila salen todos de aquí. Un
 * desajuste mete los datos corridos de columna sin ningún error, y hay un test
 * que fija la correspondencia.
 */

export const COPY_COLUMNS_SRI = [
  'ruc',
  'razon_social',
  'jurisdiccion',
  'estado_contribuyente',
  'clase_contribuyente',
  'fecha_inicio_actividades',
  'fecha_actualizacion',
  'fecha_suspension_definitiva',
  'fecha_reinicio_actividades',
  'obligado_contabilidad',
  'tipo_contribuyente',
  'numero_establecimiento',
  'nombre_comercial',
  'estado_establecimiento',
  'provincia',
  'canton',
  'parroquia',
  'codigo_ciiu',
  'actividad',
  'agente_retencion',
  'contribuyente_especial',
  /** Hash de los datos del contribuyente (se repite en todas sus filas). */
  'row_hash',
  /** Hash de los datos del establecimiento. */
  'row_hash_estab',
] as const;

export const STAGING_TYPES_SRI: Record<string, string> = {
  ruc: 'text NOT NULL',
  razon_social: 'text',
  jurisdiccion: 'text',
  estado_contribuyente: 'text',
  clase_contribuyente: 'text',
  fecha_inicio_actividades: 'date',
  fecha_actualizacion: 'date',
  fecha_suspension_definitiva: 'date',
  fecha_reinicio_actividades: 'date',
  obligado_contabilidad: 'boolean',
  tipo_contribuyente: 'text NOT NULL',
  numero_establecimiento: 'text NOT NULL',
  nombre_comercial: 'text',
  estado_establecimiento: 'text',
  provincia: 'text',
  canton: 'text',
  parroquia: 'text',
  codigo_ciiu: 'text',
  actividad: 'text',
  agente_retencion: 'boolean',
  contribuyente_especial: 'boolean',
  row_hash: 'uuid NOT NULL',
  row_hash_estab: 'uuid NOT NULL',
};

export const IMPORT_KIND_SRI = 'sri_padron';
