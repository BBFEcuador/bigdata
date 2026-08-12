import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Esquema del importador de compañías.
 *
 * Va en una migración y NO en `db/init.sql`: ese archivo sólo lo ejecuta la
 * imagen de Postgres cuando el volumen está vacío, y el volumen `postgres_data`
 * de este proyecto ya está inicializado. Cualquier DDL añadido allí se ignoraría
 * en silencio, y el error aparecería mucho más tarde como "relation companias
 * does not exist".
 */
export class CreateCompaniasImport1700000000000 implements MigrationInterface {
  name = 'CreateCompaniasImport1700000000000';

  public async up(q: QueryRunner): Promise<void> {
    // Búsqueda por nombre parcial sobre un millón de filas.
    await q.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    await q.query(`
      CREATE TABLE companias (
        expediente                         text          PRIMARY KEY,
        ruc                                text          NULL,
        nombre                             text          NOT NULL,
        situacion_legal                    text          NULL,
        fecha_constitucion                 date          NULL,
        tipo                               text          NULL,
        pais                               text          NULL,
        region                             text          NULL,
        provincia                          text          NULL,
        canton                             text          NULL,
        ciudad                             text          NULL,
        calle                              text          NULL,
        numero                             text          NULL,
        interseccion                       text          NULL,
        barrio                             text          NULL,
        telefono                           text          NULL,
        representante                      text          NULL,
        cargo                              text          NULL,
        capital_suscrito                   numeric(18,2) NULL,
        ciiu_nivel_1                       text          NULL,
        ciiu_nivel_6                       text          NULL,
        ultimo_balance                     smallint      NULL,
        presento_balance_inicial           boolean       NULL,
        fecha_presentacion_balance_inicial date          NULL,

        row_hash            uuid        NOT NULL,
        primer_job_id       uuid        NULL,
        ultimo_job_id       uuid        NULL,
        ausente_desde_job   uuid        NULL,
        created_at          timestamptz NOT NULL DEFAULT now(),
        updated_at          timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Índice parcial para el listado por defecto (sólo compañías vigentes en la
    // última carga). Los índices secundarios NO se crean aquí: los crea el
    // importador después de la primera carga, que es mucho más rápido.
    await q.query(
      `CREATE INDEX idx_companias_vigentes ON companias (expediente) WHERE ausente_desde_job IS NULL`,
    );

    await q.query(`
      CREATE TYPE import_job_status AS ENUM (
        'pending','parsing','merging','indexing','completed','failed'
      )
    `);

    await q.query(`
      CREATE TABLE import_job (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        kind              text NOT NULL DEFAULT 'supercias_companias',
        status            import_job_status NOT NULL DEFAULT 'pending',
        modo              text NOT NULL DEFAULT 'snapshot_completo',
        original_filename text NOT NULL,
        stored_path       text NOT NULL,
        file_size_bytes   bigint NOT NULL DEFAULT 0,
        bytes_processed   bigint NOT NULL DEFAULT 0,
        rows_read         bigint NOT NULL DEFAULT 0,
        rows_copied       bigint NOT NULL DEFAULT 0,
        rows_rejected     bigint NOT NULL DEFAULT 0,
        rows_warned       bigint NOT NULL DEFAULT 0,
        rows_inserted     bigint NOT NULL DEFAULT 0,
        rows_updated      bigint NOT NULL DEFAULT 0,
        rows_unchanged    bigint NOT NULL DEFAULT 0,
        rows_missing      bigint NOT NULL DEFAULT 0,
        duplicados        bigint NOT NULL DEFAULT 0,
        progress_pct      smallint NOT NULL DEFAULT 0,
        staging_table     text NULL,
        error_message     text NULL,
        started_at        timestamptz NULL,
        finished_at       timestamptz NULL,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now()
      )
    `);

    await q.query(
      `CREATE INDEX idx_import_job_created ON import_job (created_at DESC)`,
    );

    // Un solo import activo a la vez, garantizado por la base y no por un flag
    // en memoria: un booleano no sobrevive a un reinicio ni a un recarga de
    // --watch, y dos cargas simultáneas se pisarían el staging.
    await q.query(`
      CREATE UNIQUE INDEX uq_import_job_activo ON import_job (kind)
      WHERE status IN ('pending','parsing','merging','indexing')
    `);

    await q.query(`
      CREATE TABLE import_row_reject (
        id                bigserial PRIMARY KEY,
        job_id            uuid NOT NULL REFERENCES import_job(id) ON DELETE CASCADE,
        source_row_number bigint NOT NULL,
        columna           text NULL,
        motivo            text NOT NULL,
        raw               jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at        timestamptz NOT NULL DEFAULT now()
      )
    `);

    await q.query(
      `CREATE INDEX idx_import_row_reject_job ON import_row_reject (job_id, id)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS import_row_reject`);
    await q.query(`DROP TABLE IF EXISTS import_job`);
    await q.query(`DROP TYPE IF EXISTS import_job_status`);
    await q.query(`DROP TABLE IF EXISTS companias`);
  }
}
