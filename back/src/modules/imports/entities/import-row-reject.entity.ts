import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Una fila (o celda) del Excel que no se pudo interpretar, con su número de fila. */
@Entity('import_row_reject')
export class ImportRowReject {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'uuid', name: 'job_id' })
  jobId: string;

  @Column({
    type: 'bigint',
    name: 'source_row_number',
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  sourceRowNumber: number;

  @Column({ type: 'text', nullable: true })
  columna: string | null;

  @Column({ type: 'text' })
  motivo: string;

  @Column({ type: 'jsonb' })
  raw: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
