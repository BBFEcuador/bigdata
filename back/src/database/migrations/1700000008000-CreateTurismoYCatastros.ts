import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Catastros públicos que dicen a qué régimen tributario se acoge un RUC.
 *
 * Son cuatro fuentes distintas que aquí se agrupan porque comparten forma
 * —listas de RUC publicadas periódicamente— y porque las cuatro sirven para lo
 * mismo: saber si un contribuyente tiene un beneficio o una obligación que no
 * se deduce de sus balances.
 *
 *   Catastro Nacional de Turismo   -> turismo_establecimiento   (Mintur)
 *   Exportadores habituales x3     -> catastro_sri              (SRI)
 *   Prestadores digitales          -> catastro_servicio_digital (SRI)
 *
 * ## Por qué el turismo tiene tabla propia y los otros comparten una
 *
 * El catastro de turismo trae 20 columnas por ESTABLECIMIENTO —dirección,
 * categoría, teléfono, correo, web— y varias filas por RUC. Los tres catastros
 * de exportadores traen cinco columnas por RUC y año, y las tres listas son la
 * misma forma con distinto nombre. Meterlos todos en una tabla genérica
 * obligaría a que el 80 % de las columnas estuvieran vacías para las filas de
 * exportadores; separarlos en tres tablas idénticas duplicaría el mismo DDL.
 *
 * ## El enlace es por RUC y alcanza a las TRES poblaciones
 *
 * De los 29.871 RUC del catastro de turismo sólo 5.323 son compañías de la
 * Superintendencia: 24.083 son personas naturales y 452 sociedades no
 * supervisadas. Un enriquecimiento que sólo tocara `companias` dejaría fuera al
 * 82 % del catastro, así que las columnas derivadas se añaden a las tres
 * tablas de titulares.
 *
 * ## Enriquecer, nunca reemplazar
 *
 * Como en el padrón del SRI y en DataPortal: el detalle vive en tablas propias
 * y de las tablas de titulares sólo se tocan columnas nuevas con prefijo. La
 * razón social buena sigue siendo la de la Superintendencia.
 */
export class CreateTurismoYCatastros1700000008000 implements MigrationInterface {
  name = 'CreateTurismoYCatastros1700000008000';

  /** Las tres poblaciones que pueden ser titulares de un RUC. */
  private readonly titulares = ['companias', 'persona_natural', 'sociedad_no_supervisada'];

