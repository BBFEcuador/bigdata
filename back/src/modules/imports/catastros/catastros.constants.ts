export const IMPORT_KIND_CATASTROS = 'catastros_sri';

/**
 * Los cuatro catastros que publica el SRI y que este importador reconoce.
 *
 * El tipo NO se pide como parámetro: se deduce del título que llevan las hojas
 * dentro del archivo. El sufijo del nombre de fichero no sirve —los tres de
 * exportadores se llaman parecido y el usuario los descarga con el nombre que
 * le dé la web— y equivocarse de tipo mezclaría en la misma serie histórica dos
 * beneficios tributarios distintos.
 */
export const CATASTRO_EXPORTADOR_BIENES_IR = 'exportador_bienes_ir';
export const CATASTRO_EXPORTADOR_BIENES_IVA = 'exportador_bienes_iva';
export const CATASTRO_EXPORTADOR_SERVICIOS_IVA = 'exportador_servicios_iva';
export const CATASTRO_SERVICIOS_DIGITALES = 'servicios_digitales';

export const TIPOS_CATASTRO = [
  CATASTRO_EXPORTADOR_BIENES_IR,
  CATASTRO_EXPORTADOR_BIENES_IVA,
  CATASTRO_EXPORTADOR_SERVICIOS_IVA,
  CATASTRO_SERVICIOS_DIGITALES,
] as const;

export type TipoCatastro = (typeof TIPOS_CATASTRO)[number];

export const ETIQUETA_CATASTRO: Record<TipoCatastro, string> = {
  [CATASTRO_EXPORTADOR_BIENES_IR]:
    'Exportadores habituales de bienes — rebaja de 3 puntos de Impuesto a la Renta',
  [CATASTRO_EXPORTADOR_BIENES_IVA]:
    'Exportadores habituales de bienes — retenciones de IVA',
  [CATASTRO_EXPORTADOR_SERVICIOS_IVA]:
    'Exportadores habituales de servicios — retenciones de IVA',
  [CATASTRO_SERVICIOS_DIGITALES]: 'Prestadores de servicios digitales no residentes',
};

/** Columna de `catastro_sri` donde se materializa cada catastro en los titulares. */
export const COLUMNA_ANIOS: Record<string, string> = {
  [CATASTRO_EXPORTADOR_BIENES_IR]: 'exportador_bienes_ir_anios',
  [CATASTRO_EXPORTADOR_BIENES_IVA]: 'exportador_bienes_iva_anios',
  [CATASTRO_EXPORTADOR_SERVICIOS_IVA]: 'exportador_servicios_iva_anios',
};

/** Campos de los tres catastros de exportadores. Ver `buscarCabecera`. */
export const CAMPOS_EXPORTADOR = {
  ruc: ['RUC', 'NUMERO_IDENTIFICACION', 'NUMERO_DE_IDENTIFICACION', 'IDENTIFICACION'],
  razonSocial: ['RAZON_SOCIAL', 'RAZON_SOCIAL_O_NOMBRES'],
  jurisdiccion: ['JURISDICCION', 'DESCRIPCION_ZONAL', 'ZONAL'],
  provincia: ['PROVINCIA', 'DESCRIPCION_PROVINCIA_EO', 'DESCRIPCION_PROVINCIA'],
  tipoContribuyente: ['TIPO_CONTRIBUYENTE', 'TIPO_DE_CONTRIBUYENTE'],
  claseContribuyente: ['CLASE_DE_CONTRIBUYENTE', 'CLASE_CONTRIBUYENTE'],
  obligadoContabilidad: [
    'OBLIGADO_A_LLEVAR_CONTABILIDAD',
    'MAR_OBLIGADO_CONTABILIDAD',
    'OBLIGADO_CONTABILIDAD',
  ],
  anioFiscalAnalizado: ['ANO_FISCAL_ANALIZADO'],
  anioAplicacion: ['ANO_DE_APLICACION_FISCAL', 'ANO_APLICACION_FISCAL'],
} as const;

export type CampoExportador = keyof typeof CAMPOS_EXPORTADOR;

/** Lo único imprescindible: sin RUC la fila no enlaza con nada. */
export const CAMPOS_EXPORTADOR_REQUERIDOS: CampoExportador[] = ['ruc'];

/** Campos del catastro de prestadores de servicios digitales. */
export const CAMPOS_DIGITAL = {
  proveedor: ['PROVEEDOR'],
  descripcion: ['DESCRIPCION'],
  referencia: ['REFERENCIA'],
  marcaServiciosComision: ['MARCA_SERVICIOS_COMISION'],
  domiciliadoOEp: ['DOMICILIADO_O_EP', 'DOMICILIADO_O_EP_EN_ECUADOR'],
  registradoSri: ['REGISTRADO_SRI', 'REGISTRADO_EN_EL_SRI'],
  fechaRegistro: ['FECHA_DE_REGISTRO', 'FECHA_REGISTRO'],
  fechaFinRegistro: ['FECHA_FIN_DE_REGISTRO', 'FECHA_FIN_REGISTRO'],
} as const;

export type CampoDigital = keyof typeof CAMPOS_DIGITAL;

export const CAMPOS_DIGITAL_REQUERIDOS: CampoDigital[] = ['proveedor', 'descripcion'];
