import { Logger } from '@nestjs/common';
import { CompaniasScrapingRepository } from '../application/ports/companias-scraping.repository';
import {
  DataportalNavigator,
  SesionDataportal,
} from '../application/ports/dataportal-navigator';
import {
  CanceladoError,
  ContextoScraping,
  ErrorPermanente,
} from './scraper.interface';
import { ScraperDataportalWeb } from './scraper-dataportal-web';

function contexto(over: Partial<ContextoScraping> = {}) {
  const latidos: Array<{ pct?: number; paso?: string }> = [];
  const ctx: ContextoScraping = {
    jobId: 'job-1',
    tipoSujeto: 'compania',
    clave: '12345',
    intento: 2,
    parametros: {},
    checkpoint: {},
    signal: new AbortController().signal,
    log: new Logger('test'),
    latido: async (avance) => {
      latidos.push(avance);
    },
    guardar: async () => true,
    ...over,
  };
  return { ctx, latidos };
}

function dependencias(
  over: {
    compania?: { id: string; expediente: string; ruc: string | null } | null;
    iniciar?: () => Promise<SesionDataportal>;
  } = {},
) {
  const orden: string[] = [];
  const cerrar = jest.fn(async () => undefined);
  const sesion: SesionDataportal = {
    loginMs: 12,
    navegarABusquedaRuc: jest.fn(async () => {
      orden.push('navegar');
      return { navegacionMs: 8 };
    }),
    consultarRuc: jest.fn(async () => {
      orden.push('consultar');
      return { consultaMs: 6 };
    }),
    cerrar,
  };
  const companias: CompaniasScrapingRepository = {
    buscarPorExpediente: jest.fn(async () => {
      orden.push('resolver');
      return over.compania === undefined
        ? { id: 'uuid-1', expediente: '12345', ruc: '0999999999001' }
        : over.compania;
    }),
  };
  const navegador: DataportalNavigator = {
    iniciarSesion: jest.fn(async () => {
      orden.push('login');
      return over.iniciar ? over.iniciar() : sesion;
    }),
  };
  return { companias, navegador, sesion, cerrar, orden };
}

describe('ScraperDataportalWeb', () => {
  it('resuelve la compañía por expediente, inicia sesión y navega en orden', async () => {
    const d = dependencias();
    const scraper = new ScraperDataportalWeb(d.companias, d.navegador);
    const { ctx, latidos } = contexto();

    const resumen = await scraper.ejecutar(ctx);

    expect(d.companias.buscarPorExpediente).toHaveBeenCalledWith('12345');
    expect(d.orden).toEqual(['resolver', 'login', 'navegar', 'consultar']);
    expect(d.sesion.consultarRuc).toHaveBeenCalledWith('0999999999001');
    expect(latidos.map((l) => l.paso)).toEqual([
      'resolviendo_compania',
      'iniciando_sesion',
      'navegando_ruc',
      'consultando_ruc',
      'consulta_enviada',
      'terminado',
    ]);
    expect(resumen).toEqual({
      documentos: 0,
      metricas: {
        loginMs: 12,
        navegacionMs: 8,
        consultaMs: 6,
        intento: 2,
      },
    });
    expect(d.cerrar).toHaveBeenCalledTimes(1);
  });

  it('rechaza sujetos incompatibles sin consultar infraestructura', async () => {
    const d = dependencias();
    const scraper = new ScraperDataportalWeb(d.companias, d.navegador);
    const { ctx } = contexto({ tipoSujeto: 'persona_natural' });

    await expect(scraper.ejecutar(ctx)).rejects.toBeInstanceOf(ErrorPermanente);
    expect(d.companias.buscarPorExpediente).not.toHaveBeenCalled();
  });

  it.each([
    [null, /No existe la compañía/],
    [{ id: 'u', expediente: '12345', ruc: null }, /no tiene RUC/],
    [{ id: 'u', expediente: '12345', ruc: '   ' }, /no tiene RUC/],
  ])(
    'rechaza una compañía inexistente o sin RUC',
    async (compania, mensaje) => {
      const d = dependencias({ compania });
      const scraper = new ScraperDataportalWeb(d.companias, d.navegador);

      await expect(scraper.ejecutar(contexto().ctx)).rejects.toThrow(mensaje);
      expect(d.navegador.iniciarSesion).not.toHaveBeenCalled();
    },
  );

  it.each([new ErrorPermanente('credenciales'), new Error('red')])(
    'propaga errores permanentes y transitorios',
    async (error) => {
      const d = dependencias({ iniciar: async () => Promise.reject(error) });
      const scraper = new ScraperDataportalWeb(d.companias, d.navegador);
      await expect(scraper.ejecutar(contexto().ctx)).rejects.toBe(error);
    },
  );

  it('tras un aborto consulta el latido para conservar la cancelación', async () => {
    const aborto = new AbortController();
    const cancelado = new CanceladoError();
    const d = dependencias({
      iniciar: async () => {
        aborto.abort();
        throw new Error('context closed');
      },
    });
    const scraper = new ScraperDataportalWeb(d.companias, d.navegador);
    const { ctx } = contexto({
      signal: aborto.signal,
      latido: async (avance) => {
        if (avance.paso === 'iniciando_sesion' && aborto.signal.aborted)
          throw cancelado;
      },
    });

    await expect(scraper.ejecutar(ctx)).rejects.toBe(cancelado);
  });
});
