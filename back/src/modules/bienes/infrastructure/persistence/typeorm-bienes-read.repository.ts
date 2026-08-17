import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BienesReadRepository,
  PropiedadReadModel,
  VehiculoReadModel,
} from '../../application/ports/bienes-read.repository';
import { DataportalPropiedad } from './entities/dataportal-propiedad.entity';
import { DataportalVehiculo } from './entities/dataportal-vehiculo.entity';

@Injectable()
export class TypeormBienesReadRepository implements BienesReadRepository {
  constructor(
    @InjectRepository(DataportalPropiedad)
    private readonly propiedades: Repository<DataportalPropiedad>,
    @InjectRepository(DataportalVehiculo)
    private readonly vehiculos: Repository<DataportalVehiculo>,
  ) {}

  async contribuyenteExiste(id: string): Promise<boolean> {
    const filas = await this.propiedades.query(
      `SELECT 1 FROM contribuyentes WHERE id = $1 LIMIT 1`,
      [id],
    );
    return filas.length > 0;
  }

  listarPropiedades(
    id: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<PropiedadReadModel[]> {
    const qb = this.propiedades
      .createQueryBuilder('propiedad')
      .select([
        'propiedad.cedulaCatastral AS "cedulaCatastral"',
        'propiedad.parroquia AS parroquia',
        'propiedad.codigoCalle AS "codigoCalle"',
        'propiedad.callePrincipal AS "callePrincipal"',
        'propiedad.numero AS numero',
        'propiedad.barrioSector AS "barrioSector"',
        'propiedad.zona AS zona',
        'propiedad.telefono AS telefono',
      ])
      .where('propiedad.contribuyenteId = :id', { id })
      .orderBy('propiedad.cedulaCatastral', 'ASC')
      .limit(limit);
    if (cursor) qb.andWhere('propiedad.cedulaCatastral > :cursor', { cursor });
    return qb.getRawMany<PropiedadReadModel>();
  }

  async listarVehiculos(
    id: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<VehiculoReadModel[]> {
    const qb = this.vehiculos
      .createQueryBuilder('vehiculo')
      .select([
        'vehiculo.tipo AS tipo',
        'vehiculo.modelo AS modelo',
        'vehiculo.marca AS marca',
        'vehiculo.anio AS anio',
        'vehiculo.placa AS placa',
        'vehiculo.lugar AS lugar',
        `to_char(vehiculo.fechaVencimiento, 'YYYY-MM-DD HH24:MI:SS') AS "fechaVencimiento"`,
      ])
      .where('vehiculo.contribuyenteId = :id', { id })
      .orderBy('vehiculo.placa', 'ASC')
      .limit(limit);
    if (cursor) qb.andWhere('vehiculo.placa > :cursor', { cursor });
    const filas = await qb.getRawMany<
      Omit<VehiculoReadModel, 'anio'> & { anio: string | number | null }
    >();
    return filas.map((fila) => ({
      ...fila,
      anio: fila.anio === null ? null : Number(fila.anio),
    }));
  }
}
