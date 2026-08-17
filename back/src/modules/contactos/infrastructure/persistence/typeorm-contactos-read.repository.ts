import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ContactoReadModel,
  ContactosReadRepository,
} from '../../application/ports/contactos-read.repository';
import { DataportalContacto } from './entities/dataportal-contacto.entity';

@Injectable()
export class TypeormContactosReadRepository implements ContactosReadRepository {
  constructor(
    @InjectRepository(DataportalContacto)
    private readonly repository: Repository<DataportalContacto>,
  ) {}

  async contribuyenteExiste(id: string): Promise<boolean> {
    const filas = await this.repository.query(
      `SELECT 1 FROM contribuyentes WHERE id = $1 LIMIT 1`,
      [id],
    );
    return filas.length > 0;
  }

  async listar(
    id: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<ContactoReadModel[]> {
    const qb = this.repository
      .createQueryBuilder('contacto')
      .select([
        'contacto.valor AS valor',
        'contacto.tipo AS tipo',
        'contacto.tipoCodigo AS "tipoCodigo"',
      ])
      .where('contacto.contribuyenteId = :id', { id })
      .orderBy('contacto.valor', 'ASC')
      .limit(limit);
    if (cursor) qb.andWhere('contacto.valor > :cursor', { cursor });
    return qb.getRawMany<ContactoReadModel>();
  }
}
