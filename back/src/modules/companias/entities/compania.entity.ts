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
