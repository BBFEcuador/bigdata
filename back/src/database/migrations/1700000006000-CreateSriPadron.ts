import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Padrón del SRI: 8,4 millones de filas repartidas en 24 archivos provinciales.
 *
 * ## Por qué tres tablas y no una
 *
 * El archivo mezcla dos poblaciones que no tienen nada que ver:
 *
 *   PERSONA NATURAL   7.648.243 filas   sin balances, sin indicadores
 *   SOCIEDAD            783.977 filas   de las cuales sólo ~60 % están en Supercias
 *
 * Las personas naturales se separan físicamente y no se mezclan nunca con las
 * empresas: no presentan balances y meterlas en la misma tabla haría que cada
 * consulta de compañías tuviera que acordarse de excluirlas. Un olvido, y un
 * promedio sectorial pasa a incluir a siete millones de personas sin balance.
 *
 * Las sociedades se reparten según estén o no en el directorio de la
 * Superintendencia. Las que no están —fundaciones, cooperativas, entidades
 * públicas, sociedades de hecho— son ~40 % del total y no son basura: tienen
 * RUC, actividad económica y establecimientos, así que son prospectos válidos.
 * Simplemente nunca tendrán balances.
 *
 * ## Una fila por establecimiento, no por RUC
 *
 * El archivo trae una fila por ESTABLECIMIENTO: en Galápagos son 27.618 filas
 * para 20.252 RUC. Los datos del contribuyente se repiten en cada una. Por eso
 * los atributos de RUC van en las tablas de arriba (deduplicados) y los del
 * local en `establecimiento`, que es 1:N.
 *
 * ## El enlace con `companias` es por RUC, y es el único disponible
 *
 * El SRI no conoce el `expediente`. El puente se resuelve UNA vez durante el
 * import y se materializa en `companias.ruc_sri_enlazado`, en vez de hacer el
 * join por RUC en cada consulta. Los 8 RUC duplicados de `companias` no enlazan
 * con nadie: elegir uno de los dos expedientes sería inventar.
 */
export class CreateSriPadron1700000006000 implements MigrationInterface {
  name = 'CreateSriPadron1700000006000';

  public async up(q: QueryRunner): Promise<void> {
    // Columnas comunes a los dos tipos de contribuyente. Se repiten en las dos
    // tablas a propósito: la separación física es justamente lo que se busca.
    const columnasContribuyente = `
      ruc                     text PRIMARY KEY,
      razon_social            text NOT NULL,
      jurisdiccion            text NULL,
      estado_contribuyente    text NULL,
      clase_contribuyente     text NULL,
      fecha_inicio_actividades    date NULL,
      fecha_actualizacion         date NULL,
      fecha_suspension_definitiva date NULL,
      fecha_reinicio_actividades  date NULL,
      obligado_contabilidad   boolean NULL,
      agente_retencion        boolean NULL,
      contribuyente_especial  boolean NULL,
      num_establecimientos    smallint NOT NULL DEFAULT 0,

      row_hash          uuid        NOT NULL,
      primer_job_id     uuid        NULL,
      ultimo_job_id     uuid        NULL,
      ausente_desde_job uuid        NULL,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now()
    `;

    await q.query(`CREATE TABLE persona_natural (${columnasContribuyente})`);
    await q.query(`CREATE TABLE sociedad_no_supervisada (${columnasContribuyente})`);

    // Búsqueda por nombre: con 7,6 M de personas, un ILIKE '%…%' sin GIN de
    // trigramas es un recorrido completo en cada tecla.
    await q.query(
      `CREATE INDEX idx_persona_natural_nombre_trgm ON persona_natural USING gin (razon_social gin_trgm_ops)`,
    );
    await q.query(
      `CREATE INDEX idx_sociedad_ns_nombre_trgm ON sociedad_no_supervisada USING gin (razon_social gin_trgm_ops)`,
    );
    await q.query(
      `CREATE INDEX idx_persona_natural_estado ON persona_natural (estado_contribuyente)`,
    );

    // ------------------------------------------------------- establecimiento
    //
    // Sin FK al titular: un establecimiento puede pertenecer a una persona
    // natural, a una compañía de Supercias o a una sociedad no supervisada, y
    // una FK sólo puede apuntar a una tabla. `tipo_titular` dice a cuál.
    await q.query(`
      CREATE TABLE establecimiento (
        ruc            text     NOT NULL,
        numero         text     NOT NULL,
        tipo_titular   text     NOT NULL,
        nombre_comercial text   NULL,
        estado         text     NULL,
        provincia      text     NULL,
        canton         text     NULL,
        parroquia      text     NULL,
        codigo_ciiu    text     NULL,
        actividad      text     NULL,

        row_hash          uuid        NOT NULL,
        ultimo_job_id     uuid        NULL,
        ausente_desde_job uuid        NULL,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now(),

        PRIMARY KEY (ruc, numero)
      )
    `);

    await q.query(`CREATE INDEX idx_establecimiento_provincia ON establecimiento (provincia, canton)`);
    await q.query(`CREATE INDEX idx_establecimiento_ciiu ON establecimiento (codigo_ciiu)`);
    await q.query(`CREATE INDEX idx_establecimiento_tipo ON establecimiento (tipo_titular)`);

    // ------------------------------------------- enriquecimiento de companias
    //
    // Columnas nuevas, no sustituciones: lo que ya trae el directorio de la
    // Superintendencia se queda como está. `sri_job_id` marca de qué carga
    // vienen, para poder distinguir un NULL "el SRI no lo trae" de un NULL
    // "esta compañía nunca se cruzó con el padrón".
    await q.query(`
      ALTER TABLE companias
        ADD COLUMN sri_estado_contribuyente    text NULL,
        ADD COLUMN sri_clase_contribuyente     text NULL,
        ADD COLUMN sri_fecha_inicio_actividades date NULL,
        ADD COLUMN sri_obligado_contabilidad   boolean NULL,
        ADD COLUMN sri_agente_retencion        boolean NULL,
        ADD COLUMN sri_contribuyente_especial  boolean NULL,
        ADD COLUMN sri_nombre_comercial        text NULL,
        ADD COLUMN sri_parroquia               text NULL,
        ADD COLUMN sri_num_establecimientos    smallint NULL,
        ADD COLUMN sri_job_id                  uuid NULL
    `);

    await q.query(
      `CREATE INDEX idx_companias_sri_estado ON companias (sri_estado_contribuyente)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE companias
      DROP COLUMN IF EXISTS sri_estado_contribuyente,
      DROP COLUMN IF EXISTS sri_clase_contribuyente,
      DROP COLUMN IF EXISTS sri_fecha_inicio_actividades,
      DROP COLUMN IF EXISTS sri_obligado_contabilidad,
      DROP COLUMN IF EXISTS sri_agente_retencion,
      DROP COLUMN IF EXISTS sri_contribuyente_especial,
      DROP COLUMN IF EXISTS sri_nombre_comercial,
      DROP COLUMN IF EXISTS sri_parroquia,
      DROP COLUMN IF EXISTS sri_num_establecimientos,
      DROP COLUMN IF EXISTS sri_job_id`);
    await q.query(`DROP TABLE IF EXISTS establecimiento`);
    await q.query(`DROP TABLE IF EXISTS sociedad_no_supervisada`);
    await q.query(`DROP TABLE IF EXISTS persona_natural`);
  }
}
