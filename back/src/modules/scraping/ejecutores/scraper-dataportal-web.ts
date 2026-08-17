import { Inject, Injectable } from '@nestjs/common';
import {
  COMPANIAS_SCRAPING_REPOSITORY,
  CompaniasScrapingRepository,
} from '../application/ports/companias-scraping.repository';
import {
  DATAPORTAL_NAVIGATOR,
  DataportalNavigator,
  SesionDataportal,
} from '../application/ports/dataportal-navigator';
import {
  DATAPORTAL_OBSERVACIONES_REPOSITORY,
  DataportalObservacionesRepository,
} from '../application/ports/dataportal-observaciones.repository';
import {
  ContextoScraping,
  ErrorPermanente,
  ResumenScraping,
  Scraper,
} from './scraper.interface';

@Injectable()
export class ScraperDataportalWeb implements Scraper {
  readonly fuente = 'dataportal-web';
  readonly etiqueta = 'DataPortal web';
  readonly pasos = [
    'resolviendo_compania',
    'iniciando_sesion',
    'navegando_ruc',
    'consultando_ruc',
    'extrayendo_observaciones',
    'persistiendo_observaciones',
  ] as const;

  constructor(
    @Inject(COMPANIAS_SCRAPING_REPOSITORY)
    private readonly companias: CompaniasScrapingRepository,
    @Inject(DATAPORTAL_NAVIGATOR)
    private readonly navegador: DataportalNavigator,
    @Inject(DATAPORTAL_OBSERVACIONES_REPOSITORY)
    private readonly observaciones: DataportalObservacionesRepository,
  ) {}

  async ejecutar(ctx: ContextoScraping): Promise<ResumenScraping> {
    if (ctx.tipoSujeto !== 'compania') {
      throw new ErrorPermanente(
        'La fuente dataportal-web sólo admite sujetos de tipo compañía',
      );
    }

    await ctx.latido({ pct: 0, paso: 'resolviendo_compania' });
    const compania = await this.companias.buscarPorExpediente(ctx.clave);
    if (!compania) {
      throw new ErrorPermanente(
        `No existe la compañía con expediente ${ctx.clave}`,
      );
    }
    if (!compania.ruc?.trim()) {
      throw new ErrorPermanente(`La compañía ${ctx.clave} no tiene RUC`);
    }

    await ctx.latido({
      pct: 25,
      paso: 'iniciando_sesion',
      checkpoint: { contribuyenteId: compania.id },
    });

    let sesion: SesionDataportal | null = null;
    try {
      sesion = await this.conLatidoTrasInterrupcion(
        ctx,
        'iniciando_sesion',
        () => this.navegador.iniciarSesion(ctx.signal),
      );
      await ctx.latido({ pct: 40, paso: 'navegando_ruc' });
      const { navegacionMs } = await this.conLatidoTrasInterrupcion(
        ctx,
        'navegando_ruc',
        () => sesion!.navegarABusquedaRuc(),
      );
      await ctx.latido({ pct: 60, paso: 'consultando_ruc' });
      const resultado = await this.conLatidoTrasInterrupcion(
        ctx,
        'consultando_ruc',
        () => sesion!.consultarRuc(compania.ruc!.trim()),
      );
      await ctx.latido({ pct: 75, paso: 'extrayendo_observaciones' });
      await ctx.latido({ pct: 85, paso: 'persistiendo_observaciones' });
      await this.observaciones.reemplazar({
        contribuyenteId: compania.id,
        ruc: compania.ruc.trim(),
        contactos: resultado.contactos,
        nomina: resultado.nomina,
      });
      await ctx.latido({ pct: 100, paso: 'terminado' });

      return {
        documentos: resultado.contactos.length + resultado.nomina.length,
        metricas: {
          loginMs: sesion.loginMs,
          navegacionMs,
          consultaMs: resultado.consultaMs,
          extraccionMs: resultado.extraccionMs,
          contactos: resultado.contactos.length,
          nomina: resultado.nomina.length,
          intento: ctx.intento,
        },
      };
    } finally {
      await sesion?.cerrar();
    }
  }

  private async conLatidoTrasInterrupcion<T>(
    ctx: ContextoScraping,
    paso: string,
    operacion: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operacion();
    } catch (error) {
      if (ctx.signal.aborted) await ctx.latido({ paso });
      throw error;
    }
  }
}
