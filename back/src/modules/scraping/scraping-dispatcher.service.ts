import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { hostname } from 'node:os';
import {
  CanceladoError,
  ContextoScraping,
  ErrorPermanente,
  PausadoError,
} from './ejecutores/scraper.interface';
import { ScraperRegistry } from './ejecutores/scraper.registry';
import { JobReclamado, ScrapingJobsService } from './scraping-jobs.service';
import { ScrapingRecoveryService } from './scraping-recovery.service';
import {
  CONCURRENCIA,
  ESPERA_APAGADO_MS,
  INTERVALO_OCIOSO_MS,
  TICKS_POR_BARRIDO,
} from './scraping.constants';
import { dormirInterrumpible } from './scraping.tiempo';

/**
 * Quien decide qué job corre y cuándo.
 *
 * Es un bucle `while` y no un `setInterval`: con `setInterval`, si una vuelta
 * tarda más que el intervalo, los ticks se solapan y acaban corriendo dos
 * reclamos a la vez. Es el mismo motivo por el que la pantalla de importación
 * guarda un `enVuelo` alrededor de su poll.
 *
 * No hay cola externa, ni Redis, ni `@nestjs/schedule`: la coordinación la pone
 * Postgres con `FOR UPDATE SKIP LOCKED` y los advisory locks, igual que en los
 * rastreadores que ya existen. Dos instancias del backend pueden correr a la
 * vez sin pisarse; lo que no está acotado entre ellas es el total de workers
 * (ver `CONCURRENCIA`).
 */
