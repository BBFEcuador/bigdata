import { Inject, Injectable } from '@nestjs/common';
import {
  ConsultaRiesgo,
  TRIBUTARIO_READ_REPOSITORY,
  TributarioReadRepository,
} from '../ports/tributario-read.repository';

@Injectable()
export class ListarRiesgoTributarioUseCase {
  constructor(
    @Inject(TRIBUTARIO_READ_REPOSITORY)
    private readonly repository: TributarioReadRepository,
  ) {}

  async execute(query: Partial<ConsultaRiesgo>) {
    const consulta: ConsultaRiesgo = {
      ...query,
      poblacion: query.poblacion ?? 'comparable',
      orden: query.orden ?? 'percentil',
      rama: normalizarRama(query.rama),
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    };
    const resultado = await this.repository.listarRiesgo(consulta);
    return { ...resultado, limit: consulta.limit, offset: consulta.offset };
  }
}

function normalizarRama(rama?: string): string | undefined {
  return rama?.toUpperCase();
}
