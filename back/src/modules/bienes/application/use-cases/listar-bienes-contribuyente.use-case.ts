import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  BIENES_READ_REPOSITORY,
  BienesReadRepository,
} from '../ports/bienes-read.repository';

export interface ConsultaBienesContribuyente {
  contribuyenteId: string;
  limitPropiedades?: number;
  cursorPropiedades?: string;
  limitVehiculos?: number;
  cursorVehiculos?: string;
}

@Injectable()
export class ListarBienesContribuyenteUseCase {
  constructor(
    @Inject(BIENES_READ_REPOSITORY)
    private readonly repository: BienesReadRepository,
  ) {}

  async execute(consulta: ConsultaBienesContribuyente) {
    if (
      !(await this.repository.contribuyenteExiste(consulta.contribuyenteId))
    ) {
      throw new NotFoundException(
        `No existe el contribuyente ${consulta.contribuyenteId}`,
      );
    }
    const limitPropiedades = consulta.limitPropiedades ?? 50;
    const limitVehiculos = consulta.limitVehiculos ?? 50;
    const [propiedades, vehiculos] = await Promise.all([
      this.repository.listarPropiedades(
        consulta.contribuyenteId,
        consulta.cursorPropiedades,
        limitPropiedades + 1,
      ),
      this.repository.listarVehiculos(
        consulta.contribuyenteId,
        consulta.cursorVehiculos,
        limitVehiculos + 1,
      ),
    ]);
    return {
      propiedades: paginar(propiedades, limitPropiedades, 'cedulaCatastral'),
      vehiculos: paginar(vehiculos, limitVehiculos, 'placa'),
    };
  }
}

function paginar<T extends Record<K, string>, K extends keyof T>(
  filas: T[],
  limit: number,
  clave: K,
) {
  const hayMas = filas.length > limit;
  const datos = hayMas ? filas.slice(0, limit) : filas;
  return { siguiente: hayMas ? (datos.at(-1)?.[clave] ?? null) : null, datos };
}
