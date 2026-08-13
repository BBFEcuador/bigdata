import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ImportJobStatus =
  'pending' | 'parsing' | 'merging' | 'indexing' | 'completed' | 'failed';

export const ESTADOS_NO_TERMINALES: ImportJobStatus[] = [
  'pending',
  'parsing',
  'merging',
  'indexing',
];

@Entity('import_job')
export class ImportJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  kind: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'parsing', 'merging', 'indexing', 'completed', 'failed'],
    enumName: 'import_job_status',
  })
  status: ImportJobStatus;

  /** `snapshot_completo` marca ausentes; `parcial` no toca nada fuera del archivo. */
  @Column({ type: 'text' })
  modo: string;

  /** Provincia declarada por los imports provinciales del padrón del SRI. */
  @Column({ type: 'text', nullable: true })
  provincia: string | null;

  @Column({ type: 'text', name: 'original_filename' })
  originalFilename: string;

  @Column({ type: 'text', name: 'stored_path' })
  storedPath: string;

  @Column({
    type: 'bigint',
    name: 'file_size_bytes',
    transformer: bigintNumber(),
  })
  fileSizeBytes: number;

  @Column({
    type: 'bigint',
    name: 'bytes_processed',
    transformer: bigintNumber(),
  })
  bytesProcessed: number;

  @Column({ type: 'bigint', name: 'rows_read', transformer: bigintNumber() })
  rowsRead: number;

  @Column({ type: 'bigint', name: 'rows_copied', transformer: bigintNumber() })
  rowsCopied: number;

  @Column({
    type: 'bigint',
    name: 'rows_rejected',
    transformer: bigintNumber(),
  })
  rowsRejected: number;

  @Column({ type: 'bigint', name: 'rows_warned', transformer: bigintNumber() })
  rowsWarned: number;

  @Column({
    type: 'bigint',
    name: 'rows_inserted',
    transformer: bigintNumber(),
  })
  rowsInserted: number;

  @Column({ type: 'bigint', name: 'rows_updated', transformer: bigintNumber() })
  rowsUpdated: number;

  @Column({
    type: 'bigint',
    name: 'rows_unchanged',
    transformer: bigintNumber(),
  })
  rowsUnchanged: number;

  @Column({ type: 'bigint', name: 'rows_missing', transformer: bigintNumber() })
  rowsMissing: number;

  @Column({ type: 'bigint', transformer: bigintNumber() })
  duplicados: number;

  @Column({ type: 'smallint', name: 'progress_pct' })
  progressPct: number;

  @Column({ type: 'text', name: 'staging_table', nullable: true })
  stagingTable: string | null;

  @Column({ type: 'text', name: 'error_message', nullable: true })
  errorMessage: string | null;

  /** Problemas no fatales: el import terminó, pero algo quedó a medias. */
  @Column({ type: 'text', nullable: true })
  avisos: string | null;

  @Column({ type: 'timestamptz', name: 'started_at', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'finished_at', nullable: true })
  finishedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

/** `pg` devuelve bigint como string; el frontend espera números. */
function bigintNumber() {
  return {
    to: (v: number) => v,
    from: (v: string | null) => (v === null ? 0 : Number(v)),
  };
}
