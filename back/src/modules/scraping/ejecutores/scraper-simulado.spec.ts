import { Logger } from '@nestjs/common';
import { ScraperSimulado } from './scraper-simulado';
import { CanceladoError, ContextoScraping, ErrorPermanente } from './scraper.interface';
import { ScraperRegistry } from './scraper.registry';

/** Contexto de mentira: recuerda los latidos y los documentos guardados. */
function contexto(over: Partial<ContextoScraping> = {}) {
  const latidos: { pct?: number; paso?: string; checkpoint?: Record<string, unknown> }[] = [];
  const guardados: { tipo: string; contenido: Record<string, unknown> }[] = [];
  const ctx: ContextoScraping = {
    jobId: 'j1',
    expediente: '001',
    intento: 1,
    parametros: {},
    checkpoint: {},
    signal: new AbortController().signal,
    log: new Logger('test'),
    latido: async a => {
      latidos.push(a);
    },
    guardar: async d => {
      guardados.push({ tipo: d.tipo, contenido: d.contenido });
      return true;
    },
    ...over,
  };
  return { ctx, latidos, guardados };
}

describe('ScraperSimulado', () => {
  // Sin fallos ni lentitud, y sin esperas: los caminos se prueban aparte.
  beforeAll(() => {
    process.env.SCRAPING_SIM_MS_PASO = '0';
    process.env.SCRAPING_SIM_FALLO_PCT = '0';
    process.env.SCRAPING_SIM_LENTO_PCT = '0';
  });

  it('recorre todos los pasos y guarda la ficha', async () => {
    const s = new ScraperSimulado();
    const { ctx, latidos, guardados } = contexto();

    const resumen = await s.ejecutar(ctx);

    expect(guardados).toHaveLength(1);
    expect(guardados[0].tipo).toBe('ficha');
    expect(resumen.documentos).toBe(1);
    expect(latidos.map(l => l.paso)).toEqual([...s.pasos, 'terminado']);
    expect(latidos.at(-1)?.pct).toBe(100);
  });

  it('produce siempre la misma ficha para el mismo expediente', async () => {
    const s = new ScraperSimulado();
    const a = contexto({ expediente: '77777' });
    const b = contexto({ expediente: '77777' });

    await s.ejecutar(a.ctx);
    await s.ejecutar(b.ctx);

    // Si esto dejara de cumplirse, el hash de `scraping_resultado` cambiaría en
    // cada pasada y "no cambió nada" sería indetectable.
    expect(a.guardados[0].contenido).toEqual(b.guardados[0].contenido);
  });

  it('reanuda desde el checkpoint en vez de empezar de cero', async () => {
    const s = new ScraperSimulado();
    const { ctx, latidos } = contexto({ checkpoint: { pasoIndice: 2, documentos: 0 } });

    await s.ejecutar(ctx);

    // Los dos primeros pasos no se repiten: eso es lo que distingue pausar de
    // cancelar.
    expect(latidos.map(l => l.paso)).toEqual(['extrayendo', 'guardando', 'terminado']);
  });

  it('propaga la cancelación y no guarda nada después', async () => {
    const s = new ScraperSimulado();
    let llamadas = 0;
    const { ctx, guardados } = contexto({
      latido: async () => {
        if (++llamadas === 2) throw new CanceladoError();
      },
    });

    await expect(s.ejecutar(ctx)).rejects.toBeInstanceOf(CanceladoError);
    expect(guardados).toHaveLength(0);
  });

  it('distingue el fallo permanente del transitorio', async () => {
    process.env.SCRAPING_SIM_FALLO_PCT = '100';
    const s = new ScraperSimulado();

    // Con todos los jobs fallando, la mezcla debe traer de los dos tipos: un
    // 100 % permanente dejaría el backoff sin probar, y un 0 % dejaría sin
    // probar que un job imposible se rinde a la primera.
    const tipos = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const { ctx } = contexto({ expediente: `exp-${i}` });
      await s.ejecutar(ctx).catch(e => tipos.add(e.constructor.name));
    }

    expect(tipos.has(ErrorPermanente.name)).toBe(true);
    expect(tipos.has(Error.name)).toBe(true);
    process.env.SCRAPING_SIM_FALLO_PCT = '0';
  });
});

describe('ScraperRegistry', () => {
  it('resuelve por fuente y expone el catálogo', () => {
    const r = new ScraperRegistry([new ScraperSimulado()]);
    expect(r.obtener('simulada')).toBeInstanceOf(ScraperSimulado);
    expect(r.existe('simulada')).toBe(true);
    expect(r.fuentePorDefecto()).toBe('simulada');
    expect(r.fuentes()).toEqual([
      { fuente: 'simulada', etiqueta: 'Fuente simulada (pruebas)', pasos: expect.any(Array) },
    ]);
  });

  it('rechaza una fuente desconocida en vez de devolver undefined', () => {
    const r = new ScraperRegistry([new ScraperSimulado()]);
    expect(() => r.obtener('supercias')).toThrow(/No existe la fuente/);
  });

  it('revienta al arrancar si dos scrapers comparten fuente', () => {
    // Es preferible no arrancar a repartir los jobs entre dos ejecutores según
    // el orden en que Nest resolvió los providers.
    expect(() => new ScraperRegistry([new ScraperSimulado(), new ScraperSimulado()])).toThrow(
      /dos scrapers/,
    );
  });
});
