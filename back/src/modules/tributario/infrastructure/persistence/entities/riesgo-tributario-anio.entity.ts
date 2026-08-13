import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Ancla TypeORM de sólo lectura de la vista materializada de riesgo. Las
 * escrituras y el refresco pertenecen al proceso de coeficientes, no a este
 * módulo de consulta.
 */
@Entity('riesgo_tributario_anio')
export class RiesgoTributarioAnio {
  @PrimaryColumn({ type: 'smallint' })
  anio: number;

  @PrimaryColumn({ type: 'text' })
  expediente: string;

  @Column({ type: 'text', nullable: true })
  ruc: string | null;

  @Column({ type: 'text', name: 'grupo_ciiu', nullable: true })
  grupoCiiu: string | null;

  @Column({ type: 'text' })
  poblacion: string;

  @Column({ type: 'text', name: 'nivel_pares' })
  nivelPares: string;

  @Column({ type: 'text', name: 'clave_pares' })
  clavePares: string;

  @Column({ type: 'numeric', nullable: true })
  ingresos: string | null;

  @Column({ type: 'numeric', name: 'costos_gastos', nullable: true })
  costosGastos: string | null;

  @Column({ type: 'numeric', nullable: true })
  activo: string | null;

  @Column({ type: 'numeric', nullable: true })
  declarada: string | null;

  @Column({ type: 'numeric', name: 'base_presunta', nullable: true })
  basePresunta: string | null;

  @Column({ type: 'text', name: 'base_manda', nullable: true })
  baseManda: string | null;

  @Column({ type: 'numeric', nullable: true })
  brecha: string | null;

  @Column({ type: 'numeric', nullable: true })
  intensidad: string | null;

  @Column({ type: 'bigint', name: 'n_pares', nullable: true })
  nPares: string | null;

  @Column({ type: 'numeric', nullable: true })
  percentil: string | null;
}
