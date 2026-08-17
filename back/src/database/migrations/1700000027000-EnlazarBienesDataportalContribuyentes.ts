import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnlazarBienesDataportalContribuyentes1700000027000 implements MigrationInterface {
  name = 'EnlazarBienesDataportalContribuyentes1700000027000';

  public async up(q: QueryRunner): Promise<void> {
    // El modelo anterior no permite asociar bienes inequívocamente y sus datos
    // pueden reconstruirse desde DataPortal, por lo que la migración los vacía.
    await q.query(`DROP TABLE dataportal_propiedad`);
    await q.query(`DROP TABLE dataportal_vehiculo`);

    await q.query(`
      CREATE TABLE dataportal_propiedad (
        contribuyente_id uuid NOT NULL,
        ruc text NOT NULL,
        cedula_catastral text NOT NULL,
        parroquia text NULL,
        codigo_calle text NULL,
        calle_principal text NULL,
        numero text NULL,
        barrio_sector text NULL,
        zona text NULL,
        telefono text NULL,
        CONSTRAINT pk_dataportal_propiedad
          PRIMARY KEY (contribuyente_id, cedula_catastral),
        CONSTRAINT fk_dataportal_propiedad_contribuyente
          FOREIGN KEY (contribuyente_id) REFERENCES contribuyentes(id)
          ON DELETE CASCADE
      )
    `);
    await q.query(
      `CREATE INDEX idx_dataportal_propiedad_ruc ON dataportal_propiedad (ruc)`,
    );

    await q.query(`
      CREATE TABLE dataportal_vehiculo (
        contribuyente_id uuid NOT NULL,
        ruc text NOT NULL,
        placa text NOT NULL,
        tipo text NULL,
        modelo text NULL,
        marca text NULL,
        anio smallint NULL,
        lugar text NULL,
        fecha_vencimiento timestamp without time zone NULL,
        CONSTRAINT pk_dataportal_vehiculo
          PRIMARY KEY (contribuyente_id, placa),
        CONSTRAINT fk_dataportal_vehiculo_contribuyente
          FOREIGN KEY (contribuyente_id) REFERENCES contribuyentes(id)
          ON DELETE CASCADE
      )
    `);
    await q.query(
      `CREATE INDEX idx_dataportal_vehiculo_ruc ON dataportal_vehiculo (ruc)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE dataportal_propiedad`);
    await q.query(`DROP TABLE dataportal_vehiculo`);

    await q.query(`
      CREATE TABLE dataportal_vehiculo (
        ruc text NOT NULL,
        placa text NOT NULL,
        tipo text NULL,
        marca text NULL,
        modelo text NULL,
        anio smallint NULL,
        cilindraje integer NULL,
        avaluo numeric(14,2) NULL,
        ciudad text NULL,
        fecha_matricula date NULL,
        anio_pago smallint NULL,
        PRIMARY KEY (ruc, placa)
      )
    `);
    await q.query(
      `CREATE INDEX idx_dataportal_vehiculo_ruc ON dataportal_vehiculo (ruc)`,
    );
    await q.query(`
      CREATE TABLE dataportal_propiedad (
        id bigserial PRIMARY KEY,
        ruc text NOT NULL,
        datos jsonb NOT NULL
      )
    `);
    await q.query(
      `CREATE INDEX idx_dataportal_propiedad_ruc ON dataportal_propiedad (ruc)`,
    );
  }
}
