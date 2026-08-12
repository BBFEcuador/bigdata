import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Añade `avisos` a `import_job`.
 *
 * Hace falta porque un import puede terminar bien —el millón de filas cargado y
 * consolidado— y aun así haber fallado la creación de algún índice. Sin un sitio
 * donde registrarlo, ese fallo se quedaba únicamente en el log del servidor y la
 * carga se reportaba como "completada" mientras las consultas se degradaban.
 */
export class AddImportJobAvisos1700000001000 implements MigrationInterface {
  name = 'AddImportJobAvisos1700000001000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE import_job ADD COLUMN avisos text NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE import_job DROP COLUMN avisos`);
  }
}
