export const NOMINA_READ_REPOSITORY = Symbol('NOMINA_READ_REPOSITORY');

export interface PersonaNominaReadModel {
  cedula: string;
  nombre: string | null;
  fechaIngreso: string | null;
  rol: string | null;
  posibleSalario: number | null;
}

export interface NominaReadRepository {
  contribuyenteExiste(id: string): Promise<boolean>;
  listar(
    id: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<PersonaNominaReadModel[]>;
}
