export const IMPORT_KIND_TURISMO = 'catastro_turismo';

/**
 * Columnas del Catastro Nacional de Turismo, con sus alias canónicos
 * (ver `headerKey`). El archivo del Ministerio de Turismo trae 20 columnas y
 * cambia los rótulos entre publicaciones, así que la cabecera se resuelve por
 * nombre y nunca por posición.
 */
export const CAMPOS_TURISMO = {
  ruc: ['RUC', 'RUC_ESTABLECIMIENTO'],
  codigoEstablecimiento: [
    'CODIGO_DE_ESTABLECIMIENTO_RUC',
    'CODIGO_ESTABLECIMIENTO_RUC',
    'CODIGO_DE_ESTABLECIMIENTO',
    'CODIGO_ESTABLECIMIENTO',
  ],
  nombreComercial: ['NOMBRE_COMERCIAL', 'NOMBRE_DEL_ESTABLECIMIENTO'],
  numeroRegistro: ['NUMERO_DE_REGISTRO', 'NUMERO_REGISTRO', 'NO_DE_REGISTRO'],
  fechaRegistro: ['FECHA_DE_REGISTRO', 'FECHA_REGISTRO'],
  actividad: ['ACTIVIDAD_MODALIDAD', 'ACTIVIDAD', 'MODALIDAD'],
  clasificacion: ['CLASIFICACION'],
  categoria: ['CATEGORIA'],
  razonSocialPropietario: ['RAZON_SOCIAL_PROPIETARIO', 'RAZON_SOCIAL', 'PROPIETARIO'],
  representanteLegal: ['REPRESENTANTE_LEGAL', 'REPRESENTANTE'],
  provincia: ['PROVINCIA'],
  canton: ['CANTON'],
  parroquia: ['PARROQUIA'],
  tipoParroquia: ['TIPO_DE_PARROQUIA', 'TIPO_PARROQUIA'],
  direccion: ['DIRECCION'],
  referenciaDireccion: ['REFERENCIA_DE_DIRECCION', 'REFERENCIA_DIRECCION', 'REFERENCIA'],
  telefono: ['TELEFONO_PRINCIPAL', 'TELEFONO', 'TELEFONOS'],
  correo: ['CORREO_ELECTRONICO', 'CORREO', 'EMAIL', 'E_MAIL'],
  sitioWeb: ['DIRECCION_WEB', 'SITIO_WEB', 'PAGINA_WEB', 'WEB'],
  estadoRegistro: [
    'ESTADO_REGISTRO_DEL_ESTABLECIMIENTO',
    'ESTADO_DEL_REGISTRO',
    'ESTADO_REGISTRO',
    'ESTADO',
  ],
} as const;

export type CampoTurismo = keyof typeof CAMPOS_TURISMO;

/** Sin estas tres columnas la fila no identifica nada y el archivo es otro. */
export const CAMPOS_TURISMO_REQUERIDOS: CampoTurismo[] = ['ruc', 'numeroRegistro', 'actividad'];
