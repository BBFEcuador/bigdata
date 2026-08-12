import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ImportJobsService } from '../import-jobs.service';
import {
  DataportalClient,
  CredencialesInvalidasError,
  dormir,
} from './dataportal.client';
import { Parseado, parsearRespuestas } from './dataportal.parser';

/** Cuántos RUC se piden a la base por lote de trabajo. */
const TAMANO_LOTE = 200;

/** Peticiones por segundo. Conservador: se puede subir si el portal aguanta. */
const RITMO_POR_SEGUNDO = Number(process.env.DATAPORTAL_RPS ?? 5);

/** Un RUC que falla más de esto se deja por imposible y no bloquea la carga. */
const MAX_INTENTOS_POR_RUC = 3;

/**
 * Enriquecimiento masivo desde DataPortal.
 *
 * A diferencia del resto de importadores, aquí el origen no es un archivo sino
 * una API, y el trabajo dura ~31 horas. Eso cambia dos cosas:
 *
 * 1. **La lista de trabajo vive en la base** (`dataportal_consulta`), no en
 *    memoria. Reanudar es "seguir por los pendientes", y una interrupción
 *    —token caducado, corte de red, reinicio— cuesta un lote, no la carga.
 *
 * 2. **Se guarda el JSON crudo** además de los campos parseados. Volver a pedir
 *    1,13 M de respuestas son 31 horas; volver a parsear lo guardado son
 *    segundos.
 *
 * Enriquecer, nunca reemplazar: nada de aquí toca `companias` ni el padrón.
 */
@Injectable()
export class DataportalImportService {
  private readonly logger = new Logger(DataportalImportService.name);
  private cancelar = false;

