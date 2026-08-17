export const DATAPORTAL_NAVIGATOR = Symbol('DATAPORTAL_NAVIGATOR');

export type TipoContactoDataportal = 'email' | 'telefono' | 'otro';

export interface ContactoDataportal {
  valor: string;
  tipo: TipoContactoDataportal;
  tipoCodigo: string | null;
}

export interface PersonaNominaDataportal {
  cedula: string;
  nombre: string | null;
  fechaIngreso: string | null;
  rol: string | null;
  posibleSalario: number | null;
}

export interface ResultadoConsultaDataportal {
  contactos: ContactoDataportal[];
  nomina: PersonaNominaDataportal[];
  consultaMs: number;
  extraccionMs: number;
}

export interface SesionDataportal {
  readonly loginMs: number;
  navegarABusquedaRuc(): Promise<{ navegacionMs: number }>;
  consultarRuc(ruc: string): Promise<ResultadoConsultaDataportal>;
  cerrar(): Promise<void>;
}

/** Navegación autenticada, sin exponer Page, BrowserContext ni cookies. */
export interface DataportalNavigator {
  iniciarSesion(signal: AbortSignal): Promise<SesionDataportal>;
}
