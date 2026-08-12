import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Capa comercial: perfil por sujeto, segmentos y catálogo de productos.
 *
 * ## Por qué el segmento no vive dentro del producto
 *
 * La tentación es colgar la consulta de cada producto ("los prospectos de
 * Registro de Marca son X"). Se rompe en cuanto un mismo criterio alimenta a
 * varios productos, que es el caso real: a una compañía recién creada se le
 * ofrece FRIDAY, contabilidad, marketing, web y registro de marca — cinco
 * productos, una sola definición. Si cada uno trae sus datos, esa definición se
 * escribe cinco veces y el día que "reciente" pase de 12 a 18 meses cambiará en
 * cuatro sitios y en uno no.
 *
 * Aquí el segmento es la unidad reutilizable y el producto lo consume.
 *
 * ## Por qué las definiciones son SQL y viven en migraciones
 *
 * `segmento.condicion` es un fragmento SQL que se interpola en un WHERE. Eso
 * sería una puerta abierta si viniera del cliente, así que **no viene**: el API
 * sólo acepta identificadores de segmento, y las condiciones se versionan aquí,
 * revisadas como cualquier otro código. A cambio se puede expresar lo que un
 * constructor de filtros no expresa — "sus activos cruzaron el medio millón
 * entre su último cierre y el anterior" no sale de una lista de casillas.
 *
 * ## Por qué hay miembros y además eventos
 *
 * La lista completa de un segmento se mira una vez. Lo que se trabaja a diario
 * son las **altas**: quién entró desde la última corrida. Por eso se guarda la
 * pertenencia actual (`segmento_miembro`) y el histórico de entradas y salidas
 * (`segmento_evento`), en vez de una foto completa por corrida que crecería sin
 * aportar nada.
 */
export class CreatePerfilYSegmentos1700000009000 implements MigrationInterface {
  name = 'CreatePerfilYSegmentos1700000009000';

  public async up(q: QueryRunner): Promise<void> {
    // ------------------------------------------------------ perfil_comercial
    //
    // Una fila por sujeto, con lo caro ya calculado. Es una vista
    // materializada y no una tabla mantenida a mano porque se deriva entera de
    // las tablas de origen: reconstruirla cuesta ~30 s sobre 7,1 M de sujetos,
    // y así no puede quedar desincronizada por un import que se olvide de
    // actualizarla.
    //
    // NO se guarda nada relativo a "hoy" —edad en meses, antigüedad— porque en
    // una vista materializada eso envejece hasta ser mentira. Se guarda la
    // fecha y es el segmento el que la compara contra `current_date`.
    //
    // La clave es (tipo_sujeto, clave) y no el RUC: hay compañías sin RUC, y
    // ocho RUC que apuntan a dos expedientes. `clave` es el expediente para las
    // compañías y el RUC para las otras dos poblaciones.
    await q.query(`
      CREATE MATERIALIZED VIEW perfil_comercial AS
      WITH ejercicios AS (
        SELECT expediente, anio,
               row_number() OVER (PARTITION BY expediente ORDER BY anio DESC) AS r
        FROM balance WHERE formulario = 1 AND ausente_desde_job IS NULL
      ),
      val AS (
        SELECT d.expediente, d.r, d.anio,
               max(bc.valor) FILTER (WHERE bc.codigo_cuenta = '1')   AS activos,
               max(bc.valor) FILTER (WHERE bc.codigo_cuenta = '401') AS ingresos,
               max(bc.valor) FILTER (WHERE bc.codigo_cuenta = '3')   AS patrimonio,
               max(bc.valor) FILTER (WHERE bc.codigo_cuenta = '707') AS utilidad
        FROM (SELECT * FROM ejercicios WHERE r <= 2) d
        JOIN balance_cuenta bc
          ON bc.expediente = d.expediente AND bc.anio = d.anio AND bc.formulario = 1
         AND bc.codigo_cuenta IN ('1','401','3','707')
        GROUP BY d.expediente, d.r, d.anio
      ),
      /**
       * Los dos últimos ejercicios CON balance, no dos años fijos. Comparar
       * "2025 contra 2024" a pelo daría nulo para quien presentó 2025 y 2023,
       * que sí tiene una variación que interesa. Los años quedan en
       * "anio_ult" / "anio_prev" para el segmento que necesite fijarlos.
       */
      fin AS (
        SELECT expediente,
               max(anio)       FILTER (WHERE r = 1) AS anio_ult,
               max(activos)    FILTER (WHERE r = 1) AS activos_ult,
               max(ingresos)   FILTER (WHERE r = 1) AS ingresos_ult,
               max(patrimonio) FILTER (WHERE r = 1) AS patrimonio_ult,
               max(utilidad)   FILTER (WHERE r = 1) AS utilidad_ult,
               max(anio)       FILTER (WHERE r = 2) AS anio_prev,
               max(activos)    FILTER (WHERE r = 2) AS activos_prev,
               max(ingresos)   FILTER (WHERE r = 2) AS ingresos_prev
        FROM val GROUP BY expediente
      ),
      /** El local de menor número es la matriz: de ahí sale la actividad. */
      local_principal AS (
        SELECT DISTINCT ON (ruc) ruc, codigo_ciiu, actividad, provincia, canton
        FROM establecimiento
        ORDER BY ruc, numero
      ),
      /** Hoy el catastro de turismo es la única fuente de correo directo. */
      contacto_turismo AS (
        SELECT DISTINCT ON (ruc) ruc, correo, telefono, sitio_web
        FROM turismo_establecimiento
        WHERE ausente_desde_job IS NULL AND (correo IS NOT NULL OR telefono IS NOT NULL)
        ORDER BY ruc, (correo IS NULL), numero_registro
      )
      SELECT
        'compania'::text AS tipo_sujeto,
        c.expediente     AS clave,
        c.ruc, c.expediente, c.nombre,
        replace(c.ciiu_nivel_6, '.', '') AS ciiu6,
        left(c.ciiu_nivel_6, 1)          AS ciiu_seccion,
        c.provincia, c.canton,
        c.situacion_legal,
        c.sri_estado_contribuyente  AS estado_sri,
        c.sri_clase_contribuyente   AS clase_sri,
        c.sri_obligado_contabilidad AS obligado_contabilidad,
        c.fecha_constitucion,
        c.sri_num_establecimientos  AS num_establecimientos,
        f.anio_ult, f.activos_ult, f.ingresos_ult, f.patrimonio_ult, f.utilidad_ult,
        f.anio_prev, f.activos_prev, f.ingresos_prev,
        coalesce(c.telefono, ct.telefono) AS telefono,
        ct.correo, ct.sitio_web,
        c.turismo_registros, c.turismo_ratificado,
        c.exportador_bienes_ir_anios,
        c.exportador_bienes_iva_anios,
        c.exportador_servicios_iva_anios
      FROM companias c
      LEFT JOIN fin f ON f.expediente = c.expediente
      LEFT JOIN contacto_turismo ct ON ct.ruc = c.ruc
      WHERE c.ausente_desde_job IS NULL

      UNION ALL

      SELECT
        'persona_natural', p.ruc, p.ruc, NULL, p.razon_social,
        replace(coalesce(lp.codigo_ciiu, ''), '.', ''), left(lp.codigo_ciiu, 1),
        lp.provincia, lp.canton,
        NULL, p.estado_contribuyente, p.clase_contribuyente, p.obligado_contabilidad,
        NULL, p.num_establecimientos,
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
        ct.telefono, ct.correo, ct.sitio_web,
        p.turismo_registros, p.turismo_ratificado,
        p.exportador_bienes_ir_anios, p.exportador_bienes_iva_anios,
        p.exportador_servicios_iva_anios
      FROM persona_natural p
      LEFT JOIN local_principal lp ON lp.ruc = p.ruc
      LEFT JOIN contacto_turismo ct ON ct.ruc = p.ruc
      WHERE p.ausente_desde_job IS NULL

      UNION ALL

      SELECT
        'sociedad_no_supervisada', s.ruc, s.ruc, NULL, s.razon_social,
        replace(coalesce(lp.codigo_ciiu, ''), '.', ''), left(lp.codigo_ciiu, 1),
        lp.provincia, lp.canton,
        NULL, s.estado_contribuyente, s.clase_contribuyente, s.obligado_contabilidad,
        NULL, s.num_establecimientos,
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
        ct.telefono, ct.correo, ct.sitio_web,
        s.turismo_registros, s.turismo_ratificado,
        s.exportador_bienes_ir_anios, s.exportador_bienes_iva_anios,
        s.exportador_servicios_iva_anios
      FROM sociedad_no_supervisada s
      LEFT JOIN local_principal lp ON lp.ruc = s.ruc
      LEFT JOIN contacto_turismo ct ON ct.ruc = s.ruc
      WHERE s.ausente_desde_job IS NULL
    `);

    // El índice único no es opcional: sin él no se puede refrescar la vista
    // con CONCURRENTLY, y sin CONCURRENTLY el refresco bloquea las consultas
    // durante los 30 segundos que tarda.
    await q.query(
      `CREATE UNIQUE INDEX idx_perfil_pk ON perfil_comercial (tipo_sujeto, clave)`,
    );
    // `text_pattern_ops` es lo que hace que `ciiu6 LIKE 'M6920%'` use el índice
    // en vez de recorrer 7,1 M de filas: la base no está en collation C.
    await q.query(
      `CREATE INDEX idx_perfil_ciiu ON perfil_comercial (ciiu6 text_pattern_ops)`,
    );
    await q.query(`CREATE INDEX idx_perfil_estado ON perfil_comercial (estado_sri)`);
    await q.query(`CREATE INDEX idx_perfil_provincia ON perfil_comercial (provincia, canton)`);
    await q.query(
      `CREATE INDEX idx_perfil_constitucion ON perfil_comercial (fecha_constitucion)
       WHERE fecha_constitucion IS NOT NULL`,
    );
    await q.query(
      `CREATE INDEX idx_perfil_ingresos ON perfil_comercial (ingresos_ult)
       WHERE ingresos_ult IS NOT NULL`,
    );
    await q.query(
      `CREATE INDEX idx_perfil_activos ON perfil_comercial (activos_ult)
       WHERE activos_ult IS NOT NULL`,
    );
    await q.query(`CREATE INDEX idx_perfil_ruc ON perfil_comercial (ruc)`);

    // ---------------------------------------------------- unidades y productos
    await q.query(`
      CREATE TABLE unidad_negocio (
        codigo      text PRIMARY KEY,
        nombre      text NOT NULL,
        descripcion text NULL,
        orden       smallint NOT NULL DEFAULT 0
      )
    `);

    await q.query(`
      CREATE TABLE producto (
        codigo      text PRIMARY KEY,
        unidad      text NOT NULL REFERENCES unidad_negocio(codigo) ON DELETE CASCADE,
        nombre      text NOT NULL,
        descripcion text NULL,
        activo      boolean NOT NULL DEFAULT true
      )
    `);
    await q.query(`CREATE INDEX idx_producto_unidad ON producto (unidad)`);

    // ------------------------------------------------------------- segmentos
    await q.query(`
      CREATE TABLE segmento (
        codigo      text PRIMARY KEY,
        nombre      text NOT NULL,
        descripcion text NULL,
        /**
         * Fragmento SQL booleano sobre "perfil_comercial p". NUNCA llega desde
         * el API: se versiona en migraciones y se revisa como código.
         */
        condicion   text NOT NULL,
        /** Un segmento inactivo se muestra pero no se corre: le faltan datos. */
        activo      boolean NOT NULL DEFAULT true,
        /** Por qué está inactivo, para que el hueco se vea en la herramienta. */
        bloqueo     text NULL,
        creado_en   timestamptz NOT NULL DEFAULT now()
      )
    `);

    await q.query(`
      CREATE TABLE producto_segmento (
        producto  text NOT NULL REFERENCES producto(codigo) ON DELETE CASCADE,
        segmento  text NOT NULL REFERENCES segmento(codigo) ON DELETE CASCADE,
        prioridad smallint NOT NULL DEFAULT 50,
        PRIMARY KEY (producto, segmento)
      )
    `);
    await q.query(`CREATE INDEX idx_producto_segmento_seg ON producto_segmento (segmento)`);

    await q.query(`
      CREATE TABLE segmento_corrida (
        id          bigserial PRIMARY KEY,
        segmento    text NOT NULL REFERENCES segmento(codigo) ON DELETE CASCADE,
        ejecutado_en timestamptz NOT NULL DEFAULT now(),
        total       integer NOT NULL,
        altas       integer NOT NULL,
        bajas       integer NOT NULL,
        duracion_ms integer NOT NULL
      )
    `);
    await q.query(
      `CREATE INDEX idx_corrida_segmento ON segmento_corrida (segmento, ejecutado_en DESC)`,
    );

    /** Pertenencia ACTUAL. La foto completa por corrida crecería sin aportar. */
    await q.query(`
      CREATE TABLE segmento_miembro (
        segmento     text NOT NULL REFERENCES segmento(codigo) ON DELETE CASCADE,
        tipo_sujeto  text NOT NULL,
        clave        text NOT NULL,
        desde        timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (segmento, tipo_sujeto, clave)
      )
    `);
    await q.query(`CREATE INDEX idx_miembro_sujeto ON segmento_miembro (tipo_sujeto, clave)`);

    /** Entradas y salidas: es lo que se trabaja a diario. */
    await q.query(`
      CREATE TABLE segmento_evento (
        id          bigserial PRIMARY KEY,
        segmento    text NOT NULL REFERENCES segmento(codigo) ON DELETE CASCADE,
        tipo_sujeto text NOT NULL,
        clave       text NOT NULL,
        tipo        text NOT NULL CHECK (tipo IN ('alta','baja')),
        corrida     bigint NULL REFERENCES segmento_corrida(id) ON DELETE SET NULL,
        ocurrido_en timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_evento_segmento ON segmento_evento (segmento, ocurrido_en DESC)`,
    );

    /**
     * Estado comercial del sujeto, transversal a todos los segmentos.
     *
     * Sin esto, el mismo prospecto recibe cinco llamadas de cinco unidades
     * distintas en la misma semana. Se aplica al pedir la lista de trabajo, no
     * al calcular el segmento: los conteos deben seguir diciendo la verdad
     * sobre el mercado.
     */
    await q.query(`
      CREATE TABLE sujeto_estado_comercial (
        tipo_sujeto   text NOT NULL,
        clave         text NOT NULL,
        estado        text NOT NULL CHECK (estado IN ('cliente','en_gestion','no_contactar')),
        nota          text NULL,
        actualizado_en timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tipo_sujeto, clave)
      )
    `);
    await q.query(`CREATE INDEX idx_estado_comercial ON sujeto_estado_comercial (estado)`);

    // ------------------------------------------------------------- catálogo
    await q.query(`
      INSERT INTO unidad_negocio (codigo, nombre, descripcion, orden) VALUES
        ('friday',      'FRIDAY',           'Plataforma de datos y análisis empresarial', 1),
        ('auditoria',   'Auditoría',        'Auditoría externa y aseguramiento',          2),
        ('contabilidad','Contabilidad',     'Contabilidad y cumplimiento tributario',     3),
        ('talento',     'Talento Humano',   'Nómina, selección y gestión de personal',    4),
        ('marca',       'Registro de Marca','Propiedad intelectual y signos distintivos', 5),
        ('marketing',   'Marketing',        'Marketing digital y estrategia comercial',   6),
        ('web',         'Creación Web',     'Sitios web y presencia digital',             7)
    `);

    await q.query(`
      INSERT INTO producto (codigo, unidad, nombre, descripcion) VALUES
        ('friday_suscripcion','friday',      'Suscripción FRIDAY',    'Acceso a la base y al análisis financiero'),
        ('auditoria_externa', 'auditoria',   'Auditoría externa',     'Auditoría de estados financieros'),
        ('contabilidad_mes',  'contabilidad','Contabilidad mensual',  'Llevado de contabilidad y declaraciones'),
        ('nomina',            'talento',     'Gestión de nómina',     'Nómina, roles y obligaciones laborales'),
        ('registro_marca',    'marca',       'Registro de marca',     'Búsqueda y registro ante el SENADI'),
        ('marketing_digital', 'marketing',   'Marketing digital',     'Estrategia y campañas'),
        ('sitio_web',         'web',         'Sitio web',             'Diseño y publicación del sitio')
    `);

    // ------------------------------------------------------- segmentos base
    //
    // Los cuatro primeros son consultables con los datos que hay hoy. El
    // quinto se deja registrado e inactivo a propósito: así el hueco de datos
    // se ve dentro de la herramienta en vez de vivir en la cabeza de alguien.
    await q.query(`
      INSERT INTO segmento (codigo, nombre, descripcion, condicion, activo, bloqueo) VALUES
        (
          'contadores',
          'Contadores y auditores en actividad',
          'Compañías y personas naturales cuya actividad principal es contabilidad, auditoría o asesoría fiscal (CIIU M6920), con RUC activo en el SRI.',
          $$p.ciiu6 LIKE 'M6920%' AND p.estado_sri = 'ACTIVO'$$,
          true, NULL
        ),
        (
          'companias_recien_creadas',
          'Compañías creadas en los últimos 12 meses',
          'Constituidas hace menos de un año y vigentes. Alimenta a cinco productos a la vez: es el caso que justifica separar segmento de producto.',
          $$p.tipo_sujeto = 'compania'
            AND p.fecha_constitucion >= (current_date - interval '12 months')$$,
          true, NULL
        ),
        (
          'salto_umbral_auditoria',
          'Cruzaron el medio millón en activos',
          'Sus activos pasaron de 500.000 o menos en el ejercicio anterior a más de 500.000 en el último. Es el momento en que aparece la obligación de auditoría externa.',
          $$p.activos_ult > 500000 AND coalesce(p.activos_prev, 0) <= 500000$$,
          true, NULL
        ),
        (
          'pymes_por_ingresos',
          'Pequeñas y medianas por ingresos',
          'Ingresos del último ejercicio entre 300.001 y 5.000.000. Es la clasificación por facturación; la oficial añade número de empleados, que todavía no está en la base.',
          $$p.ingresos_ult > 300000 AND p.ingresos_ult <= 5000000$$,
          true, NULL
        ),
        (
          'pymes_con_mas_de_5_empleados',
          'PYME con más de 5 empleados',
          'Pequeñas y medianas con nómina de más de cinco personas.',
          $$p.ingresos_ult > 300000 AND p.ingresos_ult <= 5000000$$,
          false,
          'Falta el número de empleados: sólo lo aporta DataPortal, cuya carga todavía no ha corrido. La condición guardada cubre el tramo de ingresos; falta añadirle la nómina.'
        )
    `);

    await q.query(`
      INSERT INTO producto_segmento (producto, segmento, prioridad) VALUES
        ('friday_suscripcion', 'contadores', 10),
        ('auditoria_externa',  'contadores', 20),
        ('auditoria_externa',  'salto_umbral_auditoria', 10),
        ('friday_suscripcion', 'companias_recien_creadas', 10),
        ('contabilidad_mes',   'companias_recien_creadas', 20),
        ('registro_marca',     'companias_recien_creadas', 30),
        ('sitio_web',          'companias_recien_creadas', 40),
        ('marketing_digital',  'companias_recien_creadas', 50),
        ('nomina',             'pymes_por_ingresos', 20),
        ('nomina',             'pymes_con_mas_de_5_empleados', 10)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS sujeto_estado_comercial`);
    await q.query(`DROP TABLE IF EXISTS segmento_evento`);
    await q.query(`DROP TABLE IF EXISTS segmento_miembro`);
    await q.query(`DROP TABLE IF EXISTS segmento_corrida`);
    await q.query(`DROP TABLE IF EXISTS producto_segmento`);
    await q.query(`DROP TABLE IF EXISTS segmento`);
    await q.query(`DROP TABLE IF EXISTS producto`);
    await q.query(`DROP TABLE IF EXISTS unidad_negocio`);
    await q.query(`DROP MATERIALIZED VIEW IF EXISTS perfil_comercial`);
  }
}
