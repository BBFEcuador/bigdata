import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Qué hacer con los jobs que se quedaron a medias.
 *
 * ## Reencolar, nunca fallar
 *
 * Un job en 'corriendo' cuyo proceso ya no existe **no ha fallado**: lo
 * interrumpieron. Marcarlo 'fallido' significaría que cada `nest start --watch`
 * manda a la basura todos los jobs en vuelo y hay que resucitarlos a mano. Se
 * devuelven a la cola con su `progreso_pct` y su `checkpoint` intactos, así que
 * continúan donde iban.
 *
 * ## Cómo se sabe que un proceso murió
 *
 * Por el advisory lock, no por `latido_en`. Cada worker toma
 * `pg_advisory_lock('scraping_job:<id>')` sobre una conexión propia y lo
 * mantiene mientras trabaja; si el proceso muere, Postgres lo suelta solo. Que
 * el lock se pueda tomar es prueba de que nadie lo está ejecutando — sin
 * ventana de falso positivo, que es justo lo que un umbral sobre `latido_en`
 * no puede prometer: un job legítimamente lento parecería muerto.
 *
 * El contrapunto, que hay que conocer: un proceso **colgado pero vivo** conserva
 * su lock y no se recupera nunca. Para eso está `latido_en` en la tabla y en la
 * pantalla — para verlo a ojo.
 */
@Injectable()
export class ScrapingRecoveryService {
  private readonly logger = new Logger(ScrapingRecoveryService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Devuelve a la cola los jobs huérfanos. Devuelve cuántos tocó.
   *
   * Va sobre un `QueryRunner` dedicado y no sobre el pool: los locks que toma
   * el paso 1 tienen que seguir siendo de la misma sesión cuando el paso 3 los
   * suelta. Con el pool, cada consulta podría caer en otra conexión y los locks
   * se quedarían tomados hasta que esa conexión se reciclara.
   */
  async recuperar(): Promise<number> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    try {
      // `pg_try_advisory_lock` se evalúa por fila; los locks conseguidos quedan
      // tomados en ESTA sesión hasta el `pg_advisory_unlock_all()` del final.
      // Las filas que no aparecen aquí las está ejecutando otro proceso vivo, y
      // no se tocan.
      const res = await qr.query(
        `WITH muertos AS (
           SELECT id, accion_solicitada
             FROM scraping_job
            WHERE estado = 'corriendo'
              AND pg_try_advisory_lock(hashtext('scraping_job:' || id::text)::bigint)
         )
         UPDATE scraping_job j
            SET estado = CASE
                  WHEN m.accion_solicitada = 'cancelar' THEN 'cancelado'::scraping_job_estado
                  WHEN m.accion_solicitada = 'pausar'   THEN 'pausado'::scraping_job_estado
                  ELSE 'encolado'::scraping_job_estado
                END,
                accion_solicitada = NULL,
                reclamado_por = NULL,
                ultimo_error = 'Interrumpido: el proceso que lo ejecutaba ya no existe',
                proximo_intento_en = now(),
                finalizado_en = CASE WHEN m.accion_solicitada IN ('pausar','cancelar')
                                     THEN now() ELSE NULL END,
                actualizado_en = now()
           FROM muertos m
          WHERE j.id = m.id
         RETURNING j.id, j.estado`,
        [],
      );

      const tocados: { id: string; estado: string }[] = Array.isArray(res[0]) ? res[0] : res;

      if (tocados.length > 0) {
        // Un solo INSERT para todos: con miles de jobs, una ida y vuelta por
        // fila haría que arrancar el backend tardara minutos.
        await qr.query(
          `INSERT INTO scraping_job_evento
             (job_id, expediente, accion, estado_despues, usuario, detalle)
           SELECT j.id, j.expediente, 'recuperado', j.estado, 'sistema',
                  'El proceso que lo ejecutaba ya no existe'
             FROM scraping_job j WHERE j.id = ANY($1::uuid[])`,
          [tocados.map(t => t.id)],
        );
        this.logger.log(`Recuperados ${tocados.length} jobs interrumpidos`);
      }

      return tocados.length;
    } finally {
      // Sin esto, los locks tomados en el paso 1 se quedarían puestos y ningún
      // worker podría reclamar esos jobs jamás.
      await qr.query(`SELECT pg_advisory_unlock_all()`).catch(() => undefined);
      await qr.release();
    }
  }
}
