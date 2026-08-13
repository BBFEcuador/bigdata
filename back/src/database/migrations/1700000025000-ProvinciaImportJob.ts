import { MigrationInterface, QueryRunner } from 'typeorm';

/** Conserva la provincia declarada en los imports provinciales del padrón. */
export class ProvinciaImportJob1700000025000 implements MigrationInterface {
  name = 'ProvinciaImportJob1700000025000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE import_job ADD COLUMN provincia text NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE import_job DROP COLUMN IF EXISTS provincia`,
    );
  }
}
