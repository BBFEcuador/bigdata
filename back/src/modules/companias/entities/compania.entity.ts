import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Entidad de consulta. El importador NO pasa por aquí: escribe con el cliente
 * `pg` directo vía COPY. Esta entidad existe para el listado, el detalle y como
 * documentación del esquema.
 */
@Entity('companias')
export class Compania {
  @PrimaryColumn({ type: 'text' })
  expediente: string;

  @Column({ type: 'text', nullable: true })
  ruc: string | null;

  @Column({ type: 'text' })
  nombre: string;

  @Column({ type: 'text', name: 'situacion_legal', nullable: true })
  situacionLegal: string | null;

  @Column({ type: 'date', name: 'fecha_constitucion', nullable: true })
  fechaConstitucion: string | null;

  @Column({ type: 'text', nullable: true })
  tipo: string | null;

  @Column({ type: 'text', nullable: true })
  pais: string | null;

  @Column({ type: 'text', nullable: true })
  region: string | null;

  @Column({ type: 'text', nullable: true })
  provincia: string | null;

  @Column({ type: 'text', nullable: true })
  canton: string | null;

  @Column({ type: 'text', nullable: true })
  ciudad: string | null;

  @Column({ type: 'text', nullable: true })
  calle: string | null;

  @Column({ type: 'text', nullable: true })
  numero: string | null;

  @Column({ type: 'text', nullable: true })
  interseccion: string | null;

  @Column({ type: 'text', nullable: true })
  barrio: string | null;

  @Column({ type: 'text', nullable: true })
  telefono: string | null;

  @Column({ type: 'text', nullable: true })
  representante: string | null;

  @Column({ type: 'text', nullable: true })
  cargo: string | null;

  /**
   * `pg` devuelve `numeric` como string para no perder precisión. Sin este
   * transformer el importe llega al frontend como "1234567.89" y cualquier
   * `.toFixed()` revienta.
   */
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    name: 'capital_suscrito',
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v === null ? null : Number(v)),
    },
  })
  capitalSuscrito: number | null;

  @Column({ type: 'text', name: 'ciiu_nivel_1', nullable: true })
  ciiuNivel1: string | null;

  @Column({ type: 'text', name: 'ciiu_nivel_6', nullable: true })
  ciiuNivel6: string | null;

  @Column({ type: 'smallint', name: 'ultimo_balance', nullable: true })
  ultimoBalance: number | null;

  @Column({ type: 'boolean', name: 'presento_balance_inicial', nullable: true })
  presentoBalanceInicial: boolean | null;

  @Column({ type: 'date', name: 'fecha_presentacion_balance_inicial', nullable: true })
  fechaPresentacionBalanceInicial: string | null;

  // ------------------------------------------------------ padrón del SRI
  //
  // Columnas añadidas por el importador del SRI, nunca por el directorio. Un
  // NULL aquí significa "esta compañía no se cruzó con el padrón" —RUC vacío,
  // ausente del padrón, o duplicado y por tanto no enlazado—, no "el SRI dice
  // que no". `sriJobId` permite distinguir ambos casos.

  @Column({ type: 'text', name: 'sri_estado_contribuyente', nullable: true })
  sriEstadoContribuyente: string | null;

  @Column({ type: 'text', name: 'sri_clase_contribuyente', nullable: true })
  sriClaseContribuyente: string | null;

  @Column({ type: 'date', name: 'sri_fecha_inicio_actividades', nullable: true })
  sriFechaInicioActividades: string | null;

  @Column({ type: 'boolean', name: 'sri_obligado_contabilidad', nullable: true })
  sriObligadoContabilidad: boolean | null;

  @Column({ type: 'boolean', name: 'sri_agente_retencion', nullable: true })
  sriAgenteRetencion: boolean | null;

  @Column({ type: 'boolean', name: 'sri_contribuyente_especial', nullable: true })
  sriContribuyenteEspecial: boolean | null;

  @Column({ type: 'text', name: 'sri_nombre_comercial', nullable: true })
  sriNombreComercial: string | null;

  @Column({ type: 'text', name: 'sri_parroquia', nullable: true })
  sriParroquia: string | null;

  @Column({ type: 'smallint', name: 'sri_num_establecimientos', nullable: true })
  sriNumEstablecimientos: number | null;

  @Column({ type: 'uuid', name: 'sri_job_id', nullable: true })
  sriJobId: string | null;

  // ------------------------------------------------ catastros públicos
  //
  // Resumen de los catastros del Ministerio de Turismo y del SRI, materializado
  // por sus importadores. El detalle vive en `turismo_establecimiento` y
  // `catastro_sri`; aquí sólo está lo que hace falta para filtrar un listado.
  //
  // Los años van en un array a propósito: "exportó hasta 2022 y dejó de
  // hacerlo" es una señal distinta de "no exportó nunca", y un booleano las
  // confundiría.

  @Column({ type: 'smallint', name: 'turismo_registros', nullable: true })
  turismoRegistros: number | null;

  @Column({ type: 'text', name: 'turismo_actividades', array: true, nullable: true })
  turismoActividades: string[] | null;

  @Column({ type: 'text', name: 'turismo_clasificaciones', array: true, nullable: true })
  turismoClasificaciones: string[] | null;

  /** ¿Alguno de sus registros turísticos está RATIFICADO (y no sólo pendiente)? */
  @Column({ type: 'boolean', name: 'turismo_ratificado', nullable: true })
  turismoRatificado: boolean | null;

  @Column({ type: 'smallint', name: 'exportador_bienes_iva_anios', array: true, nullable: true })
  exportadorBienesIvaAnios: number[] | null;

  @Column({ type: 'smallint', name: 'exportador_servicios_iva_anios', array: true, nullable: true })
  exportadorServiciosIvaAnios: number[] | null;

  @Column({ type: 'smallint', name: 'exportador_bienes_ir_anios', array: true, nullable: true })
  exportadorBienesIrAnios: number[] | null;

  @Column({ type: 'uuid', name: 'row_hash' })
  rowHash: string;

  @Column({ type: 'uuid', name: 'primer_job_id', nullable: true })
  primerJobId: string | null;

  @Column({ type: 'uuid', name: 'ultimo_job_id', nullable: true })
  ultimoJobId: string | null;

  /** Job en el que se detectó que la compañía ya no venía en el archivo. */
  @Column({ type: 'uuid', name: 'ausente_desde_job', nullable: true })
  ausenteDesdeJob: string | null;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
