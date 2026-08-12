import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Presencia digital: sitio web y redes sociales por compañía.
 *
 * ## Nada de esto se da por bueno solo
 *
 * El rastreador NO decide. Todo lo que encuentra entra como **propuesta** y es
 * una persona quien la confirma o la descarta después. Por eso el estado y el
 * autor viven en la misma fila que el valor: sin saber quién puso un dato y si
 * alguien lo miró, un dominio adivinado y uno comprobado por un comercial son
 * indistinguibles, y el segundo es el único que se puede usar para llamar.
 *
 * ## Un canal por fila, no una columna por red
 *
 * `presencia_canal` tiene una fila por (compañía, canal, valor). Podría haber
 * sido una tabla ancha con una columna por red, y sería más cómoda de leer,
 * pero rompe en tres sitios:
 *
 * 1. La auditoría es POR DATO. Si un comercial corrige sólo el Instagram, el
 *    sitio web tiene que seguir constando como propuesta automática. Con
 *    columnas anchas haría falta un `actualizado_por` por columna.
 * 2. Una empresa puede tener DOS cuentas en la misma red (la corporativa y la
 *    de la marca). Con una columna, la segunda se pierde.
 * 3. Añadir una red nueva sería una migración con `ALTER TABLE`. Con filas es
 *    un valor más en el enum.
 *
 * Para leerlo cómodo está la vista `presencia_digital`, que lo pivota a la
 * forma ancha con lo ya confirmado.
 *
 * ## Enriquecer, nunca reemplazar
 *
 * Esto no toca `companias`. La columna `sitio_web` de `perfil_comercial` viene
 * del catastro de turismo y sigue siendo suya: es un dato oficial declarado por
 * el titular, no una conjetura, y mezclarlos borraría esa diferencia.
 */
