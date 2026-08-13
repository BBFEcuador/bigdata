import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** Una cuenta del plan contable de la Superintendencia. */
@Entity('categoria_cuenta')
export class CategoriaCuenta {
  /** El formulario forma parte de la clave porque los códigos se repiten entre planes. */
  @PrimaryColumn({ type: 'smallint' })
  formulario: number;

  @PrimaryColumn({ type: 'text' })
  codigo: string;

  @Column({ type: 'text' })
  nombre: string;

  @Index()
  @Column({ type: 'text', name: 'codigo_padre', nullable: true })
  codigoPadre: string | null;

  @Column({ type: 'smallint' })
  nivel: number;

  @Column({ type: 'boolean', name: 'es_hoja' })
  esHoja: boolean;

  @Column({ type: 'smallint' })
  longitud: number;

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
