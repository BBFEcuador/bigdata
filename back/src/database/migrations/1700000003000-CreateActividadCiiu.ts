import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Catálogo CIIU de actividades económicas.
 *
 * `codigo_supercias` es la pieza que enlaza con `companias`: el archivo de
 * compañías escribe el mismo código con un punto (`H4923.01`) y el catálogo sin
 * él (`H492301`). Guardar la forma con punto ya calculada convierte el enlace en
 * una igualdad indexable, en lugar de un `replace()` por consulta que ningún
 * índice puede aprovechar.
 */
export class CreateActividadCiiu1700000003000 implements MigrationInterface {
  name = 'CreateActividadCiiu1700000003000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE actividad_ciiu (
        codigo            text     PRIMARY KEY,
        nombre            text     NOT NULL,
        codigo_supercias  text     NULL,
        codigo_padre      text     NULL,
        nivel             smallint NOT NULL,
        nivel_nombre      text     NOT NULL,
        es_hoja           boolean  NOT NULL,
        longitud          smallint NOT NULL,
        aplicacion        text     NULL,

        row_hash          uuid        NOT NULL,
        primer_job_id     uuid        NULL,
        ultimo_job_id     uuid        NULL,
        ausente_desde_job uuid        NULL,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now()
      )
    `);

    await q.query(`CREATE INDEX idx_actividad_ciiu_padre ON actividad_ciiu (codigo_padre)`);
    await q.query(
      `CREATE UNIQUE INDEX idx_actividad_ciiu_supercias
         ON actividad_ciiu (codigo_supercias) WHERE codigo_supercias IS NOT NULL`,
    );

    // Índice funcional sobre companias, para poder filtrar por un nivel
    // intermedio (una Clase, un Grupo) comparando el código sin el punto.
    //
    // Va SIN `CONCURRENTLY` a propósito: las migraciones de TypeORM corren
    // dentro de una transacción y `CONCURRENTLY` no lo admite. Sobre las ~226 mil
    // filas de esta tabla el índice se construye en cerca de un segundo, así que
    // el lock exclusivo durante la migración no supone un problema. Si algún día
    // la tabla creciera mucho, tocaría crearlo fuera de la migración.
    await q.query(
      `CREATE INDEX idx_companias_ciiu6_norm
         ON companias ((replace(ciiu_nivel_6, '.', '')))`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS idx_companias_ciiu6_norm`);
    await q.query(`DROP TABLE IF EXISTS actividad_ciiu`);
  }
}
