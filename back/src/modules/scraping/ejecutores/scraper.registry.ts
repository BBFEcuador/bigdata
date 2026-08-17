import { BadRequestException, Injectable } from '@nestjs/common';
import { Scraper } from './scraper.interface';

/**
 * Los scrapers disponibles, indexados por `fuente`.
 *
 * Nest no tiene multi-providers (eso es Angular), así que la lista se arma con
 * un `useFactory` en el módulo. Añadir un scraper real son dos líneas allí y un
 * archivo nuevo; nada más cambia.
 */
@Injectable()
export class ScraperRegistry {
  private readonly porFuente = new Map<string, Scraper>();

  constructor(
    scrapers: Scraper[],
    private readonly fuentePredeterminada?: string,
  ) {
    for (const s of scrapers) {
      if (this.porFuente.has(s.fuente)) {
        // Fallar al arrancar y no en caliente: con dos scrapers compartiendo
        // fuente, los jobs irían a uno u otro según el orden de los providers.
        throw new Error(`Hay dos scrapers con la fuente "${s.fuente}"`);
      }
      this.porFuente.set(s.fuente, s);
    }
    if (
      this.fuentePredeterminada &&
      !this.porFuente.has(this.fuentePredeterminada)
    ) {
      throw new Error(
        `La fuente predeterminada "${this.fuentePredeterminada}" no está registrada`,
      );
    }
  }

  obtener(fuente: string): Scraper {
    const s = this.porFuente.get(fuente);
    if (!s) {
      throw new BadRequestException(
        `No existe la fuente "${fuente}". Disponibles: ${[...this.porFuente.keys()].join(', ')}`,
      );
    }
    return s;
  }

  existe(fuente: string): boolean {
    return this.porFuente.has(fuente);
  }

  /** Lo que la pantalla necesita para pintar el desplegable de fuentes. */
  fuentes(): { fuente: string; etiqueta: string; pasos: readonly string[] }[] {
    return [...this.porFuente.values()].map(s => ({
      fuente: s.fuente,
      etiqueta: s.etiqueta,
      pasos: s.pasos,
    }));
  }

  /** La fuente que se usa cuando el alta no dice ninguna. */
  fuentePorDefecto(): string {
    if (this.fuentePredeterminada) return this.fuentePredeterminada;
    const primera = this.porFuente.keys().next();
    if (primera.done) throw new Error('No hay ningún scraper registrado');
    return primera.value;
  }
}
