import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** Una actividad económica del catálogo CIIU. */
@Entity('actividad_ciiu')
export class ActividadCiiu {
  @PrimaryColumn({ type: 'text' })
  codigo: string;

  @Column({ type: 'text' })
  nombre: string;

  /**
   * El mismo código en la forma que usa el archivo de compañías (`H4923.01`).
   * Sólo lo tienen las actividades de último nivel; es la clave del enlace con
   * `companias.ciiu_nivel_6`.
   */
  @Column({ type: 'text', name: 'codigo_supercias', nullable: true })
  codigoSupercias: string | null;

  @Index()
  @Column({ type: 'text', name: 'codigo_padre', nullable: true })
  codigoPadre: string | null;

  @Column({ type: 'smallint' })
  nivel: number;

  /** Sección, División, Grupo, Clase, Subclase o Actividad Económica. */
  @Column({ type: 'text', name: 'nivel_nombre' })
  nivelNombre: string;

  @Column({ type: 'boolean', name: 'es_hoja' })
  esHoja: boolean;

  @Column({ type: 'smallint' })
  longitud: number;

  /** A qué segmentos aplica la actividad, según el archivo. */
  @Column({ type: 'text', nullable: true })
  aplicacion: string | null;

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
