import { Inject, Injectable } from '@nestjs/common';
import {
  COMPANIAS_READ_REPOSITORY,
  CompaniasQuery,
  CompaniasReadRepository,
} from '../ports/companias-read.repository';
import { conNombreActividad } from './actividad-companias';

@Injectable()
export class ListarCompaniasUseCase {
  constructor(
    @Inject(COMPANIAS_READ_REPOSITORY)
    private readonly repository: CompaniasReadRepository,
  ) {}

  async execute(query: CompaniasQuery) {
    const limit = query.limit ?? 50;
    const filas = await this.repository.findPage(query, limit + 1);
    const hayMas = filas.length > limit;
    const datos = hayMas ? filas.slice(0, limit) : filas;
    const ultima = datos[datos.length - 1];

    return {
      datos: await conNombreActividad(this.repository, datos),
      cursorSiguiente:
        hayMas && ultima
          ? (ultima.expediente ?? ultima.ruc ?? ultima.id)
          : null,
      hayMas,
      total: await this.repository.countBounded(query),
    };
  }
}
