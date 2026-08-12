import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Retira cinco segmentos de la capa comercial.
 *
 * Decisión comercial del 12 de agosto de 2026: `agentes_retencion`,
 * `pymes_por_ingresos`, `personas_obligadas_contabilidad`,
 * `personas_no_obligadas_contabilidad` y `pymes_con_mas_de_5_empleados` dejan de
 * trabajarse.
 *
 * ## Se desactivan, no se borran
 *
 * `activo = false` es todo lo que hace falta: `correrTodos` sólo recorre los
 * activos y `correr` de uno concreto lo rechaza con el motivo, así que el
 * segmento deja de recalcularse y de aparecer como lista de trabajo. Y la
 * pantalla los sigue enseñando con su razón al lado, que es el mismo criterio
 * con el que ya vivía bloqueado el de empleados: lo que se deja de trabajar
 * tiene que verse dentro de la herramienta, no desaparecer sin rastro.
 *
 * Un `DELETE` habría sido otra cosa muy distinta. Las cuatro filas activas
 * arrastran 139.419 miembros y 1.952 eventos de alta y baja, y el FK va en
 * `ON DELETE CASCADE`: borrar la definición se lleva por delante el histórico
 * de quién entró y quién salió, que es justo lo que no se puede reconstruir
 * —los miembros se recalculan corriendo el segmento otra vez; los eventos, no—.
 * Reactivar es volver a poner el booleano en `true`.
 *
 * ## `pymes_con_mas_de_5_empleados` conserva su motivo
 *
 * Ya estaba inactivo, y su `bloqueo` explica el hueco de datos: falta la nómina,
 * que sólo aporta DataPortal. Pisarlo con "retirado por decisión comercial"
 * cambiaría un problema que se arregla cargando datos por una decisión que no lo
 * es. Se queda como está.
 *
 * ## El producto `nomina` se queda sin nada de lo que tirar
 *
 * Colgaba sólo de `pymes_por_ingresos` y de `pymes_con_mas_de_5_empleados`, así
 * que sin ellos no tiene un solo prospecto que ofrecer. Se marca inactivo:
 * `catalogo()` filtra por `producto.activo`, y dejarlo activo lo pintaría como
 * ofertable con la lista vacía. Los otros cuatro productos afectados
 * —`contabilidad_mes`, `friday_suscripcion`, `auditoria_externa` y
 * `registro_marca`— conservan al menos un segmento activo y no se tocan.
 *
 * Las filas de `producto_segmento` tampoco se tocan: son el cableado, y
 * borrarlas obligaría a volver a inventarlo si mañana se reactiva alguno.
 */
export class AnularSegmentosComerciales1700000021000 implements MigrationInterface {
  name = 'AnularSegmentosComerciales1700000021000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      UPDATE segmento
         SET activo = false,
             bloqueo = 'Retirado de la capa comercial el 2026-08-12 por decisión del equipo. No se corre ni entra en la lista de trabajo. La definición, los miembros y el histórico de altas y bajas quedan guardados: reactivarlo es volver a poner activo en true.'
       WHERE codigo IN (
         'agentes_retencion',
         'pymes_por_ingresos',
         'personas_obligadas_contabilidad',
         'personas_no_obligadas_contabilidad')
    `);

    // El de empleados ya estaba inactivo y con su propio motivo: sólo se
    // comprueba que siga así, sin tocar el `bloqueo` que explica el hueco.
    await q.query(`
      UPDATE segmento SET activo = false
       WHERE codigo = 'pymes_con_mas_de_5_empleados' AND activo
    `);

    await q.query(`UPDATE producto SET activo = false WHERE codigo = 'nomina'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      UPDATE segmento
         SET activo = true, bloqueo = NULL
       WHERE codigo IN (
         'agentes_retencion',
         'pymes_por_ingresos',
         'personas_obligadas_contabilidad',
         'personas_no_obligadas_contabilidad')
    `);

    await q.query(`UPDATE producto SET activo = true WHERE codigo = 'nomina'`);

    // `pymes_con_mas_de_5_empleados` no se reactiva: su bloqueo es anterior a
    // esta migración y sigue vigente mientras falte la nómina.
  }
}