  constructor(
    private readonly jobsService: ImportJobsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  enqueue(jobId: string): void {
    void this.run(jobId).catch((err) => {
      this.logger.error(`Job ${jobId} falló de forma inesperada: ${err?.message}`, err?.stack);
    });
  }

  detener(): void {
    this.cancelar = true;
  }

  /**
   * Siembra la lista de trabajo con los RUC de las compañías.
   *
   * Idempotente: `ON CONFLICT DO NOTHING` permite reejecutarlo cuando entren
   * compañías nuevas sin reiniciar lo ya consultado.
   */
  async sembrar(): Promise<number> {
    const res = await this.dataSource.query(`
      INSERT INTO dataportal_consulta (ruc)
      SELECT DISTINCT ruc FROM companias
       WHERE ruc IS NOT NULL AND ruc <> ''
      ON CONFLICT (ruc) DO NOTHING
    `);
    return Array.isArray(res) && typeof res[1] === 'number' ? res[1] : 0;
  }

  private async run(jobId: string): Promise<void> {
    const job = await this.jobsService.findOne(jobId);
    if (!job) return;

    this.cancelar = false;
    const t0 = Date.now();
    const client = new DataportalClient(() => {
      const usuario = process.env.DATAPORTAL_USER;
      const clave = process.env.DATAPORTAL_PASSWORD;
      if (!usuario || !clave) {
        throw new CredencialesInvalidasError(
          'Faltan DATAPORTAL_USER / DATAPORTAL_PASSWORD en back/.env. ' +
            'La clave es una contraseña de aplicación de WordPress, no la de la cuenta.',
        );
      }
      return { usuario, clave };
    });

    let hechos = 0;
    let conDatos = 0;
    let sinDatos = 0;
    let errores = 0;

    try {
      await this.jobsService.update(jobId, { status: 'parsing', startedAt: new Date() });

      const sembrados = await this.sembrar();
      const total = await this.contarPendientes();
      this.logger.log(`Job ${jobId}: ${sembrados} RUC nuevos, ${total} pendientes`);

      const intervalo = 1000 / RITMO_POR_SEGUNDO;

      for (;;) {
        if (this.cancelar) {
          this.logger.warn(`Job ${jobId} detenido a petición; se reanuda por los pendientes.`);
          break;
        }

        const lote = await this.tomarLote();
        if (lote.length === 0) break;

        for (const ruc of lote) {
          if (this.cancelar) break;
          const inicio = Date.now();

          try {
            const { crudas, status, sinDatos: vacio } = await client.consultar(ruc);
            const parseado = parsearRespuestas(ruc, crudas);
            await this.guardar(ruc, jobId, crudas, parseado, status, vacio);
            hechos++;
            if (vacio) sinDatos++;
            else conDatos++;
          } catch (err) {
            if (err instanceof CredencialesInvalidasError) throw err; // para la carga entera
            errores++;
            await this.marcarError(ruc, jobId, (err as Error).message);
          }

          // Ritmo: se descuenta lo que ya tardó la petición, así el límite es
          // de peticiones por segundo y no de pausas por segundo.
          const resto = intervalo - (Date.now() - inicio);
          if (resto > 0) await dormir(resto);
        }

        await this.jobsService.reportProgress(jobId, {
          rowsRead: hechos,
          rowsCopied: conDatos,
          rowsRejected: errores,
          progressPct: total > 0 ? Math.min(99, Math.round((hechos / total) * 100)) : 0,
        });
      }

      await this.jobsService.update(jobId, {
        status: 'completed',
        progressPct: 100,
        rowsRead: hechos,
        rowsCopied: conDatos,
        rowsRejected: errores,
        avisos:
          `${conDatos} compañías con datos, ${sinDatos} sin datos en el portal, ` +
          `${errores} con error. Quedan ${await this.contarPendientes()} pendientes.`,
        finishedAt: new Date(),
      });

      const horas = ((Date.now() - t0) / 3_600_000).toFixed(1);
      this.logger.log(`Job ${jobId} terminado en ${horas} h: ${hechos} consultas`);
    } catch (err) {
      const mensaje = (err as Error)?.message ?? String(err);
      this.logger.error(`Job ${jobId} falló: ${mensaje}`);
      await this.jobsService
        .update(jobId, {
          status: 'failed',
          errorMessage: mensaje,
          rowsRead: hechos,
          avisos: `Se consultaron ${hechos} RUC antes del fallo. El progreso está guardado: al relanzar continúa por los pendientes.`,
          finishedAt: new Date(),
        })
        .catch(() => undefined);
    } finally {
      this.jobsService.forgetProgress(jobId);
    }
  }

  /** Reparto por estado, para seguir una carga de 31 horas sin adivinar. */
  async estado() {
    const filas = await this.dataSource.query(
      `SELECT estado, count(*)::int AS n FROM dataportal_consulta GROUP BY estado`,
    );
    const porEstado = Object.fromEntries(
      filas.map((f: { estado: string; n: number }) => [f.estado, Number(f.n)]),
    );
    const [extra] = await this.dataSource.query(`
      SELECT (SELECT count(*)::int FROM dataportal_empresa)  AS empresas,
             (SELECT count(*)::int FROM dataportal_contacto WHERE tipo = 'email') AS correos,
             (SELECT count(*)::int FROM dataportal_contacto WHERE tipo = 'telefono') AS telefonos,
             (SELECT count(*)::int FROM dataportal_nomina)   AS empleados,
             (SELECT count(*)::int FROM dataportal_vehiculo) AS vehiculos
    `);
    return {
      porEstado,
      total: Object.values(porEstado).reduce((a: number, b) => a + Number(b), 0),
      pendientes: await this.contarPendientes(),
      extraidos: {
        empresas: Number(extra.empresas),
        correos: Number(extra.correos),
        telefonos: Number(extra.telefonos),
        empleados: Number(extra.empleados),
        vehiculos: Number(extra.vehiculos),
      },
    };
  }

  private async contarPendientes(): Promise<number> {
    const [r] = await this.dataSource.query(
      `SELECT count(*)::int AS n FROM dataportal_consulta
        WHERE estado = 'pendiente' OR (estado = 'error' AND intentos < $1)`,
      [MAX_INTENTOS_POR_RUC],
    );
    return Number(r?.n ?? 0);
  }

  /**
   * Toma el siguiente lote y lo reserva en la misma sentencia.
   *
   * `FOR UPDATE SKIP LOCKED` permite que dos procesos trabajen a la vez sin
   * pisarse ni bloquearse: cada uno se lleva RUC distintos.
   */
  private async tomarLote(): Promise<string[]> {
    const filas = await this.dataSource.query(
      `WITH siguiente AS (
         SELECT ruc FROM dataportal_consulta
          WHERE estado = 'pendiente' OR (estado = 'error' AND intentos < $2)
          ORDER BY ruc
          LIMIT $1
          FOR UPDATE SKIP LOCKED
       )
       UPDATE dataportal_consulta c
          SET intentos = c.intentos + 1, updated_at = now()
         FROM siguiente s
        WHERE c.ruc = s.ruc
       RETURNING c.ruc`,
      [TAMANO_LOTE, MAX_INTENTOS_POR_RUC],
    );
    return filas.map((f: { ruc: string }) => f.ruc);
  }

  /** Guarda la respuesta cruda y las filas derivadas, todo en una transacción. */
  private async guardar(
    ruc: string,
    jobId: string,
    crudas: unknown,
    p: Parseado,
    status: number,
    vacio: boolean,
  ): Promise<void> {
    await this.dataSource.transaction(async (m) => {
      await m.query(
        `UPDATE dataportal_consulta
            SET estado = $2, payload = $3::jsonb, http_status = $4,
                consultado_en = now(), job_id = $5, ultimo_error = NULL, updated_at = now()
          WHERE ruc = $1`,
        [ruc, vacio ? 'sin_datos' : 'ok', JSON.stringify(crudas), status, jobId],
      );

      if (p.empresa) {
        const e = p.empresa;
        await m.query(
          `INSERT INTO dataportal_empresa (
             ruc, razon_social, nombre_comercial, nombre_comercial_2, estado_contribuyente,
             fecha_inicio, fecha_suspension, actividad_economica, provincia, direccion,
             telefono, num_empleados, masa_salarial, actualizado_en)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now())
           ON CONFLICT (ruc) DO UPDATE SET
             razon_social = EXCLUDED.razon_social,
             nombre_comercial = EXCLUDED.nombre_comercial,
             nombre_comercial_2 = EXCLUDED.nombre_comercial_2,
             estado_contribuyente = EXCLUDED.estado_contribuyente,
             fecha_inicio = EXCLUDED.fecha_inicio,
             fecha_suspension = EXCLUDED.fecha_suspension,
             actividad_economica = EXCLUDED.actividad_economica,
             provincia = EXCLUDED.provincia,
             direccion = EXCLUDED.direccion,
             telefono = EXCLUDED.telefono,
             num_empleados = EXCLUDED.num_empleados,
             masa_salarial = EXCLUDED.masa_salarial,
             actualizado_en = now()`,
          [
            e.ruc, e.razon_social, e.nombre_comercial, e.nombre_comercial_2,
            e.estado_contribuyente, e.fecha_inicio, e.fecha_suspension,
            e.actividad_economica, e.provincia, e.direccion, e.telefono,
            e.num_empleados, e.masa_salarial,
          ],
        );
      }

      // Las tablas 1:N se reemplazan enteras para ese RUC: si un empleado deja
      // la empresa, su fila tiene que desaparecer. Un upsert lo dejaría ahí
      // para siempre, igual que pasaba con el detalle de los balances.
      await m.query(`DELETE FROM dataportal_contacto WHERE ruc = $1`, [ruc]);
      for (const c of p.contactos) {
        await m.query(
          `INSERT INTO dataportal_contacto (ruc, valor, tipo, tipo_codigo) VALUES ($1,$2,$3,$4)`,
          [c.ruc, c.valor, c.tipo, c.tipo_codigo],
        );
      }

      await m.query(`DELETE FROM dataportal_nomina WHERE ruc = $1`, [ruc]);
      for (const n of p.nomina) {
        await m.query(
          `INSERT INTO dataportal_nomina (ruc, cedula, nombre, ocupacion, sueldo, fecha_ingreso)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [n.ruc, n.cedula, n.nombre, n.ocupacion, n.sueldo, n.fecha_ingreso],
        );
      }

      await m.query(`DELETE FROM dataportal_vehiculo WHERE ruc = $1`, [ruc]);
      for (const v of p.vehiculos) {
        await m.query(
          `INSERT INTO dataportal_vehiculo (
             ruc, placa, tipo, marca, modelo, anio, cilindraje, avaluo, ciudad,
             fecha_matricula, anio_pago)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            v.ruc, v.placa, v.tipo, v.marca, v.modelo, v.anio, v.cilindraje,
            v.avaluo, v.ciudad, v.fecha_matricula, v.anio_pago,
          ],
        );
      }

      await m.query(`DELETE FROM dataportal_propiedad WHERE ruc = $1`, [ruc]);
      for (const prop of p.propiedades) {
        await m.query(`INSERT INTO dataportal_propiedad (ruc, datos) VALUES ($1, $2::jsonb)`, [
          ruc,
          JSON.stringify(prop),
        ]);
      }
    });
  }

  private async marcarError(ruc: string, jobId: string, mensaje: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE dataportal_consulta
          SET estado = 'error', ultimo_error = $2, job_id = $3, updated_at = now()
        WHERE ruc = $1`,
      [ruc, mensaje.slice(0, 500), jobId],
    );
  }
}
