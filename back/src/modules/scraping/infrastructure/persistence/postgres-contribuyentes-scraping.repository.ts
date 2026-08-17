import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  ContribuyenteParaScraping,
  ContribuyentesScrapingRepository,
} from '../../application/ports/contribuyentes-scraping.repository';
import { ORIGEN_SUJETO, TipoSujeto } from '../../scraping.sujetos';

@Injectable()
export class PostgresContribuyentesScrapingRepository implements ContribuyentesScrapingRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async buscar(
    tipoSujeto: TipoSujeto,
    clave: string,
  ): Promise<ContribuyenteParaScraping | null> {
    const origen = ORIGEN_SUJETO[tipoSujeto];
    const [contribuyente] = await this.dataSource.query(
      `SELECT id, ruc
         FROM ${origen.tabla}
        WHERE ${origen.filtro} AND ${origen.columna} = $1
        LIMIT 1`,
      [clave],
    );
    return contribuyente ?? null;
  }
}
