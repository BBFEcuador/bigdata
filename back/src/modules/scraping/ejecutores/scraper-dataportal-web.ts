import { Inject, Injectable } from '@nestjs/common';
import {
  CONTRIBUYENTES_SCRAPING_REPOSITORY,
  ContribuyentesScrapingRepository,
} from '../application/ports/contribuyentes-scraping.repository';
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
import { ETIQUETA_SUJETO } from '../scraping.sujetos';

@Injectable()
export class ScraperDataportalWeb implements Scraper {
  readonly fuente = 'dataportal-web';
  readonly etiqueta = 'DataPortal web';
  readonly pasos = [
    'resolviendo_sujeto',
    'iniciando_sesion',
    'navegando_ruc',
    'consultando_ruc',
    'extrayendo_observaciones',
    'persistiendo_observaciones',
  ] as const;

  constructor(
    @Inject(CONTRIBUYENTES_SCRAPING_REPOSITORY)
    private readonly contribuyentes: ContribuyentesScrapingRepository,
    @Inject(DATAPORTAL_NAVIGATOR)
    private readonly navegador: DataportalNavigator,
    @Inject(DATAPORTAL_OBSERVACIONES_REPOSITORY)
    private readonly observaciones: DataportalObservacionesRepository,
  ) {}

  async ejecutar(ctx: ContextoScraping): Promise<ResumenScraping> {
    await ctx.latido({ pct: 0, paso: 'resolviendo_sujeto' });
    const contribuyente = await this.contribuyentes.buscar(
      ctx.tipoSujeto,
      ctx.clave,
    );
    if (!contribuyente) {
      throw new ErrorPermanente(
        `No existe ${ETIQUETA_SUJETO[ctx.tipoSujeto]} ${ctx.clave}`,
      );
    }
    if (!contribuyente.ruc?.trim()) {
      throw new ErrorPermanente(
        `${ETIQUETA_SUJETO[ctx.tipoSujeto]} ${ctx.clave} no tiene RUC`,
      );
    }

    await ctx.latido({
      pct: 25,
      paso: 'iniciando_sesion',
      checkpoint: { contribuyenteId: contribuyente.id },
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
        () => sesion!.consultarRuc(contribuyente.ruc!.trim()),
      );
      await ctx.latido({ pct: 75, paso: 'extrayendo_observaciones' });
      await ctx.latido({ pct: 85, paso: 'persistiendo_observaciones' });
      const identidad = {
        contribuyenteId: contribuyente.id,
        ruc: contribuyente.ruc.trim(),
      };
      const advertencias: string[] = [];
      const inicioPersistencia = Date.now();
      const persistir = async <T>(
        nombre: string,
        seccion:
          | { estado: 'ok'; datos: T[] }
          | { estado: 'error'; advertencia: string },
        reemplazar: (datos: T[]) => Promise<void>,
      ): Promise<number> => {
        if (seccion.estado === 'error') {
          advertencias.push(seccion.advertencia);
          return 0;
        }
        try {
          await reemplazar(seccion.datos);
          return 1;
        } catch (error) {
          advertencias.push(
            `No se pudo persistir ${nombre}; se conservó la fotografía anterior: ${error instanceof Error ? error.message : String(error)}`,
          );
          return 0;
        }
      };

      const contactosOk = await persistir(
        'contactos',
        resultado.contactos,
        (datos) => this.observaciones.reemplazarContactos(identidad, datos),
      );
      const nominaOk = await persistir('nómina', resultado.nomina, (datos) =>
        this.observaciones.reemplazarNomina(identidad, datos),
      );
      const propiedadesOk = await persistir(
        'propiedades',
        resultado.propiedades,
        (datos) => this.observaciones.reemplazarPropiedades(identidad, datos),
      );
      const vehiculosOk = await persistir(
        'vehículos',
        resultado.vehiculos,
        (datos) => this.observaciones.reemplazarVehiculos(identidad, datos),
      );
      const persistenciaMs = Date.now() - inicioPersistencia;
      await ctx.latido({ pct: 100, paso: 'terminado' });

      const cantidad = <T>(seccion: { estado: string; datos?: T[] }) =>
        seccion.estado === 'ok' ? (seccion.datos?.length ?? 0) : 0;
      const contactos = cantidad(resultado.contactos);
      const nomina = cantidad(resultado.nomina);
      const propiedades = cantidad(resultado.propiedades);
      const vehiculos = cantidad(resultado.vehiculos);

      return {
        documentos: contactos + nomina + propiedades + vehiculos,
        avisos: advertencias.length ? advertencias.join(' | ') : null,
        metricas: {
          loginMs: sesion.loginMs,
          navegacionMs,
          consultaMs: resultado.consultaMs,
          extraccionMs: resultado.extraccionMs,
          persistenciaMs,
          contactos,
          nomina,
          propiedades,
          vehiculos,
          contactosOk,
          nominaOk,
          propiedadesOk,
          vehiculosOk,
          advertencias: advertencias.length,
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
