import { Logger } from '@nestjs/common';
import { TipoSujeto } from '../scraping.sujetos';

/**
 * El contrato de un scraper.
 *
 * Todo lo que sabe el despachador de un scraper es esto. Añadir uno real es
 * escribir un archivo que implemente `Scraper` y cablearlo en
 * `scraping.module.ts`: ni el servicio, ni el despachador, ni la migración, ni
 * la pantalla se enteran.
 */

/** El usuario canceló. El job termina en 'cancelado', no en 'fallido'. */
export class CanceladoError extends Error {
  constructor() {
    super('Cancelado por el usuario');
    this.name = 'CanceladoError';
  }
}

/** El usuario pausó. El job termina en 'pausado' y conserva su checkpoint. */
export class PausadoError extends Error {
  constructor() {
    super('Pausado por el usuario');
    this.name = 'PausadoError';
  }
}

/**
 * Falla y NO se reintenta.
 *
 * Es para lo que no va a mejorar por insistir: la fuente responde 404, el
 * expediente no existe allí, el formato cambió. Sin esta distinción, un job
 * imposible consume sus tres intentos y sus tres backoffs antes de rendirse, y
 * multiplicado por miles de compañías eso son horas de cola inútil.
 */
export class ErrorPermanente extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorPermanente';
  }
}

export interface ContextoScraping {
  readonly jobId: string;
  /** Qué población: compañía, persona natural o sociedad no supervisada. */
  readonly tipoSujeto: TipoSujeto;
  /** El expediente si es compañía, el RUC en los otros dos casos. */
  readonly clave: string;
  /** Qué número de intento es éste. Empieza en 1. */
  readonly intento: number;
  readonly parametros: Record<string, unknown>;
  /**
   * Lo que dejó la ejecución anterior al pausarse o al caerse el proceso.
   * `{}` la primera vez.
   */
  readonly checkpoint: Record<string, unknown>;
  /** Se dispara al apagar el proceso. Pásalo a `fetch` para cortar en vuelo. */
  readonly signal: AbortSignal;
  readonly log: Logger;

  /**
   * PUNTO SEGURO: escribe el avance y lee la orden del usuario en la misma
   * consulta.
   *
   * **Lanza** `CanceladoError` / `PausadoError` en vez de devolver un booleano.
   * Devolverlo se olvida de mirar —ese es el bug clásico de los bucles
   * cooperativos— y un job seguiría corriendo después de que alguien lo
   * cancelara.
   *
   * CONTRATO: hay que llamarlo entre peticiones HTTP. La latencia que percibe
   * quien pulsa "pausar" es exactamente el hueco entre dos llamadas a esto.
   */
  latido(avance: {
    pct?: number;
    paso?: string;
    checkpoint?: Record<string, unknown>;
  }): Promise<void>;

  /**
   * Guarda un documento. Idempotente por (sujeto, fuente, tipo, documento):
   * volver a guardar lo mismo no duplica nada y devuelve `false`, que es la
   * señal de "se volvió a bajar y no había cambiado".
   */
  guardar(doc: {
    tipo: string;
    /** Sólo si el job produce varios documentos del mismo tipo. */
    documento?: string;
    contenido: Record<string, unknown>;
  }): Promise<boolean>;
}

export interface ResumenScraping {
  documentos: number;
  /** Terminó, pero algo quedó a medias. Se guarda y se pinta en la pantalla. */
  avisos?: string | null;
  metricas?: Record<string, number>;
}

export interface Scraper {
  /** Coincide con `scraping_job.fuente`. Único en el registro. */
  readonly fuente: string;
  /** Cómo se llama en la pantalla. */
  readonly etiqueta: string;
  /** Los pasos en orden, para poder pintar el progreso antes de empezar. */
  readonly pasos: readonly string[];

  /**
   * Hace el trabajo.
   *
   * OJO con el cliente HTTP: si el scraper hace `new Cliente()` aquí dentro,
   * su limitador de peticiones es por job y con `SCRAPING_CONCURRENCIA=4` el
   * ritmo real contra la página ajena es cuatro veces el configurado. El
   * cliente tiene que ser un provider singleton inyectado en el constructor.
   */
  ejecutar(ctx: ContextoScraping): Promise<ResumenScraping>;
}

/** Token de inyección de la lista de scrapers registrados. */
export const SCRAPERS = Symbol('SCRAPERS');
