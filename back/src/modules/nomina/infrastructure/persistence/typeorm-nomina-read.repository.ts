import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NominaReadRepository,
  PersonaNominaReadModel,
} from '../../application/ports/nomina-read.repository';
import { DataportalNomina } from './entities/dataportal-nomina.entity';

@Injectable()
export class TypeormNominaReadRepository implements NominaReadRepository {
  constructor(
    @InjectRepository(DataportalNomina)
    private readonly repository: Repository<DataportalNomina>,
  ) {}

  async contribuyenteExiste(id: string): Promise<boolean> {
    return (
      (
        await this.repository.query(
          `SELECT 1 FROM contribuyentes WHERE id = $1 LIMIT 1`,
          [id],
        )
      ).length > 0
    );
  }

  async listar(
    id: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<PersonaNominaReadModel[]> {
    const qb = this.repository
      .createQueryBuilder('persona')
      .select([
        'persona.cedula AS cedula',
        'persona.nombre AS nombre',
        'persona.fechaIngreso AS "fechaIngreso"',
        'persona.rol AS rol',
        'persona.posibleSalario AS "posibleSalario"',
      ])
      .where('persona.contribuyenteId = :id', { id })
      .orderBy('persona.cedula', 'ASC')
      .limit(limit);
    if (cursor) qb.andWhere('persona.cedula > :cursor', { cursor });
    const filas = await qb.getRawMany<
      PersonaNominaReadModel & { posibleSalario: string | null }
    >();
    return filas.map((fila) => ({
      ...fila,
      posibleSalario:
        fila.posibleSalario === null ? null : Number(fila.posibleSalario),
    }));
  }
}