@Injectable()
export class ScrapingDispatcherService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ScrapingDispatcherService.name);
  private readonly identidad = `${hostname()}:${process.pid}`;
  private readonly enCurso = new Map<string, Promise<void>>();
  private readonly abortos = new Map<string, AbortController>();
  private parando = false;
  private ticks = 0;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly jobs: ScrapingJobsService,
    private readonly recovery: ScrapingRecoveryService,
    private readonly registry: ScraperRegistry,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Recuperar ANTES de reclamar nada: si no, este proceso podría empezar a
    // trabajar mientras los huérfanos del anterior siguen figurando en marcha.
    await this.recovery.recuperar().catch(e => this.logger.error(`Recuperación fallida: ${e}`));
    void this.bucle().catch(e => this.logger.error(`El despachador se detuvo: ${e?.stack ?? e}`));
  }

  async onModuleDestroy(): Promise<void> {
    this.parando = true;
    // Cortar los `fetch` en vuelo. Lo que no dé tiempo a cerrarse limpiamente
    // lo reencola la recuperación del siguiente arranque, así que no merece la
    // pena bloquear el SIGTERM esperando.
    for (const a of this.abortos.values()) a.abort();
    await Promise.race([
      Promise.allSettled([...this.enCurso.values()]),
      dormirInterrumpible(ESPERA_APAGADO_MS),
    ]);
  }

  estado() {
    return {
      identidad: this.identidad,
      concurrencia: CONCURRENCIA,
      ocupados: this.enCurso.size,
      corriendo: [...this.enCurso.keys()],
      parando: this.parando,
    };
  }

  private async bucle(): Promise<void> {
    this.logger.log(`Despachador en marcha (${this.identidad}, ${CONCURRENCIA} workers)`);

    while (!this.parando) {
      // Barrido periódico de huérfanos: cubre el caso de dos instancias donde
      // una muere sin que la otra se reinicie.
      if (++this.ticks % TICKS_POR_BARRIDO === 0) {
        await this.recovery.recuperar().catch(e => this.logger.warn(`Barrido fallido: ${e}`));
      }

      const hueco = CONCURRENCIA - this.enCurso.size;
      const lote = hueco > 0 ? await this.reclamarSeguro(hueco) : [];
      for (const job of lote) this.arrancar(job);

      if (lote.length === 0) {
        // Nada que hacer. Sin esta espera el bucle consultaría la cola miles de
        // veces por segundo contra una tabla de millones de filas.
        await dormirInterrumpible(INTERVALO_OCIOSO_MS);
      } else if (this.enCurso.size >= CONCURRENCIA) {
        // Lleno: esperar a que se libere un hueco en vez de dar vueltas.
        await Promise.race([...this.enCurso.values()]);
      }
    }

    this.logger.log('Despachador detenido');
  }

  private async reclamarSeguro(hueco: number): Promise<JobReclamado[]> {
    try {
      return await this.jobs.reclamar(hueco, this.identidad);
    } catch (e) {
      // La base puede estar reiniciándose. Reintentar en la siguiente vuelta es
      // mejor que matar el bucle y quedarse sin despachador hasta el reinicio.
      this.logger.warn(`No se pudo reclamar trabajo: ${e}`);
      await dormirInterrumpible(INTERVALO_OCIOSO_MS);
      return [];
    }
  }

  private arrancar(job: JobReclamado): void {
    const promesa = this.ejecutar(job)
      .catch(e => this.logger.error(`Job ${job.id} murió sin cerrarse: ${e?.stack ?? e}`))
      .finally(() => {
        this.enCurso.delete(job.id);
        this.abortos.delete(job.id);
      });
    this.enCurso.set(job.id, promesa);
  }

  private async ejecutar(job: JobReclamado): Promise<void> {
    const aborto = new AbortController();
    this.abortos.set(job.id, aborto);

    // Un QueryRunner propio para todo el job: el advisory lock es de SESIÓN, y
    // sobre el pool no hay ninguna garantía de que la consulta que lo toma y la
    // que lo suelta usen la misma conexión.
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();

    const clave = `scraping_job:${job.id}`;
    const [{ ok }] = await qr.query(`SELECT pg_try_advisory_lock(hashtext($1)::bigint) AS ok`, [
      clave,
    ]);

    if (!ok) {
      // Otro proceso lo tiene. No se toca la fila: la recuperación de aquel
      // proceso es la que sabe qué hacer con ella.
      this.logger.warn(`Job ${job.id} ya está en marcha en otro proceso; se suelta`);
      await qr.release();
      return;
    }

    try {
      const scraper = this.registry.obtener(job.fuente);
      const log = new Logger(`scraping:${job.fuente}`);

      const ctx: ContextoScraping = {
        jobId: job.id,
        tipoSujeto: job.tipo_sujeto,
        clave: job.clave,
        intento: job.intentos,
        parametros: job.parametros ?? {},
        checkpoint: job.checkpoint ?? {},
        signal: aborto.signal,
        log,
        latido: async avance => {
          const orden = await this.jobs.latido(job.id, avance);
          if (!orden) return;
          // Lanzar y no devolver: un ejecutor puede olvidarse de mirar un
          // booleano, y entonces seguiría trabajando después de que alguien lo
          // cancelara.
          if (orden.accion_solicitada === 'cancelar' || orden.estado === 'cancelado') {
            throw new CanceladoError();
          }
          if (orden.accion_solicitada === 'pausar') throw new PausadoError();
        },
        guardar: doc =>
          this.jobs.guardarResultado({
            jobId: job.id,
            tipoSujeto: job.tipo_sujeto,
            clave: job.clave,
            fuente: job.fuente,
            tipo: doc.tipo,
            documento: doc.documento,
            contenido: doc.contenido,
          }),
      };

      const resumen = await scraper.ejecutar(ctx);
      await this.jobs.completar(job, { ...resumen });
    } catch (e: any) {
      if (e instanceof CanceladoError) {
        await this.jobs.detenerPorOrden(job, 'cancelado');
      } else if (e instanceof PausadoError) {
        await this.jobs.detenerPorOrden(job, 'pausado');
      } else {
        await this.jobs.fallar(job, String(e?.message ?? e), e instanceof ErrorPermanente);
      }
    } finally {
      await qr.query(`SELECT pg_advisory_unlock(hashtext($1)::bigint)`, [clave]).catch(
        () => undefined,
      );
      await qr.release();
    }
  }
}
