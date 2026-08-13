import { Inject, Injectable } from '@nestjs/common';
import {
  ConsultaCredito,
  TRIBUTARIO_READ_REPOSITORY,
  TributarioReadRepository,
} from '../ports/tributario-read.repository';

@Injectable()
export class ListarCreditoTributarioUseCase {
  constructor(
    @Inject(TRIBUTARIO_READ_REPOSITORY)
    private readonly repository: TributarioReadRepository,
  ) {}

  async execute(query: Partial<ConsultaCredito>) {
    const consulta: ConsultaCredito = {
      ...query,
      soloComparables: query.soloComparables !== false,
      rama: query.rama?.toUpperCase(),
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    };
    const metadatos = await this.repository.getMetadatosCredito();
    const resultado = await this.repository.listarCredito(
      consulta,
      metadatos.ultimo,
    );
    return {
      ...metadatos,
      ...resultado,
      limit: consulta.limit,
      offset: consulta.offset,
    };
  }
}
