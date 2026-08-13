import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CIIU_READ_REPOSITORY,
  CiiuReadRepository,
} from '../ports/ciiu-read.repository';

@Injectable()
export class ObtenerDetalleCiiuUseCase {
  constructor(
    @Inject(CIIU_READ_REPOSITORY)
    private readonly repository: CiiuReadRepository,
  ) {}

  async execute(codigo: string) {
    const actividad = await this.repository.findByCodigo(codigo.toUpperCase());
    if (!actividad)
      throw new NotFoundException(`No existe la actividad ${codigo}`);

    const [padre, hijos, companias] = await Promise.all([
      actividad.codigoPadre
        ? this.repository.findByCodigo(actividad.codigoPadre)
        : Promise.resolve(null),
      this.repository.findChildren(actividad.codigo),
      this.repository.countCompaniesByCode(actividad.codigo),
    ]);
    return { actividad, padre, hijos, companias };
  }
}
