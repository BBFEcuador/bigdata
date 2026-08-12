import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Personas naturales separadas por su obligación de llevar contabilidad.
 *
 * ## Por qué son dos segmentos y no dos tablas
 *
 * El proyecto ya separa físicamente lo que son poblaciones distintas —personas
 * naturales, compañías y sociedades no supervisadas viven en tablas propias
 * porque nunca se deben mezclar en un promedio—. Aquí no es el caso: obligada y
 * no obligada son **el mismo tipo de sujeto en dos estados**, y el SRI mueve a
 * un contribuyente de uno a otro cuando supera los umbrales de ingresos, capital
 * o costos. Con dos tablas, cada import tendría que mover filas de una a otra y
 * el histórico de esa fila se perdería en la mudanza.
 *
 * Con dos segmentos la separación es igual de nítida para trabajar —dos listas,
 * dos cifras, dos exportaciones— y el cambio de estado se refleja solo: la
 * próxima corrida lo da de baja en uno y de alta en el otro, y esa alta es
 * justamente la señal comercial ("acaba de quedar obligada a llevar
 * contabilidad").
 *
 * ## El tamaño de cada lista no es comparable
 *
 * Obligadas son ~60.000 y es una lista de trabajo. No obligadas son 6,5
 * millones: eso no es una lista, es un universo, y hay que acotarlo por
 * provincia, actividad o existencia de contacto antes de llamar a nadie. Por eso
 * el segmento de no obligadas se limita a las ACTIVAS y con algún dato de
 * contacto: sin ese recorte, "exportar el segmento" no significa nada.
 */
export class SegmentosContabilidad1700000011000 implements MigrationInterface {
  name = 'SegmentosContabilidad1700000011000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      INSERT INTO segmento (codigo, nombre, descripcion, condicion, activo, bloqueo) VALUES
        (
          'personas_obligadas_contabilidad',
          'Personas naturales OBLIGADAS a llevar contabilidad',
          'Personas naturales con RUC activo que el SRI marca como obligadas a llevar contabilidad. Necesitan contador todos los meses: es el prospecto más directo del servicio contable.',
          $$p.tipo_sujeto = 'persona_natural'
            AND p.obligado_contabilidad IS TRUE
            AND p.estado_sri = 'ACTIVO'$$,
          true, NULL
        ),
        (
          'personas_no_obligadas_contabilidad',
          'Personas naturales NO obligadas a llevar contabilidad',
          'Personas naturales activas que NO están obligadas a llevar contabilidad y de las que se tiene teléfono o correo. Son millones: el filtro de contacto es lo que la convierte en una lista utilizable, y conviene acotarla además por provincia o actividad.',
          $$p.tipo_sujeto = 'persona_natural'
            AND p.obligado_contabilidad IS FALSE
            AND p.estado_sri = 'ACTIVO'
            AND (p.correo IS NOT NULL OR p.telefono IS NOT NULL)$$,
          true, NULL
        ),
        (
          'agentes_retencion',
          'Agentes de retención',
          'Contribuyentes designados agentes de retención por el SRI, de cualquiera de las tres poblaciones. Tienen obligaciones mensuales de retención y declaración.',
          $$p.agente_retencion IS TRUE AND p.estado_sri = 'ACTIVO'$$,
          true, NULL
        )
    `);

    // Una persona obligada a llevar contabilidad necesita contador; la no
    // obligada es prospecto de la versión ligera y de FRIDAY.
    await q.query(`
      INSERT INTO producto_segmento (producto, segmento, prioridad) VALUES
        ('contabilidad_mes',   'personas_obligadas_contabilidad', 10),
        ('friday_suscripcion', 'personas_obligadas_contabilidad', 30),
        ('contabilidad_mes',   'personas_no_obligadas_contabilidad', 20),
        ('registro_marca',     'personas_no_obligadas_contabilidad', 40),
        ('contabilidad_mes',   'agentes_retencion', 10),
        ('auditoria_externa',  'agentes_retencion', 30)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DELETE FROM segmento WHERE codigo IN (
        'personas_obligadas_contabilidad',
        'personas_no_obligadas_contabilidad',
        'agentes_retencion')
    `);
  }
}
