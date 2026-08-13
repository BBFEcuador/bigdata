import { Inject, Injectable } from '@nestjs/common';
import {
  TRIBUTARIO_READ_REPOSITORY,
  TributarioReadRepository,
} from '../ports/tributario-read.repository';

@Injectable()
export class ObtenerResumenTributarioUseCase {
  constructor(
    @Inject(TRIBUTARIO_READ_REPOSITORY)
    private readonly repository: TributarioReadRepository,
  ) {}

  execute() {
    return this.repository.getResumen();
  }
}
