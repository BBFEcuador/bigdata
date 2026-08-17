import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('dataportal_contacto')
export class DataportalContacto {
  @PrimaryColumn('uuid', { name: 'contribuyente_id' })
  contribuyenteId: string;

  @PrimaryColumn('text')
  valor: string;

  @Column('text')
  ruc: string;

  @Column('text')
  tipo: 'email' | 'telefono' | 'otro';

  @Column('text', { name: 'tipo_codigo', nullable: true })
  tipoCodigo: string | null;
}
