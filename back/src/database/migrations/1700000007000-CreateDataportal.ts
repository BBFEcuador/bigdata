import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enriquecimiento desde DataPortal: contacto, nómina y bienes por RUC.
 *
 * ## Enriquecer, nunca reemplazar
 *
 * Todo lo que llega del portal vive en sus propias tablas `dataportal_*`. Nada
 * sobrescribe `companias` ni `persona_natural`: la razón social buena es la de
 * la Superintendencia, y el portal la devuelve además con la codificación rota.
 * Lo que aporta es lo que no teníamos — correos, móviles, nómina con sueldos y
 * vehículos.
 *
 * ## Por qué se guarda el JSON crudo
 *
 * `dataportal_consulta.payload` conserva la respuesta literal de los cinco
 * endpoints. Recorrer las 226.191 compañías son ~1,13 M de peticiones y unas
 * 31 horas; reparsear lo ya descargado son segundos. Si un campo se modela mal
 * —y el portal tiene trampas: `subClassName` contiene un correo, y el tipo de
 * contacto es un código numérico sin catálogo conocido— se corrige el parser y
 * se vuelve a derivar sin pedir nada otra vez.
 *
 * ## Por qué el estado por RUC vive en la base
 *
 * Una carga de 31 horas se va a interrumpir: caducará el token, se cortará la
 * red o se reiniciará el proceso. `dataportal_consulta` es la lista de trabajo
 * y la memoria del avance a la vez, así que reanudar es "seguir por los
 * pendientes" en lugar de empezar de cero.
 */
export class CreateDataportal1700000007000 implements MigrationInterface {
  name = 'CreateDataportal1700000007000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TYPE dataportal_estado AS ENUM ('pendiente','ok','sin_datos','error')
    `);

    await q.query(`
      CREATE TABLE dataportal_consulta (
        ruc            text NOT NULL PRIMARY KEY,
        estado         dataportal_estado NOT NULL DEFAULT 'pendiente',
        intentos       smallint NOT NULL DEFAULT 0,
        ultimo_error   text NULL,
        http_status    smallint NULL,
        payload        jsonb NULL,
        consultado_en  timestamptz NULL,
        job_id         uuid NULL,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Índice parcial sobre lo pendiente: es la consulta que el worker hace
    // miles de veces, y sobre 226.191 filas un recorrido completo por lote
    // sería el cuello de botella en vez de la red.
    await q.query(
      `CREATE INDEX idx_dataportal_pendientes ON dataportal_consulta (ruc)
       WHERE estado IN ('pendiente','error')`,
    );

    // ------------------------------------------------------------- empresa
    await q.query(`
      CREATE TABLE dataportal_empresa (
        ruc                  text NOT NULL PRIMARY KEY,
        razon_social         text NULL,
        nombre_comercial     text NULL,
        nombre_comercial_2   text NULL,
        estado_contribuyente text NULL,
        fecha_inicio         date NULL,
        fecha_suspension     date NULL,
        actividad_economica  text NULL,
        provincia            text NULL,
        direccion            text NULL,
        telefono             text NULL,
        /** Derivado del número de filas de nómina, no lo devuelve la API. */
        num_empleados        integer NOT NULL DEFAULT 0,
        /** Suma de los sueldos de la nómina: dimensiona la empresa mejor que el conteo. */
        masa_salarial        numeric(14,2) NULL,
        actualizado_en       timestamptz NOT NULL DEFAULT now()
      )
    `);

    // ------------------------------------------------------------ contacto
    //
    // `tipo_codigo` se guarda tal cual lo devuelve la API (8 = móvil, 3 =
    // correo son los únicos observados; no hay catálogo publicado). `tipo` es
    // la clasificación propia, deducida del contenido, que es lo que se
    // consulta. Si mañana aparece un código nuevo, el dato ya está guardado.
    await q.query(`
      CREATE TABLE dataportal_contacto (
        ruc         text NOT NULL,
        valor       text NOT NULL,
        tipo        text NOT NULL,
        tipo_codigo text NULL,
        PRIMARY KEY (ruc, valor)
      )
    `);
    await q.query(`CREATE INDEX idx_dataportal_contacto_tipo ON dataportal_contacto (tipo)`);
    await q.query(
      `CREATE INDEX idx_dataportal_contacto_valor ON dataportal_contacto (valor)`,
    );

    // -------------------------------------------------------------- nómina
    //
    // Datos personales: nombre, cédula y sueldo de personas físicas. Tabla
    // aparte y con su propio índice por cédula, que es como se localiza al
    // gerente de una compañía.
    await q.query(`
      CREATE TABLE dataportal_nomina (
        ruc           text NOT NULL,
        cedula        text NOT NULL,
        nombre        text NULL,
        ocupacion     text NULL,
        sueldo        numeric(12,2) NULL,
        fecha_ingreso date NULL,
        PRIMARY KEY (ruc, cedula)
      )
    `);
    await q.query(`CREATE INDEX idx_dataportal_nomina_cedula ON dataportal_nomina (cedula)`);
    // El gerente se busca por ocupación, y es la consulta que da valor comercial.
    await q.query(
      `CREATE INDEX idx_dataportal_nomina_ocupacion ON dataportal_nomina (ocupacion)`,
    );

    // ------------------------------------------------------------ vehículos
    await q.query(`
      CREATE TABLE dataportal_vehiculo (
        ruc                text NOT NULL,
        placa              text NOT NULL,
        tipo               text NULL,
        marca              text NULL,
        modelo             text NULL,
        anio               smallint NULL,
        cilindraje         integer NULL,
        avaluo             numeric(14,2) NULL,
        ciudad             text NULL,
        fecha_matricula    date NULL,
        anio_pago          smallint NULL,
        PRIMARY KEY (ruc, placa)
      )
    `);
    await q.query(`CREATE INDEX idx_dataportal_vehiculo_ruc ON dataportal_vehiculo (ruc)`);

    // ----------------------------------------------------------- propiedades
    //
    // El endpoint devolvió 404 en la empresa de prueba, así que su forma real
    // aún no se ha visto. Se guarda como jsonb hasta tener un caso con datos:
    // inventar columnas sobre una estructura que no se ha observado es como se
    // acaba con la mitad vacías y las que importan fuera.
    await q.query(`
      CREATE TABLE dataportal_propiedad (
        id     bigserial PRIMARY KEY,
        ruc    text NOT NULL,
        datos  jsonb NOT NULL
      )
    `);
    await q.query(`CREATE INDEX idx_dataportal_propiedad_ruc ON dataportal_propiedad (ruc)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS dataportal_propiedad`);
    await q.query(`DROP TABLE IF EXISTS dataportal_vehiculo`);
    await q.query(`DROP TABLE IF EXISTS dataportal_nomina`);
    await q.query(`DROP TABLE IF EXISTS dataportal_contacto`);
    await q.query(`DROP TABLE IF EXISTS dataportal_empresa`);
    await q.query(`DROP TABLE IF EXISTS dataportal_consulta`);
    await q.query(`DROP TYPE IF EXISTS dataportal_estado`);
  }
}
