export const DATAPORTAL_NAVIGATOR = Symbol('DATAPORTAL_NAVIGATOR');

export interface SesionDataportal {
  readonly loginMs: number;
  navegarABusquedaRuc(): Promise<{ navegacionMs: number }>;
  consultarRuc(ruc: string): Promise<{ consultaMs: number }>;
  cerrar(): Promise<void>;
}

/** Navegación autenticada, sin exponer Page, BrowserContext ni cookies. */
export interface DataportalNavigator {
  iniciarSesion(signal: AbortSignal): Promise<SesionDataportal>;
}
