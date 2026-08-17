import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnlazarDataportalContribuyentes1700000026000 implements MigrationInterface {
  name = 'EnlazarDataportalContribuyentes1700000026000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM dataportal_contacto`);
    await q.query(`DELETE FROM dataportal_nomina`);

    await q.query(
      `ALTER TABLE dataportal_contacto DROP CONSTRAINT dataportal_contacto_pkey`,
    );
    await q.query(
      `ALTER TABLE dataportal_contacto ADD contribuyente_id uuid NOT NULL`,
    );
    await q.query(
      `ALTER TABLE dataportal_contacto ADD CONSTRAINT fk_dataportal_contacto_contribuyente
       FOREIGN KEY (contribuyente_id) REFERENCES contribuyentes(id) ON DELETE CASCADE`,
    );
    await q.query(
      `ALTER TABLE dataportal_contacto ADD CONSTRAINT dataportal_contacto_pkey
       PRIMARY KEY (contribuyente_id, valor)`,
    );
    await q.query(
      `CREATE INDEX idx_dataportal_contacto_ruc ON dataportal_contacto (ruc)`,
    );

    await q.query(
      `ALTER TABLE dataportal_nomina DROP CONSTRAINT dataportal_nomina_pkey`,
    );
    await q.query(
      `ALTER TABLE dataportal_nomina ADD contribuyente_id uuid NOT NULL`,
    );
    await q.query(
      `ALTER TABLE dataportal_nomina ADD CONSTRAINT fk_dataportal_nomina_contribuyente
       FOREIGN KEY (contribuyente_id) REFERENCES contribuyentes(id) ON DELETE CASCADE`,
    );
    await q.query(
      `ALTER TABLE dataportal_nomina ADD CONSTRAINT dataportal_nomina_pkey
       PRIMARY KEY (contribuyente_id, cedula)`,
    );
    await q.query(
      `CREATE INDEX idx_dataportal_nomina_ruc ON dataportal_nomina (ruc)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM dataportal_contacto`);
    await q.query(`DELETE FROM dataportal_nomina`);
    await q.query(`DROP INDEX idx_dataportal_contacto_ruc`);
    await q.query(
      `ALTER TABLE dataportal_contacto DROP CONSTRAINT dataportal_contacto_pkey`,
    );
    await q.query(
      `ALTER TABLE dataportal_contacto DROP CONSTRAINT fk_dataportal_contacto_contribuyente`,
    );
    await q.query(
      `ALTER TABLE dataportal_contacto DROP COLUMN contribuyente_id`,
    );
    await q.query(
      `ALTER TABLE dataportal_contacto ADD CONSTRAINT dataportal_contacto_pkey PRIMARY KEY (ruc, valor)`,
    );

    await q.query(`DROP INDEX idx_dataportal_nomina_ruc`);
    await q.query(
      `ALTER TABLE dataportal_nomina DROP CONSTRAINT dataportal_nomina_pkey`,
    );
    await q.query(
      `ALTER TABLE dataportal_nomina DROP CONSTRAINT fk_dataportal_nomina_contribuyente`,
    );
    await q.query(`ALTER TABLE dataportal_nomina DROP COLUMN contribuyente_id`);
    await q.query(
      `ALTER TABLE dataportal_nomina ADD CONSTRAINT dataportal_nomina_pkey PRIMARY KEY (ruc, cedula)`,
    );
  }
}
