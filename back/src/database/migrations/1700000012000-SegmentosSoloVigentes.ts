import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Regla de negocio: un segmento comercial sólo contiene sujetos VIGENTES.
 *
 * No se puede vender a una empresa en liquidación ni a un RUC suspendido, así
 * que la exclusión no es un filtro más: es una condición que se cumple siempre.
 * Por eso NO se copia en la condición de cada segmento —donde se olvidaría al
 * escribir el siguiente— sino que la aplica el servicio al calcular la
 * pertenencia. La definición vive en `REGLA_VIGENCIA`, en
 * `segmentos.service.ts`.
 *
 * Esta migración hace dos cosas:
 *
 * 1. Añade `incluye_inactivos`, la única forma de saltarse la regla. Es una
 *    excepción declarada y visible —una campaña de reactivación de RUC
 *    suspendidos es un caso legítimo—, no algo que ocurra por descuido.
 *
 * 2. Limpia el `estado_sri = 'ACTIVO'` que llevaban cuatro condiciones. Ahora
 *    es redundante, y dejarlo haría dudar de si la regla es global o de cada
 *    segmento. Cada condición debe expresar SÓLO lo que la distingue.
 */
export class SegmentosSoloVigentes1700000012000 implements MigrationInterface {
  name = 'SegmentosSoloVigentes1700000012000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE segmento
        ADD COLUMN incluye_inactivos boolean NOT NULL DEFAULT false
    `);

    await q.query(`COMMENT ON COLUMN segmento.incluye_inactivos IS
      'Excepción declarada a la regla de vigencia. Sólo para campañas que buscan justamente a los inactivos.'`);

    // La condición se queda con lo suyo; la vigencia la pone el servicio.
    await q.query(`
      UPDATE segmento SET condicion = $$p.ciiu6 LIKE 'M6920%'$$
       WHERE codigo = 'contadores'
    `);
    await q.query(`
      UPDATE segmento
         SET condicion = $$p.tipo_sujeto = 'persona_natural' AND p.obligado_contabilidad IS TRUE$$
       WHERE codigo = 'personas_obligadas_contabilidad'
    `);
    await q.query(`
      UPDATE segmento
         SET condicion = $$p.tipo_sujeto = 'persona_natural'
                          AND p.obligado_contabilidad IS FALSE
                          AND (p.correo IS NOT NULL OR p.telefono IS NOT NULL)$$
       WHERE codigo = 'personas_no_obligadas_contabilidad'
    `);
    await q.query(`
      UPDATE segmento SET condicion = $$p.agente_retencion IS TRUE$$
       WHERE codigo = 'agentes_retencion'
    `);

    // Las compañías recién creadas ya no necesitan comprobar que siguen vivas:
    // una constituida hace ocho meses y ya disuelta deja de ser prospecto, y de
    // eso se encarga ahora la regla.
    await q.query(`
      UPDATE segmento
         SET condicion = $$p.tipo_sujeto = 'compania'
                          AND p.fecha_constitucion >= (current_date - interval '12 months')$$
       WHERE codigo = 'companias_recien_creadas'
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE segmento DROP COLUMN IF EXISTS incluye_inactivos`);
  }
}
