import { Inject, Injectable } from '@nestjs/common';
import {
  CATALOGO_READ_REPOSITORY,
  CatalogoReadRepository,
  FORMULARIO_POR_DEFECTO,
} from '../ports/catalogo-read.repository';

@Injectable()
export class ObtenerResumenCatalogoUseCase {
  constructor(
    @Inject(CATALOGO_READ_REPOSITORY)
    private readonly repository: CatalogoReadRepository,
  ) {}

  execute(formulario = FORMULARIO_POR_DEFECTO) {
    return this.repository.getSummary(formulario);
  }
}
