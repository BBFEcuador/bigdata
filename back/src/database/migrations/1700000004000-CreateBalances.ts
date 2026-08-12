import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Balances de la Superintendencia: la tabla de hechos del proyecto.
 *
 * El archivo viene en formato ANCHO —una fila por compañía, 622 columnas de
 * cuenta— y aquí se guarda en formato LARGO. Copiarlo tal cual dejaría una
 * tabla a 200 columnas del límite duro de Postgres, cada revisión del plan de
 * cuentas sería un `ALTER TABLE` sobre la tabla grande (justo lo que el punto 1
 * de CLAUDE.md prohíbe) y el 89 % de las celdas serían ceros almacenados: sólo
 * el 10,75 % de las celdas del archivo real tienen valor.
 *
 * En formato largo y guardando únicamente los valores distintos de cero son
 * ~10,1 M filas por año. **La ausencia de fila significa cero**, que es
 * exactamente la semántica contable.
 *
 * ## Por qué existe la columna `formulario`
 *
 * El sufijo de los archivos (`balances_2023_1`, `balances_2023_2`) NO es el
 * período: es el TIPO DE FORMULARIO, y cada formulario trae su propio plan de
 * cuentas. El 1 son las 622 cuentas del catálogo IFRS; el 2 son 925 cuentas de
 * otra naturaleza.
 *
 * Y los códigos COLISIONAN con significados distintos. Comprobado sobre los
 * archivos reales, 33 códigos aparecen en ambos catálogos, entre ellos:
 *
 *     código 3   ->  formulario 1: PATRIMONIO NETO
 *                    formulario 2: ACTIVO CON PARTES RELACIONADAS LOCALES
 *
 * Sin esta columna en la clave, la cuenta `3` de una empresa sería patrimonio o
 * activo según el archivo del que vino, sin forma de distinguirlo. Un SUM()
 * sobre esa mezcla devuelve un número perfectamente plausible y falso.
 *
 * Hoy sólo se carga el formulario 1. La columna está desde el principio porque
 * añadirla después, con 10 M de filas por año y siendo parte de la clave
 * primaria, obliga a reescribir la tabla entera.
 */
export class CreateBalances1700000004000 implements MigrationInterface {
  name = 'CreateBalances1700000004000';

  public async up(q: QueryRunner): Promise<void> {
    // ---------------------------------------------------------------- balance
    //
    // Cabecera: una fila por compañía y año. Existe separada del detalle porque
    // los seis campos de identidad se repetirían en 622 filas, y porque
    // `ciiu`/`rama_actividad` son el valor DECLARADO ESE AÑO, que no tiene por
    // qué coincidir con el `ciiu_nivel_6` actual de `companias`. Con histórico
    // cargado, esa distinción es información, no ruido.
    await q.query(`
      CREATE TABLE balance (
        anio              smallint NOT NULL,
        formulario        smallint NOT NULL,
        expediente        text     NOT NULL,
        ruc               text     NULL,
        nombre            text     NULL,
        rama_actividad    text     NULL,
        descripcion_rama  text     NULL,
        ciiu              text     NULL,

        row_hash          uuid        NOT NULL,
        primer_job_id     uuid        NULL,
        ultimo_job_id     uuid        NULL,
        ausente_desde_job uuid        NULL,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now(),

        PRIMARY KEY (anio, formulario, expediente)
      )
    `);

    // SIN clave foránea a companias(expediente), a propósito.
    //
    // Medido sobre el archivo real: 1.629 de las 151.674 compañías que presentan
    // balance NO están en el directorio de compañías (y tampoco aparecen por
    // RUC: son ausencias reales, no un fallo de enlace). Una FK abortaría la
    // carga de esas filas. Perderlas sesgaría la muestra justo por el lado de
    // las empresas menos documentadas, así que se cargan y el importador deja
    // el recuento de huérfanas en `import_job.avisos`.
    await q.query(`CREATE INDEX idx_balance_expediente ON balance (expediente)`);
    await q.query(`CREATE INDEX idx_balance_ruc ON balance (ruc)`);
    await q.query(`CREATE INDEX idx_balance_anio_rama ON balance (anio, rama_actividad)`);

    // -------------------------------------------------------- balance_cuenta
    //
    // Particionada por año desde el principio aunque hoy sólo haya 2025: con
    // ~10 M filas por año, convertir después una tabla no particionada en
    // particionada obliga a reescribirla entera. Además recargar un año pasa a
    // ser DETACH + carga, sin tocar el resto, y toda consulta filtra por año.
    //
    // Las particiones NO se crean aquí: las crea el importador bajo demanda
    // (`crearParticionSql`), porque los años que se van a cargar no se conocen
    // en tiempo de migración.
    await q.query(`
      CREATE TABLE balance_cuenta (
        anio          smallint      NOT NULL,
        formulario    smallint      NOT NULL,
        expediente    text          NOT NULL,
        codigo_cuenta text          NOT NULL,
        valor         numeric(18,2) NOT NULL,

        PRIMARY KEY (anio, formulario, expediente, codigo_cuenta)
      ) PARTITION BY LIST (anio)
    `);

    // Tampoco lleva FK a categoria_cuenta ni a balance. No es dejadez: una FK
    // dispara un trigger POR FILA, y aquí son 10 M por carga. La integridad se
    // impone en el merge, que es set-based: el INSERT ... SELECT hace join
    // contra `categoria_cuenta` y `balance`, y lo que no casa se registra como
    // rechazo en vez de entrar. Mismo resultado, un hash join en lugar de
    // 10 millones de comprobaciones.

    // "Las 500 empresas con más ingresos de 2025" sin recorrer la partición.
    await q.query(
      `CREATE INDEX idx_balance_cuenta_cuenta_valor ON balance_cuenta (anio, codigo_cuenta, valor DESC)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    // Basta con soltar el padre: las particiones caen con él.
    await q.query(`DROP TABLE IF EXISTS balance_cuenta`);
    await q.query(`DROP TABLE IF EXISTS balance`);
  }
}
