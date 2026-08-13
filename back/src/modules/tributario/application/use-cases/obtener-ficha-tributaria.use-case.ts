import { Inject, Injectable } from '@nestjs/common';
import {
  TRIBUTARIO_READ_REPOSITORY,
  TributarioReadRepository,
} from '../ports/tributario-read.repository';

@Injectable()
export class ObtenerFichaTributariaUseCase {
  constructor(
    @Inject(TRIBUTARIO_READ_REPOSITORY)
    private readonly repository: TributarioReadRepository,
  ) {}

  execute(expediente: string) {
    return this.repository.getFicha(expediente);
  }
}
