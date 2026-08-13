import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Cabecera de un balance presentado: una fila por compañía, ejercicio y
 * formulario.
 *
 * El importador NO pasa por aquí (escribe con el cliente `pg` vía COPY); esta
 * entidad existe para la consulta y como documentación del esquema.
 */
@Entity('balance')
export class Balance {
  @PrimaryColumn({ type: 'smallint' })
  anio: number;

  /**
   * Tipo de formulario, y por tanto qué plan de cuentas aplica. Forma parte de
   * la clave porque los códigos colisionan entre formularios con significados
   * distintos: el `3` es PATRIMONIO NETO en el 1 y ACTIVO CON PARTES
   * RELACIONADAS LOCALES en el 3.
   */
  @PrimaryColumn({ type: 'smallint' })
  formulario: number;

  @PrimaryColumn({ type: 'text' })
  expediente: string;

  @Column({ type: 'text', nullable: true })
  ruc: string | null;

  @Column({ type: 'text', nullable: true })
  nombre: string | null;

  /** Sección CIIU declarada ESE año; puede no coincidir con la actual. */
  @Column({ type: 'text', name: 'rama_actividad', nullable: true })
  ramaActividad: string | null;

  @Column({ type: 'text', name: 'descripcion_rama', nullable: true })
  descripcionRama: string | null;

  @Column({ type: 'text', nullable: true })
  ciiu: string | null;

  @Column({ type: 'uuid', name: 'row_hash' })
  rowHash: string;

  @Column({ type: 'uuid', name: 'primer_job_id', nullable: true })
  primerJobId: string | null;

  @Column({ type: 'uuid', name: 'ultimo_job_id', nullable: true })
  ultimoJobId: string | null;

  @Column({ type: 'uuid', name: 'ausente_desde_job', nullable: true })
  ausenteDesdeJob: string | null;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
