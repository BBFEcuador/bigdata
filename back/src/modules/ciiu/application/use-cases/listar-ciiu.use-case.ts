import { Inject, Injectable } from '@nestjs/common';
import {
  ActividadCiiuConCompanias,
  CIIU_READ_REPOSITORY,
  CiiuQuery,
  CiiuReadRepository,
} from '../ports/ciiu-read.repository';

@Injectable()
export class ListarCiiuUseCase {
  constructor(
    @Inject(CIIU_READ_REPOSITORY)
    private readonly repository: CiiuReadRepository,
  ) {}

  async execute(query: CiiuQuery) {
    const datos = await this.repository.findMany(query);
    if (query.conConteo !== 'true') return { datos, total: datos.length };

    const conteos = await this.repository.findCompanyCounts();
    const conCompanias: ActividadCiiuConCompanias[] = datos.map(
      (actividad) => ({
        ...actividad,
        companias: actividad.codigoSupercias
          ? (conteos.get(actividad.codigoSupercias) ?? 0)
          : null,
      }),
    );
    return { datos: conCompanias, total: conCompanias.length };
  }
}
