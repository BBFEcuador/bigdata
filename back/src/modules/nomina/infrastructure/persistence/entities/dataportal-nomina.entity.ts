import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('dataportal_nomina')
export class DataportalNomina {
  @PrimaryColumn('uuid', { name: 'contribuyente_id' })
  contribuyenteId: string;

  @PrimaryColumn('text')
  cedula: string;

  @Column('text')
  ruc: string;

  @Column('text', { nullable: true })
  nombre: string | null;

  @Column('date', { name: 'fecha_ingreso', nullable: true })
  fechaIngreso: string | null;

  @Column('text', { name: 'ocupacion', nullable: true })
  rol: string | null;

  @Column('numeric', {
    name: 'sueldo',
    nullable: true,
    precision: 12,
    scale: 2,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v === null ? null : Number(v)),
    },
  })
  posibleSalario: number | null;
}
