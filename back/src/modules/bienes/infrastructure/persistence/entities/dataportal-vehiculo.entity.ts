import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('dataportal_vehiculo')
export class DataportalVehiculo {
  @PrimaryColumn('uuid', { name: 'contribuyente_id' })
  contribuyenteId: string;

  @PrimaryColumn('text') placa: string;
  @Column('text') ruc: string;
  @Column('text', { nullable: true }) tipo: string | null;
  @Column('text', { nullable: true }) modelo: string | null;
  @Column('text', { nullable: true }) marca: string | null;
  @Column('smallint', { nullable: true }) anio: number | null;
  @Column('text', { nullable: true }) lugar: string | null;
  @Column('timestamp without time zone', {
    name: 'fecha_vencimiento',
    nullable: true,
  })
  fechaVencimiento: Date | null;
}
