import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('dataportal_propiedad')
export class DataportalPropiedad {
  @PrimaryColumn('uuid', { name: 'contribuyente_id' })
  contribuyenteId: string;

  @PrimaryColumn('text', { name: 'cedula_catastral' })
  cedulaCatastral: string;

  @Column('text') ruc: string;
  @Column('text', { nullable: true }) parroquia: string | null;
  @Column('text', { name: 'codigo_calle', nullable: true })
  codigoCalle: string | null;
  @Column('text', { name: 'calle_principal', nullable: true })
  callePrincipal: string | null;
  @Column('text', { nullable: true }) numero: string | null;
  @Column('text', { name: 'barrio_sector', nullable: true })
  barrioSector: string | null;
  @Column('text', { nullable: true }) zona: string | null;
  @Column('text', { nullable: true }) telefono: string | null;
}
