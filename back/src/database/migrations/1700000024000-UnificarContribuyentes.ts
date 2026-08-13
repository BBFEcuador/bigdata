import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Unifica las tres poblaciones que antes vivían en tablas distintas.
 *
 * `tipo` identifica la población y `tipo_compania` conserva la forma
 * societaria que venía de Supercias. El expediente sigue siendo nullable y no
 * único: el padrón no lo tiene y un RUC puede estar asociado a varios
 * expedientes.
 *
 * Las tablas anteriores se renombran a *_legacy y se exponen como vistas de
 * compatibilidad. Los objetos materializados creados por migraciones previas
 * conservan sus dependencias físicas; el trigger mantiene esos espejos al día
 * mientras se van retirando los consumidores históricos.
 */
export class UnificarContribuyentes1700000024000 implements MigrationInterface {
  name = 'UnificarContribuyentes1700000024000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE contribuyentes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tipo text NOT NULL CHECK (tipo IN (
          'companies', 'natural_contable', 'natural_no_contable',
          'sociedad_no_supervisada'
        )),
        expediente text NULL,
        ruc text NULL,
        nombre text NOT NULL,

        jurisdiccion text NULL,
        estado_contribuyente text NULL,
        clase_contribuyente text NULL,
        fecha_inicio_actividades date NULL,
        fecha_actualizacion date NULL,
        fecha_suspension_definitiva date NULL,
        fecha_reinicio_actividades date NULL,
        obligado_contabilidad boolean NULL,
        agente_retencion boolean NULL,
        contribuyente_especial boolean NULL,
        num_establecimientos smallint NULL,

        situacion_legal text NULL,
        fecha_constitucion date NULL,
        tipo_compania text NULL,
        pais text NULL,
        region text NULL,
        provincia text NULL,
        canton text NULL,
        ciudad text NULL,
        calle text NULL,
        numero text NULL,
        interseccion text NULL,
        barrio text NULL,
        telefono text NULL,
        representante text NULL,
        cargo text NULL,
        capital_suscrito numeric(18,2) NULL,
        ciiu_nivel_1 text NULL,
        ciiu_nivel_6 text NULL,
        ultimo_balance smallint NULL,
        presento_balance_inicial boolean NULL,
        fecha_presentacion_balance_inicial date NULL,

        sri_estado_contribuyente text NULL,
        sri_clase_contribuyente text NULL,
        sri_fecha_inicio_actividades date NULL,
        sri_obligado_contabilidad boolean NULL,
        sri_agente_retencion boolean NULL,
        sri_contribuyente_especial boolean NULL,
        sri_nombre_comercial text NULL,
        sri_parroquia text NULL,
        sri_num_establecimientos smallint NULL,
        sri_job_id uuid NULL,

        turismo_registros smallint NULL,
        turismo_actividades text[] NULL,
        turismo_clasificaciones text[] NULL,
        turismo_ratificado boolean NULL,
        turismo_job_id uuid NULL,
        exportador_bienes_iva_anios smallint[] NULL,
        exportador_servicios_iva_anios smallint[] NULL,
        exportador_bienes_ir_anios smallint[] NULL,
        catastros_job_id uuid NULL,

        row_hash uuid NOT NULL,
        primer_job_id uuid NULL,
        ultimo_job_id uuid NULL,
        ausente_desde_job uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await q.query(`
      INSERT INTO contribuyentes (
        tipo, expediente, ruc, nombre, situacion_legal, fecha_constitucion,
        tipo_compania, pais, region, provincia, canton, ciudad, calle, numero,
        interseccion, barrio, telefono, representante, cargo, capital_suscrito,
        ciiu_nivel_1, ciiu_nivel_6, ultimo_balance, presento_balance_inicial,
        fecha_presentacion_balance_inicial, sri_estado_contribuyente,
        sri_clase_contribuyente, sri_fecha_inicio_actividades,
        sri_obligado_contabilidad, sri_agente_retencion,
        sri_contribuyente_especial, sri_nombre_comercial, sri_parroquia,
        sri_num_establecimientos, sri_job_id, turismo_registros,
        turismo_actividades, turismo_clasificaciones, turismo_ratificado,
        turismo_job_id, exportador_bienes_iva_anios,
        exportador_servicios_iva_anios, exportador_bienes_ir_anios,
        catastros_job_id, row_hash, primer_job_id, ultimo_job_id,
        ausente_desde_job, created_at, updated_at
      )
      SELECT 'companies', expediente, ruc, nombre, situacion_legal,
             fecha_constitucion, tipo, pais, region, provincia, canton, ciudad,
             calle, numero, interseccion, barrio, telefono, representante,
             cargo, capital_suscrito, ciiu_nivel_1, ciiu_nivel_6,
             ultimo_balance, presento_balance_inicial,
             fecha_presentacion_balance_inicial, sri_estado_contribuyente,
             sri_clase_contribuyente, sri_fecha_inicio_actividades,
             sri_obligado_contabilidad, sri_agente_retencion,
             sri_contribuyente_especial, sri_nombre_comercial, sri_parroquia,
             sri_num_establecimientos, sri_job_id, turismo_registros,
             turismo_actividades, turismo_clasificaciones, turismo_ratificado,
             turismo_job_id, exportador_bienes_iva_anios,
             exportador_servicios_iva_anios, exportador_bienes_ir_anios,
             catastros_job_id, row_hash, primer_job_id, ultimo_job_id,
             ausente_desde_job, created_at, updated_at
        FROM companias
    `);

    await q.query(`
      INSERT INTO contribuyentes (
        tipo, ruc, nombre, jurisdiccion, estado_contribuyente,
        clase_contribuyente, fecha_inicio_actividades, fecha_actualizacion,
        fecha_suspension_definitiva, fecha_reinicio_actividades,
        obligado_contabilidad, agente_retencion, contribuyente_especial,
        num_establecimientos, turismo_registros, turismo_actividades,
        turismo_ratificado, exportador_bienes_iva_anios,
        exportador_servicios_iva_anios, exportador_bienes_ir_anios,
        row_hash, primer_job_id, ultimo_job_id, ausente_desde_job,
        created_at, updated_at
      )
      SELECT CASE WHEN obligado_contabilidad IS TRUE
                  THEN 'natural_contable' ELSE 'natural_no_contable' END,
             ruc, razon_social, jurisdiccion, estado_contribuyente,
             clase_contribuyente, fecha_inicio_actividades, fecha_actualizacion,
             fecha_suspension_definitiva, fecha_reinicio_actividades,
             obligado_contabilidad, agente_retencion, contribuyente_especial,
             num_establecimientos, turismo_registros, turismo_actividades,
             turismo_ratificado, exportador_bienes_iva_anios,
             exportador_servicios_iva_anios, exportador_bienes_ir_anios,
             row_hash, primer_job_id, ultimo_job_id, ausente_desde_job,
             created_at, updated_at
        FROM persona_natural
    `);

    await q.query(`
      INSERT INTO contribuyentes (
        tipo, ruc, nombre, jurisdiccion, estado_contribuyente,
        clase_contribuyente, fecha_inicio_actividades, fecha_actualizacion,
        fecha_suspension_definitiva, fecha_reinicio_actividades,
        obligado_contabilidad, agente_retencion, contribuyente_especial,
        num_establecimientos, turismo_registros, turismo_actividades,
        turismo_ratificado, exportador_bienes_iva_anios,
        exportador_servicios_iva_anios, exportador_bienes_ir_anios,
        row_hash, primer_job_id, ultimo_job_id, ausente_desde_job,
        created_at, updated_at
      )
      SELECT 'sociedad_no_supervisada', ruc, razon_social, jurisdiccion,
             estado_contribuyente, clase_contribuyente,
             fecha_inicio_actividades, fecha_actualizacion,
             fecha_suspension_definitiva, fecha_reinicio_actividades,
             obligado_contabilidad, agente_retencion, contribuyente_especial,
             num_establecimientos, turismo_registros, turismo_actividades,
             turismo_ratificado, exportador_bienes_iva_anios,
             exportador_servicios_iva_anios, exportador_bienes_ir_anios,
             row_hash, primer_job_id, ultimo_job_id, ausente_desde_job,
             created_at, updated_at
        FROM sociedad_no_supervisada
    `);

    const [origen] = await q.query(`
      SELECT
        (SELECT count(*)::bigint FROM companias) AS companias,
        (SELECT count(*)::bigint FROM persona_natural) AS personas,
        (SELECT count(*)::bigint FROM sociedad_no_supervisada) AS sociedades
    `);
    const [migrado] = await q.query(`
      SELECT
        count(*) FILTER (WHERE tipo = 'companies')::bigint AS companias,
        count(*) FILTER (WHERE tipo IN ('natural_contable', 'natural_no_contable'))::bigint AS personas,
        count(*) FILTER (WHERE tipo = 'sociedad_no_supervisada')::bigint AS sociedades
        FROM contribuyentes
    `);
    for (const campo of ['companias', 'personas', 'sociedades']) {
      if (Number(origen[campo]) !== Number(migrado[campo])) {
        throw new Error(
          `Migración incompleta de contribuyentes en ${campo}: ` +
            `${origen[campo]} origen frente a ${migrado[campo]} migrados.`,
        );
      }
    }

    await q.query(
      `CREATE INDEX idx_contribuyentes_tipo ON contribuyentes (tipo)`,
    );
    await q.query(
      `CREATE INDEX idx_contribuyentes_ruc ON contribuyentes (ruc)`,
    );
    await q.query(
      `CREATE INDEX idx_contribuyentes_expediente ON contribuyentes (expediente)`,
    );
    await q.query(
      `CREATE INDEX idx_contribuyentes_estado ON contribuyentes (estado_contribuyente)`,
    );
    await q.query(
      `CREATE INDEX idx_contribuyentes_provincia_canton ON contribuyentes (provincia, canton)`,
    );
    await q.query(
      `CREATE INDEX idx_contribuyentes_ciiu1 ON contribuyentes (ciiu_nivel_1)`,
    );
    await q.query(
      `CREATE INDEX idx_contribuyentes_ciiu6 ON contribuyentes (ciiu_nivel_6)`,
    );
    await q.query(
      `CREATE INDEX idx_contribuyentes_ciiu6_norm ON contribuyentes ((replace(ciiu_nivel_6, '.', '')))`,
    );
    await q.query(
      `CREATE INDEX idx_contribuyentes_nombre_trgm ON contribuyentes USING gin (nombre gin_trgm_ops)`,
    );
    await q.query(
      `CREATE UNIQUE INDEX idx_contribuyentes_tipo_ruc ON contribuyentes (tipo, ruc) WHERE ruc IS NOT NULL AND tipo <> 'companies'`,
    );
    await q.query(
      `CREATE UNIQUE INDEX idx_contribuyentes_companies_expediente ON contribuyentes (expediente) WHERE tipo = 'companies' AND expediente IS NOT NULL`,
    );
    await q.query(
      `CREATE INDEX idx_contribuyentes_vigentes ON contribuyentes (tipo, expediente, ruc) WHERE ausente_desde_job IS NULL`,
    );

    // Enlaza cada local con el UUID cuando el RUC identifica un único titular.
    await q.query(
      `ALTER TABLE establecimiento ADD COLUMN titular_id uuid NULL`,
    );
    await q.query(`
      UPDATE establecimiento e
         SET titular_id = c.id
        FROM contribuyentes c
       WHERE c.ruc = e.ruc
         AND (
           (e.tipo_titular = 'compania' AND c.tipo = 'companies' AND
             (SELECT count(*) FROM contribuyentes c2
               WHERE c2.ruc = e.ruc AND c2.tipo = 'companies') = 1)
           OR (e.tipo_titular = 'persona_natural' AND c.tipo IN ('natural_contable', 'natural_no_contable'))
           OR (e.tipo_titular = 'sociedad_no_supervisada' AND c.tipo = 'sociedad_no_supervisada')
         )
    `);
    await q.query(
      `CREATE INDEX idx_establecimiento_titular ON establecimiento (titular_id)`,
    );
    await q.query(
      `ALTER TABLE establecimiento ADD CONSTRAINT fk_establecimiento_titular FOREIGN KEY (titular_id) REFERENCES contribuyentes(id) ON DELETE SET NULL`,
    );

    // Conserva las dependencias de vistas materializadas ya desplegadas.
    await q.query(
      `ALTER TABLE companias RENAME TO contribuyentes_legacy_companias`,
    );
    await q.query(
      `ALTER TABLE persona_natural RENAME TO contribuyentes_legacy_personas`,
    );
    await q.query(
      `ALTER TABLE sociedad_no_supervisada RENAME TO contribuyentes_legacy_sociedades`,
    );
    await q.query(`
      CREATE OR REPLACE FUNCTION sincronizar_contribuyente_legacy()
      RETURNS trigger LANGUAGE plpgsql AS $fn$
      BEGIN
        IF NEW.tipo = 'companies' THEN
          UPDATE contribuyentes_legacy_companias SET
            ruc = NEW.ruc, nombre = NEW.nombre, situacion_legal = NEW.situacion_legal,
            fecha_constitucion = NEW.fecha_constitucion, tipo = NEW.tipo_compania,
            pais = NEW.pais, region = NEW.region, provincia = NEW.provincia,
            canton = NEW.canton, ciudad = NEW.ciudad, calle = NEW.calle,
            numero = NEW.numero, interseccion = NEW.interseccion, barrio = NEW.barrio,
            telefono = NEW.telefono, representante = NEW.representante, cargo = NEW.cargo,
            capital_suscrito = NEW.capital_suscrito, ciiu_nivel_1 = NEW.ciiu_nivel_1,
            ciiu_nivel_6 = NEW.ciiu_nivel_6, ultimo_balance = NEW.ultimo_balance,
            presento_balance_inicial = NEW.presento_balance_inicial,
            fecha_presentacion_balance_inicial = NEW.fecha_presentacion_balance_inicial,
            sri_estado_contribuyente = NEW.sri_estado_contribuyente,
            sri_clase_contribuyente = NEW.sri_clase_contribuyente,
            sri_fecha_inicio_actividades = NEW.sri_fecha_inicio_actividades,
            sri_obligado_contabilidad = NEW.sri_obligado_contabilidad,
            sri_agente_retencion = NEW.sri_agente_retencion,
            sri_contribuyente_especial = NEW.sri_contribuyente_especial,
            sri_nombre_comercial = NEW.sri_nombre_comercial, sri_parroquia = NEW.sri_parroquia,
            sri_num_establecimientos = NEW.sri_num_establecimientos, sri_job_id = NEW.sri_job_id,
            turismo_registros = NEW.turismo_registros, turismo_actividades = NEW.turismo_actividades,
            turismo_clasificaciones = NEW.turismo_clasificaciones,
            turismo_ratificado = NEW.turismo_ratificado, turismo_job_id = NEW.turismo_job_id,
            exportador_bienes_iva_anios = NEW.exportador_bienes_iva_anios,
            exportador_servicios_iva_anios = NEW.exportador_servicios_iva_anios,
            exportador_bienes_ir_anios = NEW.exportador_bienes_ir_anios,
            catastros_job_id = NEW.catastros_job_id, row_hash = NEW.row_hash,
            ultimo_job_id = NEW.ultimo_job_id, ausente_desde_job = NEW.ausente_desde_job,
            updated_at = NEW.updated_at
          WHERE expediente = NEW.expediente;
          IF NOT FOUND THEN
            INSERT INTO contribuyentes_legacy_companias (
              expediente, ruc, nombre, situacion_legal, fecha_constitucion, tipo,
              pais, region, provincia, canton, ciudad, calle, numero, interseccion,
              barrio, telefono, representante, cargo, capital_suscrito,
              ciiu_nivel_1, ciiu_nivel_6, ultimo_balance, presento_balance_inicial,
              fecha_presentacion_balance_inicial, row_hash, primer_job_id,
              ultimo_job_id, ausente_desde_job, created_at, updated_at,
              sri_estado_contribuyente, sri_clase_contribuyente,
              sri_fecha_inicio_actividades, sri_obligado_contabilidad,
              sri_agente_retencion, sri_contribuyente_especial, sri_nombre_comercial,
              sri_parroquia, sri_num_establecimientos, sri_job_id,
              turismo_registros, turismo_actividades, turismo_clasificaciones,
              turismo_ratificado, turismo_job_id, exportador_bienes_iva_anios,
              exportador_servicios_iva_anios, exportador_bienes_ir_anios,
              catastros_job_id
            ) VALUES (
              NEW.expediente, NEW.ruc, NEW.nombre, NEW.situacion_legal,
              NEW.fecha_constitucion, NEW.tipo_compania, NEW.pais, NEW.region,
              NEW.provincia, NEW.canton, NEW.ciudad, NEW.calle, NEW.numero,
              NEW.interseccion, NEW.barrio, NEW.telefono, NEW.representante,
              NEW.cargo, NEW.capital_suscrito, NEW.ciiu_nivel_1, NEW.ciiu_nivel_6,
              NEW.ultimo_balance, NEW.presento_balance_inicial,
              NEW.fecha_presentacion_balance_inicial, NEW.row_hash,
              NEW.primer_job_id, NEW.ultimo_job_id, NEW.ausente_desde_job,
              NEW.created_at, NEW.updated_at, NEW.sri_estado_contribuyente,
              NEW.sri_clase_contribuyente, NEW.sri_fecha_inicio_actividades,
              NEW.sri_obligado_contabilidad, NEW.sri_agente_retencion,
              NEW.sri_contribuyente_especial, NEW.sri_nombre_comercial,
              NEW.sri_parroquia, NEW.sri_num_establecimientos, NEW.sri_job_id,
              NEW.turismo_registros, NEW.turismo_actividades,
              NEW.turismo_clasificaciones, NEW.turismo_ratificado,
              NEW.turismo_job_id, NEW.exportador_bienes_iva_anios,
              NEW.exportador_servicios_iva_anios, NEW.exportador_bienes_ir_anios,
              NEW.catastros_job_id
            );
          END IF;
        ELSIF NEW.tipo IN ('natural_contable', 'natural_no_contable') THEN
          UPDATE contribuyentes_legacy_personas SET
            razon_social = NEW.nombre, jurisdiccion = NEW.jurisdiccion,
            estado_contribuyente = NEW.estado_contribuyente,
            clase_contribuyente = NEW.clase_contribuyente,
            fecha_inicio_actividades = NEW.fecha_inicio_actividades,
            fecha_actualizacion = NEW.fecha_actualizacion,
            fecha_suspension_definitiva = NEW.fecha_suspension_definitiva,
            fecha_reinicio_actividades = NEW.fecha_reinicio_actividades,
            obligado_contabilidad = NEW.obligado_contabilidad,
            agente_retencion = NEW.agente_retencion,
            contribuyente_especial = NEW.contribuyente_especial,
            num_establecimientos = NEW.num_establecimientos,
            turismo_registros = NEW.turismo_registros, turismo_actividades = NEW.turismo_actividades,
            turismo_ratificado = NEW.turismo_ratificado,
            exportador_bienes_iva_anios = NEW.exportador_bienes_iva_anios,
            exportador_servicios_iva_anios = NEW.exportador_servicios_iva_anios,
            exportador_bienes_ir_anios = NEW.exportador_bienes_ir_anios,
            row_hash = NEW.row_hash, ultimo_job_id = NEW.ultimo_job_id,
            ausente_desde_job = NEW.ausente_desde_job, updated_at = NEW.updated_at
          WHERE ruc = NEW.ruc;
          IF NOT FOUND THEN
            INSERT INTO contribuyentes_legacy_personas (
              ruc, razon_social, jurisdiccion, estado_contribuyente,
              clase_contribuyente, fecha_inicio_actividades, fecha_actualizacion,
              fecha_suspension_definitiva, fecha_reinicio_actividades,
              obligado_contabilidad, agente_retencion, contribuyente_especial,
              num_establecimientos, row_hash, primer_job_id, ultimo_job_id,
              ausente_desde_job, created_at, updated_at, turismo_registros,
              turismo_actividades, turismo_clasificaciones, turismo_ratificado,
              turismo_job_id, exportador_bienes_iva_anios,
              exportador_servicios_iva_anios, exportador_bienes_ir_anios,
              catastros_job_id
            ) VALUES (
              NEW.ruc, NEW.nombre, NEW.jurisdiccion, NEW.estado_contribuyente,
              NEW.clase_contribuyente, NEW.fecha_inicio_actividades,
              NEW.fecha_actualizacion, NEW.fecha_suspension_definitiva,
              NEW.fecha_reinicio_actividades, NEW.obligado_contabilidad,
              NEW.agente_retencion, NEW.contribuyente_especial,
              NEW.num_establecimientos, NEW.row_hash, NEW.primer_job_id,
              NEW.ultimo_job_id, NEW.ausente_desde_job, NEW.created_at,
              NEW.updated_at, NEW.turismo_registros, NEW.turismo_actividades,
              NEW.turismo_clasificaciones, NEW.turismo_ratificado,
              NEW.turismo_job_id, NEW.exportador_bienes_iva_anios,
              NEW.exportador_servicios_iva_anios, NEW.exportador_bienes_ir_anios,
              NEW.catastros_job_id
            );
          END IF;
        ELSE
          UPDATE contribuyentes_legacy_sociedades SET
            razon_social = NEW.nombre, jurisdiccion = NEW.jurisdiccion,
            estado_contribuyente = NEW.estado_contribuyente,
            clase_contribuyente = NEW.clase_contribuyente,
            fecha_inicio_actividades = NEW.fecha_inicio_actividades,
            fecha_actualizacion = NEW.fecha_actualizacion,
            fecha_suspension_definitiva = NEW.fecha_suspension_definitiva,
            fecha_reinicio_actividades = NEW.fecha_reinicio_actividades,
            obligado_contabilidad = NEW.obligado_contabilidad,
            agente_retencion = NEW.agente_retencion,
            contribuyente_especial = NEW.contribuyente_especial,
            num_establecimientos = NEW.num_establecimientos,
            turismo_registros = NEW.turismo_registros, turismo_actividades = NEW.turismo_actividades,
            turismo_ratificado = NEW.turismo_ratificado,
            exportador_bienes_iva_anios = NEW.exportador_bienes_iva_anios,
            exportador_servicios_iva_anios = NEW.exportador_servicios_iva_anios,
            exportador_bienes_ir_anios = NEW.exportador_bienes_ir_anios,
            row_hash = NEW.row_hash, ultimo_job_id = NEW.ultimo_job_id,
            ausente_desde_job = NEW.ausente_desde_job, updated_at = NEW.updated_at
          WHERE ruc = NEW.ruc;
          IF NOT FOUND THEN
            INSERT INTO contribuyentes_legacy_sociedades (
              ruc, razon_social, jurisdiccion, estado_contribuyente,
              clase_contribuyente, fecha_inicio_actividades, fecha_actualizacion,
              fecha_suspension_definitiva, fecha_reinicio_actividades,
              obligado_contabilidad, agente_retencion, contribuyente_especial,
              num_establecimientos, row_hash, primer_job_id, ultimo_job_id,
              ausente_desde_job, created_at, updated_at, turismo_registros,
              turismo_actividades, turismo_clasificaciones, turismo_ratificado,
              turismo_job_id, exportador_bienes_iva_anios,
              exportador_servicios_iva_anios, exportador_bienes_ir_anios,
              catastros_job_id
            ) VALUES (
              NEW.ruc, NEW.nombre, NEW.jurisdiccion, NEW.estado_contribuyente,
              NEW.clase_contribuyente, NEW.fecha_inicio_actividades,
              NEW.fecha_actualizacion, NEW.fecha_suspension_definitiva,
              NEW.fecha_reinicio_actividades, NEW.obligado_contabilidad,
              NEW.agente_retencion, NEW.contribuyente_especial,
              NEW.num_establecimientos, NEW.row_hash, NEW.primer_job_id,
              NEW.ultimo_job_id, NEW.ausente_desde_job, NEW.created_at,
              NEW.updated_at, NEW.turismo_registros, NEW.turismo_actividades,
              NEW.turismo_clasificaciones, NEW.turismo_ratificado,
              NEW.turismo_job_id, NEW.exportador_bienes_iva_anios,
              NEW.exportador_servicios_iva_anios, NEW.exportador_bienes_ir_anios,
              NEW.catastros_job_id
            );
          END IF;
        END IF;
        RETURN NEW;
      END $fn$
    `);
    await q.query(
      `CREATE TRIGGER trg_contribuyentes_legacy AFTER INSERT OR UPDATE ON contribuyentes FOR EACH ROW EXECUTE FUNCTION sincronizar_contribuyente_legacy()`,
    );

    // Las vistas sólo son un puente para consumidores externos antiguos; el
    // código de la aplicación ya usa contribuyentes.
    await q.query(`
      CREATE VIEW companias AS
      SELECT expediente, ruc, nombre, situacion_legal, fecha_constitucion,
             tipo_compania AS tipo, pais, region, provincia, canton, ciudad,
             calle, numero, interseccion, barrio, telefono, representante, cargo,
             capital_suscrito, ciiu_nivel_1, ciiu_nivel_6, ultimo_balance,
             presento_balance_inicial, fecha_presentacion_balance_inicial,
             row_hash, primer_job_id, ultimo_job_id, ausente_desde_job,
             created_at, updated_at, sri_estado_contribuyente,
             sri_clase_contribuyente, sri_fecha_inicio_actividades,
             sri_obligado_contabilidad, sri_agente_retencion,
             sri_contribuyente_especial, sri_nombre_comercial, sri_parroquia,
             sri_num_establecimientos, sri_job_id, turismo_registros,
             turismo_actividades, turismo_clasificaciones, turismo_ratificado,
             turismo_job_id, exportador_bienes_iva_anios,
             exportador_servicios_iva_anios, exportador_bienes_ir_anios,
             catastros_job_id
        FROM contribuyentes WHERE tipo = 'companies'
    `);
    await q.query(`
      CREATE VIEW persona_natural AS
      SELECT ruc, nombre AS razon_social, jurisdiccion, estado_contribuyente,
             clase_contribuyente, fecha_inicio_actividades, fecha_actualizacion,
             fecha_suspension_definitiva, fecha_reinicio_actividades,
             obligado_contabilidad, agente_retencion, contribuyente_especial,
             num_establecimientos, row_hash, primer_job_id, ultimo_job_id,
             ausente_desde_job, created_at, updated_at, turismo_registros,
             turismo_actividades, turismo_ratificado, exportador_bienes_iva_anios,
             exportador_servicios_iva_anios, exportador_bienes_ir_anios
        FROM contribuyentes WHERE tipo IN ('natural_contable', 'natural_no_contable')
    `);
    await q.query(`
      CREATE VIEW sociedad_no_supervisada AS
      SELECT ruc, nombre AS razon_social, jurisdiccion, estado_contribuyente,
             clase_contribuyente, fecha_inicio_actividades, fecha_actualizacion,
             fecha_suspension_definitiva, fecha_reinicio_actividades,
             obligado_contabilidad, agente_retencion, contribuyente_especial,
             num_establecimientos, row_hash, primer_job_id, ultimo_job_id,
             ausente_desde_job, created_at, updated_at, turismo_registros,
             turismo_actividades, turismo_ratificado, exportador_bienes_iva_anios,
             exportador_servicios_iva_anios, exportador_bienes_ir_anios
        FROM contribuyentes WHERE tipo = 'sociedad_no_supervisada'
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP VIEW IF EXISTS sociedad_no_supervisada`);
    await q.query(`DROP VIEW IF EXISTS persona_natural`);
    await q.query(`DROP VIEW IF EXISTS companias`);
    await q.query(
      `DROP TRIGGER IF EXISTS trg_contribuyentes_legacy ON contribuyentes`,
    );
    await q.query(`DROP FUNCTION IF EXISTS sincronizar_contribuyente_legacy()`);
    await q.query(
      `ALTER TABLE contribuyentes_legacy_companias RENAME TO companias`,
    );
    await q.query(
      `ALTER TABLE contribuyentes_legacy_personas RENAME TO persona_natural`,
    );
    await q.query(
      `ALTER TABLE contribuyentes_legacy_sociedades RENAME TO sociedad_no_supervisada`,
    );
    await q.query(
      `ALTER TABLE establecimiento DROP CONSTRAINT IF EXISTS fk_establecimiento_titular`,
    );
    await q.query(`DROP INDEX IF EXISTS idx_establecimiento_titular`);
    await q.query(
      `ALTER TABLE establecimiento DROP COLUMN IF EXISTS titular_id`,
    );
    await q.query(`DROP TABLE IF EXISTS contribuyentes`);
  }
}