export class CreateWeb1700000014000 implements MigrationInterface {
  name = 'CreateWeb1700000014000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TYPE web_estado AS ENUM ('pendiente','ok','sin_sitio','error')
    `);

    /**
     * Los canales contemplados.
     *
     * `whatsapp` no es decorativo: en Ecuador es el canal de venta real, y el
     * enlace `wa.me/593…` que casi todas las webs llevan en una esquina trae un
     * móvil que no está en ningún registro público.
     *
     * `otra` es la válvula de escape para que una red nueva no exija migración
     * inmediata; el nombre concreto queda en `nota`.
     */
    await q.query(`
      CREATE TYPE presencia_canal_tipo AS ENUM (
        'web','facebook','instagram','linkedin','tiktok','x','youtube',
        'whatsapp','telegram','otra'
      )
    `);

    // 'propuesto'  — lo encontró el rastreador y nadie lo ha mirado.
    // 'confirmado' — una persona lo dio por bueno. Es lo único fiable.
    // 'descartado' — una persona dijo que no. Se GUARDA, no se borra: si no,
    //                el siguiente rastreo lo vuelve a proponer y el revisor
    //                repite el mismo trabajo cada vez.
    await q.query(`
      CREATE TYPE presencia_revision AS ENUM ('propuesto','confirmado','descartado')
    `);

    // ------------------------------------------------------- lista de trabajo
    //
    // La lista de trabajo y la memoria del avance son la misma tabla, porque el
    // recorrido dura horas y se va a interrumpir. Reanudar es "seguir por los
    // pendientes" en vez de empezar de cero.
    //
    // La clave es el expediente y no el RUC: es la PK de `companias`, y hay
    // compañías sin RUC.
    await q.query(`
      CREATE TABLE web_consulta (
        expediente     text NOT NULL PRIMARY KEY,
        ruc            text NULL,
        estado         web_estado NOT NULL DEFAULT 'pendiente',
        intentos       smallint NOT NULL DEFAULT 0,
        candidatos     smallint NOT NULL DEFAULT 0,
        hallazgos      smallint NOT NULL DEFAULT 0,
        ultimo_error   text NULL,
        revisado_en    timestamptz NULL,
        job_id         uuid NULL,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_web_pendientes ON web_consulta (expediente)
       WHERE estado IN ('pendiente','error')`,
    );

    // ------------------------------------------------------------ candidatos
    //
    // El rastro de lo que se PROBÓ, no de lo que se encontró. Sin esta tabla,
    // un dominio que no aparece es indistinguible de uno que nunca se intentó,
    // y afinar el generador se convierte en adivinar.
    //
    // `motivo` guarda por qué no salió nada ('sin_dns', 'timeout', 'aparcado',
    // 'robots', 'no_html'). Un candidato descartado con su motivo es
    // información; un hueco no lo es.
    await q.query(`
      CREATE TABLE web_candidato (
        expediente   text NOT NULL,
        dominio      text NOT NULL,
        origen       text NOT NULL,
        orden        smallint NOT NULL DEFAULT 0,
        resuelve_dns boolean NULL,
        http_status  smallint NULL,
        url_final    text NULL,
        titulo       text NULL,
        motivo       text NULL,
        revisado_en  timestamptz NULL,
        PRIMARY KEY (expediente, dominio)
      )
    `);
    await q.query(`CREATE INDEX idx_web_candidato_origen ON web_candidato (origen)`);
    // Un mismo dominio propuesto a muchas compañías delata un generador
    // demasiado suelto ("comercial.com.ec"). Es la consulta de control.
    await q.query(`CREATE INDEX idx_web_candidato_dominio ON web_candidato (dominio)`);

    // ------------------------------------------------------------- presencia
    await q.query(`
      CREATE TABLE presencia_canal (
        id             bigserial PRIMARY KEY,
        expediente     text NOT NULL,
        canal          presencia_canal_tipo NOT NULL,
        valor          text NOT NULL,
        handle         text NULL,
        revision       presencia_revision NOT NULL DEFAULT 'propuesto',
        /** 'rastreador' | 'manual' | el importador que lo trajo. */
        fuente         text NOT NULL,
        /**
         * Lo que se sabe a favor del dato, para que el revisor no tenga que
         * empezar de cero: título de la página, si el nombre aparecía en ella,
         * de qué regla salió el dominio. Informativo — no decide nada.
         */
        indicios       jsonb NULL,
        nota           text NULL,
        creado_por     text NOT NULL,
        creado_en      timestamptz NOT NULL DEFAULT now(),
        actualizado_por text NOT NULL,
        actualizado_en  timestamptz NOT NULL DEFAULT now()
      )
    `);
    // Un valor por canal y compañía: dos cuentas distintas en la misma red sí,
    // la misma dos veces no.
    await q.query(
      `CREATE UNIQUE INDEX idx_presencia_unico ON presencia_canal (expediente, canal, valor)`,
    );
    await q.query(`CREATE INDEX idx_presencia_expediente ON presencia_canal (expediente)`);
    // La cola de revisión: lo propuesto y sin mirar. Es la consulta que la
    // pantalla de curación hace todo el rato.
    await q.query(
      `CREATE INDEX idx_presencia_por_revisar ON presencia_canal (canal, creado_en)
       WHERE revision = 'propuesto'`,
    );

    // ---------------------------------------------------------------- eventos
    //
    // Histórico de cambios, con el mismo criterio que `segmento_evento`: lo que
    // se audita es el CAMBIO, no el estado final. "Quién confirmó esto y
    // cuándo" no se puede reconstruir desde una fila que se sobrescribe.
    //
    // No hay clave foránea a `presencia_canal`: si una fila se borra, su
    // historial tiene que sobrevivir — que es justo cuando más se necesita.
    await q.query(`
      CREATE TABLE presencia_evento (
        id          bigserial PRIMARY KEY,
        canal_id    bigint NULL,
        expediente  text NOT NULL,
        canal       presencia_canal_tipo NOT NULL,
        accion      text NOT NULL,
        valor_antes text NULL,
        valor_despues text NULL,
        usuario     text NOT NULL,
        nota        text NULL,
        en          timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX idx_presencia_evento_exp ON presencia_evento (expediente, en DESC)`);
    await q.query(`CREATE INDEX idx_presencia_evento_usuario ON presencia_evento (usuario, en DESC)`);

    // ------------------------------------------------------------------ vista
    //
    // La forma ancha, para pintar una ficha o exportar. **Sólo lo confirmado**:
    // una propuesta sin revisar no debe salir por la misma puerta que un dato
    // comprobado, o la distinción se pierde en cuanto alguien haga un export.
    //
    // Vista normal y no materializada: son decenas de miles de filas, se
    // consulta por expediente y tiene que reflejar la edición al instante.
    await q.query(`
      CREATE VIEW presencia_digital AS
      SELECT expediente,
             max(valor) FILTER (WHERE canal = 'web')       AS web,
             max(valor) FILTER (WHERE canal = 'facebook')  AS facebook,
             max(valor) FILTER (WHERE canal = 'instagram') AS instagram,
             max(valor) FILTER (WHERE canal = 'linkedin')  AS linkedin,
             max(valor) FILTER (WHERE canal = 'tiktok')    AS tiktok,
             max(valor) FILTER (WHERE canal = 'x')         AS x,
             max(valor) FILTER (WHERE canal = 'youtube')   AS youtube,
             max(valor) FILTER (WHERE canal = 'whatsapp')  AS whatsapp,
             max(valor) FILTER (WHERE canal = 'telegram')  AS telegram,
             count(*)::int                                 AS canales,
             max(actualizado_en)                           AS actualizado_en
        FROM presencia_canal
       WHERE revision = 'confirmado'
       GROUP BY expediente
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP VIEW IF EXISTS presencia_digital`);
    await q.query(`DROP TABLE IF EXISTS presencia_evento`);
    await q.query(`DROP TABLE IF EXISTS presencia_canal`);
    await q.query(`DROP TABLE IF EXISTS web_candidato`);
    await q.query(`DROP TABLE IF EXISTS web_consulta`);
    await q.query(`DROP TYPE IF EXISTS presencia_revision`);
    await q.query(`DROP TYPE IF EXISTS presencia_canal_tipo`);
    await q.query(`DROP TYPE IF EXISTS web_estado`);
  }
}
