import { Logger } from '@nestjs/common';
import { ContribuyentesScrapingRepository } from '../application/ports/contribuyentes-scraping.repository';
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
import { DataportalObservacionesRepository } from '../application/ports/dataportal-observaciones.repository';

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
    contribuyente?: { id: string; ruc: string | null } | null;
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
      return {
        consultaMs: 6,
        extraccionMs: 3,
        contactos: [
          { valor: 'a@b.ec', tipo: 'email' as const, tipoCodigo: '3' },
        ],
        nomina: [],
      };
    }),
    cerrar,
  };
  const contribuyentes: ContribuyentesScrapingRepository = {
    buscar: jest.fn(async () => {
      orden.push('resolver');
      return over.contribuyente === undefined
        ? { id: 'uuid-1', ruc: '0999999999001' }
        : over.contribuyente;
    }),
  };
  const navegador: DataportalNavigator = {
    iniciarSesion: jest.fn(async () => {
      orden.push('login');
      return over.iniciar ? over.iniciar() : sesion;
    }),
  };
  const observaciones: DataportalObservacionesRepository = {
    reemplazar: jest.fn(async () => {
      orden.push('persistir');
    }),
  };
  return { contribuyentes, navegador, observaciones, sesion, cerrar, orden };
}

describe('ScraperDataportalWeb', () => {
  it('resuelve la compañía por expediente, inicia sesión y navega en orden', async () => {
    const d = dependencias();
    const scraper = new ScraperDataportalWeb(
      d.contribuyentes,
      d.navegador,
      d.observaciones,
    );
    const { ctx, latidos } = contexto();

    const resumen = await scraper.ejecutar(ctx);

    expect(d.contribuyentes.buscar).toHaveBeenCalledWith('compania', '12345');
    expect(d.orden).toEqual([
      'resolver',
      'login',
      'navegar',
      'consultar',
      'persistir',
    ]);
    expect(d.sesion.consultarRuc).toHaveBeenCalledWith('0999999999001');
    expect(latidos.map((l) => l.paso)).toEqual([
      'resolviendo_sujeto',
      'iniciando_sesion',
      'navegando_ruc',
      'consultando_ruc',
      'extrayendo_observaciones',
      'persistiendo_observaciones',
      'terminado',
    ]);
    expect(resumen).toEqual({
      documentos: 1,
      metricas: {
        loginMs: 12,
        navegacionMs: 8,
        consultaMs: 6,
        extraccionMs: 3,
        contactos: 1,
        nomina: 0,
        intento: 2,
      },
    });
    expect(d.cerrar).toHaveBeenCalledTimes(1);
  });

  it.each(['persona_natural', 'sociedad_no_supervisada'] as const)(
    'consulta DataPortal para sujetos de tipo %s usando su RUC',
    async (tipoSujeto) => {
      const d = dependencias();
      const scraper = new ScraperDataportalWeb(
        d.contribuyentes,
        d.navegador,
        d.observaciones,
      );
      const { ctx } = contexto({ tipoSujeto, clave: '0999999999001' });

      await expect(scraper.ejecutar(ctx)).resolves.toEqual(
        expect.objectContaining({ documentos: 1 }),
      );
      expect(d.contribuyentes.buscar).toHaveBeenCalledWith(
        tipoSujeto,
        '0999999999001',
      );
      expect(d.sesion.consultarRuc).toHaveBeenCalledWith('0999999999001');
    },
  );

  it.each([
    [null, /No existe la compañía/],
    [{ id: 'u', ruc: null }, /no tiene RUC/],
    [{ id: 'u', ruc: '   ' }, /no tiene RUC/],
  ])(
    'rechaza un sujeto inexistente o sin RUC',
    async (contribuyente, mensaje) => {
      const d = dependencias({ contribuyente });
      const scraper = new ScraperDataportalWeb(
        d.contribuyentes,
        d.navegador,
        d.observaciones,
      );

      await expect(scraper.ejecutar(contexto().ctx)).rejects.toThrow(mensaje);
      expect(d.navegador.iniciarSesion).not.toHaveBeenCalled();
    },
  );

  it.each([new ErrorPermanente('credenciales'), new Error('red')])(
    'propaga errores permanentes y transitorios',
    async (error) => {
      const d = dependencias({ iniciar: async () => Promise.reject(error) });
      const scraper = new ScraperDataportalWeb(
        d.contribuyentes,
        d.navegador,
        d.observaciones,
      );
      await expect(scraper.ejecutar(contexto().ctx)).rejects.toBe(error);
    },
  );

  it('reemplaza por vacío cuando ambas tablas se cargan sin filas', async () => {
    const d = dependencias();
    (d.sesion.consultarRuc as jest.Mock).mockResolvedValue({
      consultaMs: 6,
      extraccionMs: 2,
      contactos: [],
      nomina: [],
    });
    const scraper = new ScraperDataportalWeb(
      d.contribuyentes,
      d.navegador,
      d.observaciones,
    );

    await expect(scraper.ejecutar(contexto().ctx)).resolves.toEqual(
      expect.objectContaining({ documentos: 0 }),
    );
    expect(d.observaciones.reemplazar).toHaveBeenCalledWith(
      expect.objectContaining({
        contribuyenteId: 'uuid-1',
        contactos: [],
        nomina: [],
      }),
    );
  });

  it('no persiste si la extracción falla', async () => {
    const d = dependencias();
    (d.sesion.consultarRuc as jest.Mock).mockRejectedValue(
      new ErrorPermanente('DOM incompatible'),
    );
    const scraper = new ScraperDataportalWeb(
      d.contribuyentes,
      d.navegador,
      d.observaciones,
    );

    await expect(scraper.ejecutar(contexto().ctx)).rejects.toThrow(
      'DOM incompatible',
    );
    expect(d.observaciones.reemplazar).not.toHaveBeenCalled();
  });

  it('tras un aborto consulta el latido para conservar la cancelación', async () => {
    const aborto = new AbortController();
    const cancelado = new CanceladoError();
    const d = dependencias({
      iniciar: async () => {
        aborto.abort();
        throw new Error('context closed');
      },
    });
    const scraper = new ScraperDataportalWeb(
      d.contribuyentes,
      d.navegador,
      d.observaciones,
    );
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
