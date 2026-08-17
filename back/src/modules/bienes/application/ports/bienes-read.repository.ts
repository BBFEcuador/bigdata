export const BIENES_READ_REPOSITORY = Symbol('BIENES_READ_REPOSITORY');

export interface PropiedadReadModel {
  cedulaCatastral: string;
  parroquia: string | null;
  codigoCalle: string | null;
  callePrincipal: string | null;
  numero: string | null;
  barrioSector: string | null;
  zona: string | null;
  telefono: string | null;
}

export interface VehiculoReadModel {
  tipo: string | null;
  modelo: string | null;
  marca: string | null;
  anio: number | null;
  placa: string;
  lugar: string | null;
  fechaVencimiento: string | null;
}

export interface BienesReadRepository {
  contribuyenteExiste(id: string): Promise<boolean>;
  listarPropiedades(
    id: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<PropiedadReadModel[]>;
  listarVehiculos(
    id: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<VehiculoReadModel[]>;
}
