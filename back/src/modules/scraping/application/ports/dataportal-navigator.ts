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

export interface PropiedadDataportal {
  cedulaCatastral: string;
  parroquia: string | null;
  codigoCalle: string | null;
  callePrincipal: string | null;
  numero: string | null;
  barrioSector: string | null;
  zona: string | null;
  telefono: string | null;
}

export interface VehiculoDataportal {
  tipo: string | null;
  modelo: string | null;
  marca: string | null;
  anio: number | null;
  placa: string;
  lugar: string | null;
  /** Fecha y hora local del portal, sin zona inventada. */
  fechaVencimiento: string | null;
}

export type ResultadoSeccionDataportal<T> =
  { estado: 'ok'; datos: T[] } | { estado: 'error'; advertencia: string };

export interface ResultadoConsultaDataportal {
  contactos: ResultadoSeccionDataportal<ContactoDataportal>;
  nomina: ResultadoSeccionDataportal<PersonaNominaDataportal>;
  propiedades: ResultadoSeccionDataportal<PropiedadDataportal>;
  vehiculos: ResultadoSeccionDataportal<VehiculoDataportal>;
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
