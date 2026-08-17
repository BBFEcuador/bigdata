import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CONTACTOS_READ_REPOSITORY,
  ContactosReadRepository,
} from '../ports/contactos-read.repository';

@Injectable()
export class ListarContactosContribuyenteUseCase {
  constructor(
    @Inject(CONTACTOS_READ_REPOSITORY)
    private readonly repository: ContactosReadRepository,
  ) {}

  async execute(contribuyenteId: string, limit = 50, cursor?: string) {
    if (!(await this.repository.contribuyenteExiste(contribuyenteId))) {
      throw new NotFoundException(
        `No existe el contribuyente ${contribuyenteId}`,
      );
    }
    const filas = await this.repository.listar(
      contribuyenteId,
      cursor,
      limit + 1,
    );
    const hayMas = filas.length > limit;
    const datos = hayMas ? filas.slice(0, limit) : filas;
    return {
      datos,
      siguiente: hayMas ? (datos.at(-1)?.valor ?? null) : null,
    };
  }
}
