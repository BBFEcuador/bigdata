import {
  ContactoDataportal,
  PersonaNominaDataportal,
  PropiedadDataportal,
  VehiculoDataportal,
} from './dataportal-navigator';

export const DATAPORTAL_OBSERVACIONES_REPOSITORY = Symbol(
  'DATAPORTAL_OBSERVACIONES_REPOSITORY',
);

export interface IdentidadObservacionesDataportal {
  contribuyenteId: string;
  ruc: string;
}

/** Cada operación reemplaza una fotografía completa en su propia transacción. */
export interface DataportalObservacionesRepository {
  reemplazarContactos(
    identidad: IdentidadObservacionesDataportal,
    datos: ContactoDataportal[],
  ): Promise<void>;
  reemplazarNomina(
    identidad: IdentidadObservacionesDataportal,
    datos: PersonaNominaDataportal[],
  ): Promise<void>;
  reemplazarPropiedades(
    identidad: IdentidadObservacionesDataportal,
    datos: PropiedadDataportal[],
  ): Promise<void>;
  reemplazarVehiculos(
    identidad: IdentidadObservacionesDataportal,
    datos: VehiculoDataportal[],
  ): Promise<void>;
}
