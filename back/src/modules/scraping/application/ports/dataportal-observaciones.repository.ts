import {
  ContactoDataportal,
  PersonaNominaDataportal,
} from './dataportal-navigator';

export const DATAPORTAL_OBSERVACIONES_REPOSITORY = Symbol(
  'DATAPORTAL_OBSERVACIONES_REPOSITORY',
);

export interface ReemplazoObservacionesDataportal {
  contribuyenteId: string;
  ruc: string;
  contactos: ContactoDataportal[];
  nomina: PersonaNominaDataportal[];
}

/** Escritura atómica de la fotografía completa observada en DataPortal. */
export interface DataportalObservacionesRepository {
  reemplazar(datos: ReemplazoObservacionesDataportal): Promise<void>;
}
