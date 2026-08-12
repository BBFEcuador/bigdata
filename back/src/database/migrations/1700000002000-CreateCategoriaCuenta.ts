import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Catálogo de cuentas contables de la Superintendencia.
 *
 * Índices: sólo la PK y uno sobre `codigo_padre`. El catálogo son ~600 filas, y
 * a esa escala un recorrido completo es instantáneo: el índice GIN de trigramas
 * que sí lleva `companias` aquí sería puro adorno.
 *
 * `codigo_padre` NO lleva clave foránea a `codigo` a propósito: es un valor
 * derivado durante el import (prefijo más largo presente en el archivo), y una
 * FK obligaría a ordenar las inserciones padre-antes-que-hijo dentro del upsert
 * sin aportar integridad real.
 */
export class CreateCategoriaCuenta1700000002000 implements MigrationInterface {
  name = 'CreateCategoriaCuenta1700000002000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE categoria_cuenta (
        codigo            text     PRIMARY KEY,
        nombre            text     NOT NULL,
        codigo_padre      text     NULL,
        nivel             smallint NOT NULL,
        es_hoja           boolean  NOT NULL,
        longitud          smallint NOT NULL,

        row_hash          uuid        NOT NULL,
        primer_job_id     uuid        NULL,
        ultimo_job_id     uuid        NULL,
        ausente_desde_job uuid        NULL,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now()
      )
    `);

    await q.query(
      `CREATE INDEX idx_categoria_cuenta_padre ON categoria_cuenta (codigo_padre)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS categoria_cuenta`);
  }
}
