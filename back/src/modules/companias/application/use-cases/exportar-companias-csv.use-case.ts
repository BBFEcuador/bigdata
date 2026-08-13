import { Inject, Injectable } from '@nestjs/common';
import {
  COMPANIAS_READ_REPOSITORY,
  CompaniasQuery,
  CompaniasReadRepository,
} from '../ports/companias-read.repository';

@Injectable()
export class ExportarCompaniasCsvUseCase {
  constructor(
    @Inject(COMPANIAS_READ_REPOSITORY)
    private readonly repository: CompaniasReadRepository,
  ) {}

  async execute(query: CompaniasQuery): Promise<string> {
    const filas = await this.repository.findForExport(query, 10_000);
    const columnas = [
      'tipo',
      'expediente',
      'ruc',
      'nombre',
      'provincia',
      'canton',
      'estado',
    ];
    const valor = (value: unknown) => {
      const texto = value === null || value === undefined ? '' : String(value);
      return `"${texto.replace(/"/g, '""')}"`;
    };
    const lineas = filas.map((fila) =>
      [
        fila.tipo,
        fila.expediente,
        fila.ruc,
        fila.nombre,
        fila.provincia,
        fila.canton,
        fila.estadoContribuyente,
      ]
        .map(valor)
        .join(';'),
    );
    return `\ufeff${[columnas.join(';'), ...lineas].join('\n')}\n`;
  }
}
