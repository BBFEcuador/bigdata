export const CONTACTOS_READ_REPOSITORY = Symbol('CONTACTOS_READ_REPOSITORY');

export interface ContactoReadModel {
  valor: string;
  tipo: 'email' | 'telefono' | 'otro';
  tipoCodigo: string | null;
}

export interface ContactosReadRepository {
  contribuyenteExiste(id: string): Promise<boolean>;
  listar(
    id: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<ContactoReadModel[]>;
}
