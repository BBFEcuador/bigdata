import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `categoria_cuenta` pasa a tener un plan de cuentas por formulario.
 *
 * Hasta ahora la tabla guardaba un único plan —el IFRS de 622 cuentas— con
 * `codigo` como clave. Eso deja de valer en cuanto entra un segundo formulario:
 * los códigos se repiten entre planes con significados distintos.
 *
 *     código 3     formulario 1: PATRIMONIO NETO
 *                  formulario 3: ACTIVO CON PARTES RELACIONADAS LOCALES
 *     código 1030  formulario 1: (no existe)
 *                  formulario 3: TOTAL GASTOS OPERACIONALES
 *
 * Con `codigo` como PK, cargar el catálogo del formulario 3 habría sobrescrito
 * el nombre de 33 cuentas del IFRS. El detalle de un balance mostraría la
 * descripción del otro formulario, sin ningún error.
 *
 * Todo lo cargado hasta hoy es del formulario 1, así que el DEFAULT 1 rellena
 * las 622 filas existentes correctamente.
 */
export class CatalogoPorFormulario1700000005000 implements MigrationInterface {
  name = 'CatalogoPorFormulario1700000005000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE categoria_cuenta ADD COLUMN formulario smallint NOT NULL DEFAULT 1`,
    );

    // La PK pasa a ser compuesta. La tabla tiene ~600 filas: reescribirla no
    // cuesta nada, a diferencia de lo que pasaría en `balance_cuenta`.
    await q.query(`ALTER TABLE categoria_cuenta DROP CONSTRAINT categoria_cuenta_pkey`);
    await q.query(
      `ALTER TABLE categoria_cuenta ADD CONSTRAINT categoria_cuenta_pkey PRIMARY KEY (formulario, codigo)`,
    );

    // El índice del padre también es por formulario: la jerarquía de un plan no
    // tiene nada que ver con la del otro.
    await q.query(`DROP INDEX IF EXISTS idx_categoria_cuenta_padre`);
    await q.query(
      `CREATE INDEX idx_categoria_cuenta_padre ON categoria_cuenta (formulario, codigo_padre)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    // Sólo puede revertirse si no queda más de un plan cargado: con dos, volver
    // a una PK de `codigo` a secas fallaría por duplicados.
    await q.query(`DELETE FROM categoria_cuenta WHERE formulario <> 1`);
    await q.query(`DROP INDEX IF EXISTS idx_categoria_cuenta_padre`);
    await q.query(`ALTER TABLE categoria_cuenta DROP CONSTRAINT categoria_cuenta_pkey`);
    await q.query(
      `ALTER TABLE categoria_cuenta ADD CONSTRAINT categoria_cuenta_pkey PRIMARY KEY (codigo)`,
    );
    await q.query(`CREATE INDEX idx_categoria_cuenta_padre ON categoria_cuenta (codigo_padre)`);
    await q.query(`ALTER TABLE categoria_cuenta DROP COLUMN formulario`);
  }
}
