import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ContextoScraping, ErrorPermanente, ResumenScraping, Scraper } from './scraper.interface';
import { dormirInterrumpible } from '../scraping.tiempo';

/**
 * Un scraper que no va a ninguna parte.
 *
 * Existe para que toda la maquinaria —cola, concurrencia, pausa, reanudación
 * desde el checkpoint, reintentos con backoff, recuperación tras un reinicio—
 * se pueda probar de punta a punta hoy, sin depender de una página ajena.
 *
 * Tres decisiones que parecen caprichos y no lo son:
 *
 * 1. **Reanuda desde `ctx.checkpoint.pasoIndice`.** Si empezara siempre desde
 *    cero, pausar y cancelar serían lo mismo y el checkpoint no se probaría
 *    nunca.
 * 2. **El contenido es determinista** a partir del expediente. Así la segunda
 *    pasada da "sin cambios" por hash —que es el camino que interesa medir— y
 *    un test puede afirmar sobre el resultado.
 * 3. **Falla a propósito** (`SCRAPING_SIM_FALLO_PCT`). Sin fallos, ni el
 *    backoff, ni `max_intentos`, ni el estado `fallido` se ejercitan nunca, y
 *    se descubren rotos el día que entre el scraper de verdad.
 */
@Injectable()
export class ScraperSimulado implements Scraper {
  readonly fuente = 'simulada';
  readonly etiqueta = 'Fuente simulada (pruebas)';
  readonly pasos = ['resolviendo', 'descargando_ficha', 'extrayendo', 'guardando'] as const;

  private readonly msPaso = Number(process.env.SCRAPING_SIM_MS_PASO ?? 700);
  private readonly falloPct = Number(process.env.SCRAPING_SIM_FALLO_PCT ?? 10);
  private readonly lentoPct = Number(process.env.SCRAPING_SIM_LENTO_PCT ?? 3);

  async ejecutar(ctx: ContextoScraping): Promise<ResumenScraping> {
    const semilla = azarDe(`${ctx.expediente}:${ctx.intento}`);
    const desde = Number(ctx.checkpoint.pasoIndice ?? 0);
    let documentos = Number(ctx.checkpoint.documentos ?? 0);

    if (desde > 0) ctx.log.debug(`${ctx.expediente}: reanudando en el paso ${desde}`);

    for (let i = desde; i < this.pasos.length; i++) {
      const paso = this.pasos[i];

      // Punto seguro ANTES del trabajo del paso: así una pausa pedida mientras
      // dormía el paso anterior se atiende sin hacer nada más.
      await ctx.latido({
        pct: Math.round((i / this.pasos.length) * 100),
        paso,
        checkpoint: { pasoIndice: i, documentos },
      });

      // Un puñado de jobs tarda mucho, para poder ver el latido en la pantalla
      // y probar a cancelar algo que lleva rato corriendo.
      const lento = semilla(`lento:${i}`) * 100 < this.lentoPct;
      await dormirInterrumpible(lento ? 30_000 : this.msPaso, ctx.signal);

      if (semilla(`fallo:${i}`) * 100 < this.falloPct) {
        // Uno de cada cuatro fallos es definitivo. Los otros tres se reintentan.
        if (semilla(`permanente:${i}`) < 0.25) {
          throw new ErrorPermanente(`La fuente no tiene ficha de ${ctx.expediente}`);
        }
        throw new Error(`Fallo transitorio simulado en el paso "${paso}"`);
      }

      if (paso === 'guardando') {
        const cambio = await ctx.guardar({
          tipo: 'ficha',
          contenido: this.ficha(ctx.expediente),
        });
        documentos += cambio ? 1 : 0;
      }
    }

    await ctx.latido({
      pct: 100,
      paso: 'terminado',
      checkpoint: { pasoIndice: this.pasos.length, documentos },
    });

    return {
      documentos,
      avisos: documentos === 0 ? 'La ficha ya estaba guardada y no ha cambiado.' : null,
      metricas: { pasos: this.pasos.length, intento: ctx.intento },
    };
  }

  /** Siempre la misma ficha para el mismo expediente. */
  private ficha(expediente: string): Record<string, unknown> {
    const r = azarDe(`ficha:${expediente}`);
    const sectores = ['comercio', 'manufactura', 'servicios', 'construcción', 'transporte'];
    return {
      expediente,
      razonSocial: `Compañía simulada ${expediente}`,
      sector: sectores[Math.floor(r('sector') * sectores.length)],
      empleados: 1 + Math.floor(r('empleados') * 500),
      actos: Math.floor(r('actos') * 12),
      fuente: 'simulada',
    };
  }
}

/**
 * Azar reproducible.
 *
 * `Math.random()` haría que el mismo job diera resultados distintos en cada
 * pasada, y entonces "esto falló" nunca se podría reproducir. Con el
 * expediente y el número de intento como semilla, un reintento sí cambia de
 * suerte —que es lo que debe pasar— pero la secuencia completa es repetible.
 */
function azarDe(semilla: string): (sufijo: string) => number {
  return (sufijo: string) => {
    const h = createHash('md5').update(`${semilla}:${sufijo}`).digest();
    return h.readUInt32BE(0) / 0x1_0000_0000;
  };
}
