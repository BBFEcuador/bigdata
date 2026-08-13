import { Inject, Injectable } from '@nestjs/common';
import {
  COMPANIAS_READ_REPOSITORY,
  CompaniasReadRepository,
} from '../ports/companias-read.repository';

@Injectable()
export class ObtenerCompaniaUseCase {
  constructor(
    @Inject(COMPANIAS_READ_REPOSITORY)
    private readonly repository: CompaniasReadRepository,
  ) {}

  execute(expedienteOrRuc: string) {
    return this.repository.findByExpedienteOrRuc(expedienteOrRuc);
  }
}
