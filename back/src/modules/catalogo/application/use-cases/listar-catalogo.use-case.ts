import { Inject, Injectable } from '@nestjs/common';
import {
  CATALOGO_READ_REPOSITORY,
  CatalogoQuery,
  CatalogoReadRepository,
  FORMULARIO_POR_DEFECTO,
} from '../ports/catalogo-read.repository';

@Injectable()
export class ListarCatalogoUseCase {
  constructor(
    @Inject(CATALOGO_READ_REPOSITORY)
    private readonly repository: CatalogoReadRepository,
  ) {}

  async execute(query: CatalogoQuery) {
    const datos = await this.repository.findMany(
      query,
      query.formulario ?? FORMULARIO_POR_DEFECTO,
    );
    return { datos, total: datos.length };
  }
}
