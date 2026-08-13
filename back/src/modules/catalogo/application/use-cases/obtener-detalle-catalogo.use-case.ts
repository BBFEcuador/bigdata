import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CATALOGO_READ_REPOSITORY,
  CatalogoReadRepository,
  FORMULARIO_POR_DEFECTO,
} from '../ports/catalogo-read.repository';

@Injectable()
export class ObtenerDetalleCatalogoUseCase {
  constructor(
    @Inject(CATALOGO_READ_REPOSITORY)
    private readonly repository: CatalogoReadRepository,
  ) {}

  async execute(codigo: string, formulario = FORMULARIO_POR_DEFECTO) {
    const cuenta = await this.repository.findByCodigo(codigo, formulario);
    if (!cuenta) throw new NotFoundException(`No existe la cuenta ${codigo}`);

    const [padre, hijos] = await Promise.all([
      cuenta.codigoPadre
        ? this.repository.findByCodigo(cuenta.codigoPadre, formulario)
        : Promise.resolve(null),
      this.repository.findChildren(codigo, formulario),
    ]);
    return { cuenta, padre, hijos };
  }
}
