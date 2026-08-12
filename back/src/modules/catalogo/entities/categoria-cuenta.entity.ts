import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** Una cuenta del plan contable de la Superintendencia. */
@Entity('categoria_cuenta')
export class CategoriaCuenta {
  /**
   * A qué formulario pertenece este plan de cuentas. Forma parte de la clave
   * porque los códigos se repiten entre planes con significados distintos: el
   * `3` es PATRIMONIO NETO en el formulario 1 y ACTIVO CON PARTES RELACIONADAS
   * LOCALES en el 3.
   */
  @PrimaryColumn({ type: 'smallint' })
  formulario: number;

  @PrimaryColumn({ type: 'text' })
  codigo: string;

  @Column({ type: 'text' })
  nombre: string;

  /** Prefijo más largo presente en el catálogo; null en las 26 raíces. */
  @Index()
  @Column({ type: 'text', name: 'codigo_padre', nullable: true })
  codigoPadre: string | null;

  /** Profundidad en el bosque; las raíces son 1. */
  @Column({ type: 'smallint' })
  nivel: number;

  /** Una cuenta sin hijos: normalmente la que admite movimientos. */
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

  /** Job en el que se detectó que la cuenta ya no venía en el archivo. */
  @Column({ type: 'uuid', name: 'ausente_desde_job', nullable: true })
  ausenteDesdeJob: string | null;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
