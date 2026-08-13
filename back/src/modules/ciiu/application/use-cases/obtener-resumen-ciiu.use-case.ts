import { Inject, Injectable } from '@nestjs/common';
import {
  CIIU_READ_REPOSITORY,
  CiiuReadRepository,
} from '../ports/ciiu-read.repository';

@Injectable()
export class ObtenerResumenCiiuUseCase {
  constructor(
    @Inject(CIIU_READ_REPOSITORY)
    private readonly repository: CiiuReadRepository,
  ) {}

  execute() {
    return this.repository.getSummary();
  }
}
