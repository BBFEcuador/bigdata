import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  CompaniaParaScraping,
  CompaniasScrapingRepository,
} from '../../application/ports/companias-scraping.repository';

@Injectable()
export class PostgresCompaniasScrapingRepository implements CompaniasScrapingRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async buscarPorExpediente(
    expediente: string,
  ): Promise<CompaniaParaScraping | null> {
    const [compania] = await this.dataSource.query(
      `SELECT id, expediente, ruc
         FROM contribuyentes
        WHERE tipo = 'companies' AND expediente = $1
        LIMIT 1`,
      [expediente],
    );
    return compania ?? null;
  }
}
