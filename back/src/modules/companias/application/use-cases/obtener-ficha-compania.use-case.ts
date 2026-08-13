import { Inject, Injectable } from '@nestjs/common';
import {
  COMPANIAS_READ_REPOSITORY,
  CompaniasReadRepository,
} from '../ports/companias-read.repository';
import { conNombreActividad } from './actividad-companias';

@Injectable()
export class ObtenerFichaCompaniaUseCase {
  constructor(
    @Inject(COMPANIAS_READ_REPOSITORY)
    private readonly repository: CompaniasReadRepository,
  ) {}

  async execute(expediente: string) {
    const compania = await this.repository.findByExpedienteOrRuc(expediente);
    if (!compania) return null;
    const [relaciones, [conActividad]] = await Promise.all([
      this.repository.findFichaRelaciones(compania.ruc, expediente),
      conNombreActividad(this.repository, [compania]),
    ]);
    return {
      compania: conActividad,
      establecimientos: relaciones.establecimientos,
      ejercicios: relaciones.ejercicios.map(({ anio, formulario }) => ({
        anio: Number(anio),
        formulario: Number(formulario),
      })),
      turismo: relaciones.turismo,
      catastros: relaciones.catastros,
    };
  }
}