  public async up(q: QueryRunner): Promise<void> {
    // ------------------------------------------------ turismo (Mintur)
    //
    // La PK es `numero_registro` y no (ruc, establecimiento): un mismo local
    // puede tener varios registros —un hotel con restaurante son dos filas con
    // el mismo RUC y el mismo código de establecimiento— y 796 pares
    // (ruc, código) aparecen repetidos en el archivo.
    await q.query(`
      CREATE TABLE turismo_establecimiento (
        numero_registro   text NOT NULL PRIMARY KEY,
        ruc               text NOT NULL,

        /**
         * Código de establecimiento SIN ceros a la izquierda, que es como lo
         * guarda "establecimiento" (el padrón del SRI). El archivo mezcla "1",
         * "01" y "001" para el mismo local, así que sin normalizar el join con
         * el padrón fallaría en la mitad de las filas.
         */
        codigo_establecimiento     text NULL,
        codigo_establecimiento_raw text NULL,

        nombre_comercial  text NULL,
        fecha_registro    date NULL,
        /** Se conserva el texto cuando la celda no es una fecha interpretable. */
        fecha_registro_raw text NULL,

        actividad         text NOT NULL,
        clasificacion     text NULL,
        categoria         text NULL,
        /**
         * Categoría en mayúsculas y sin tildes: el archivo escribe la misma
         * categoría de seis maneras ("Categoría Única", "Categoria Unica",
         * "CategoríaÚnica", "Categoría ünica"…). Agrupar por la columna cruda
         * daría seis grupos para un solo valor.
         */
        categoria_norm    text NULL,

        razon_social_propietario text NULL,
        representante_legal      text NULL,

        provincia         text NULL,
        canton            text NULL,
        parroquia         text NULL,
        /** 'urbana' | 'rural', normalizado; el archivo mezcla tres grafías. */
        tipo_parroquia    text NULL,
        direccion         text NULL,
        referencia_direccion text NULL,

        telefono          text NULL,
        correo            text NULL,
        sitio_web         text NULL,

        estado_registro   text NULL,

        /**
         * A qué tabla pertenece el RUC, resuelto durante el import:
         * 'compania' | 'persona_natural' | 'sociedad_no_supervisada' | 'desconocido'.
         */
        tipo_titular      text NOT NULL DEFAULT 'desconocido',

        row_hash          uuid        NOT NULL,
        primer_job_id     uuid        NULL,
        ultimo_job_id     uuid        NULL,
        ausente_desde_job uuid        NULL,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now()
      )
    `);

    await q.query(`CREATE INDEX idx_turismo_ruc ON turismo_establecimiento (ruc)`);
    await q.query(
      `CREATE INDEX idx_turismo_actividad ON turismo_establecimiento (actividad, clasificacion)`,
    );
    await q.query(
      `CREATE INDEX idx_turismo_ubicacion ON turismo_establecimiento (provincia, canton)`,
    );
    await q.query(`CREATE INDEX idx_turismo_estado ON turismo_establecimiento (estado_registro)`);
    await q.query(`CREATE INDEX idx_turismo_titular ON turismo_establecimiento (tipo_titular)`);
    // Correo y teléfono son la razón comercial de cargar esto: son contactos
    // directos que no están en ninguna otra fuente del proyecto.
    await q.query(
      `CREATE INDEX idx_turismo_correo ON turismo_establecimiento (correo) WHERE correo IS NOT NULL`,
    );
    await q.query(
      `CREATE INDEX idx_turismo_nombre_trgm ON turismo_establecimiento
       USING gin (nombre_comercial gin_trgm_ops)`,
    );

    // -------------------------------------------- exportadores (SRI)
    //
    // Una fila por (catastro, año de aplicación, RUC). El año va en la clave
    // porque el interés está justamente en la serie: un exportador que aparece
    // en 2021 y desaparece en 2024 dejó de exportar, y eso se pierde si cada
    // carga pisa a la anterior.
    await q.query(`
      CREATE TABLE catastro_sri (
        catastro    text     NOT NULL,
        anio        smallint NOT NULL,
        ruc         text     NOT NULL,

        razon_social         text NULL,
        jurisdiccion         text NULL,
        provincia            text NULL,
        tipo_contribuyente   text NULL,
        clase_contribuyente  text NULL,
        obligado_contabilidad boolean NULL,
        /**
         * Ejercicio cuyos datos justificaron la inclusión, que NO es el año de
         * aplicación: el catastro de 2026 se calcula con las ventas de 2025.
         * Sólo los catastros de servicios lo publican.
         */
        anio_fiscal_analizado smallint NULL,

        row_hash          uuid        NOT NULL,
        primer_job_id     uuid        NULL,
        ultimo_job_id     uuid        NULL,
        ausente_desde_job uuid        NULL,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now(),

        PRIMARY KEY (catastro, anio, ruc)
      )
    `);

    await q.query(`CREATE INDEX idx_catastro_sri_ruc ON catastro_sri (ruc)`);
    await q.query(`CREATE INDEX idx_catastro_sri_anio ON catastro_sri (anio, catastro)`);

    // ------------------------------- prestadores de servicios digitales (SRI)
    //
    // Este catastro NO tiene RUC: son proveedores no residentes (Netflix,
    // Spotify, Uber) identificados por el texto con el que aparecen en el
    // estado de cuenta de la tarjeta. Por eso la clave es el nombre y por eso
    // el mismo proveedor aparece varias veces con distinta grafía —"NETFLIX",
    // "Netflix", "netflix"—: cada variante es un patrón de conciliación real,
    // no un duplicado que haya que limpiar.
    await q.query(`
      CREATE TABLE catastro_servicio_digital (
        proveedor    text NOT NULL PRIMARY KEY,
        descripcion  text NULL,
        /** Código numérico de agrupación del SRI (1-10). Sin catálogo publicado. */
        referencia   text NULL,
        marca_servicios_comision text NULL,
        domiciliado_o_ep boolean NULL,
        registrado_sri   boolean NULL,
        fecha_registro     date NULL,
        fecha_fin_registro date NULL,

        row_hash          uuid        NOT NULL,
        primer_job_id     uuid        NULL,
        ultimo_job_id     uuid        NULL,
        ausente_desde_job uuid        NULL,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now()
      )
    `);

    await q.query(
      `CREATE INDEX idx_servicio_digital_trgm ON catastro_servicio_digital
       USING gin (proveedor gin_trgm_ops)`,
    );

    // ------------------------------------ enriquecimiento de los titulares
    //
    // Se materializa durante el import en vez de resolverse con un join por RUC
    // en cada consulta, igual que se hizo con el padrón del SRI. Los años van
    // en un array y no en un booleano: "exportó en 2021 y 2022 pero ya no" es
    // una señal comercial distinta de "no exportó nunca", y un booleano las
    // confunde.
    for (const tabla of this.titulares) {
      await q.query(`
        ALTER TABLE ${tabla}
          ADD COLUMN turismo_registros      smallint NULL,
          ADD COLUMN turismo_actividades    text[]   NULL,
          ADD COLUMN turismo_clasificaciones text[]  NULL,
          ADD COLUMN turismo_ratificado     boolean  NULL,
          ADD COLUMN turismo_job_id         uuid     NULL,
          ADD COLUMN exportador_bienes_iva_anios     smallint[] NULL,
          ADD COLUMN exportador_servicios_iva_anios  smallint[] NULL,
          ADD COLUMN exportador_bienes_ir_anios      smallint[] NULL,
          ADD COLUMN catastros_job_id       uuid     NULL
      `);
      await q.query(
        `CREATE INDEX idx_${tabla}_turismo ON ${tabla} (turismo_registros)
         WHERE turismo_registros IS NOT NULL`,
      );
      // GIN sobre el array: "dame todos los exportadores de 2026" es la
      // consulta que justifica la columna, y sin este índice es un seq scan
      // sobre 7,6 M de filas en `persona_natural`.
      await q.query(
        `CREATE INDEX idx_${tabla}_exp_bienes_iva ON ${tabla}
         USING gin (exportador_bienes_iva_anios)`,
      );
      await q.query(
        `CREATE INDEX idx_${tabla}_exp_servicios_iva ON ${tabla}
         USING gin (exportador_servicios_iva_anios)`,
      );
      await q.query(
        `CREATE INDEX idx_${tabla}_exp_bienes_ir ON ${tabla}
         USING gin (exportador_bienes_ir_anios)`,
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const tabla of this.titulares) {
      await q.query(`ALTER TABLE ${tabla}
        DROP COLUMN IF EXISTS turismo_registros,
        DROP COLUMN IF EXISTS turismo_actividades,
        DROP COLUMN IF EXISTS turismo_clasificaciones,
        DROP COLUMN IF EXISTS turismo_ratificado,
        DROP COLUMN IF EXISTS turismo_job_id,
        DROP COLUMN IF EXISTS exportador_bienes_iva_anios,
        DROP COLUMN IF EXISTS exportador_servicios_iva_anios,
        DROP COLUMN IF EXISTS exportador_bienes_ir_anios,
        DROP COLUMN IF EXISTS catastros_job_id`);
    }
    await q.query(`DROP TABLE IF EXISTS catastro_servicio_digital`);
    await q.query(`DROP TABLE IF EXISTS catastro_sri`);
    await q.query(`DROP TABLE IF EXISTS turismo_establecimiento`);
  }
}
