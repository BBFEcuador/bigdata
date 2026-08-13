import { Inject, Injectable } from '@nestjs/common';
import {
  COMPANIAS_READ_REPOSITORY,
  CompaniasReadRepository,
} from '../ports/companias-read.repository';

@Injectable()
export class ObtenerFacetasCompaniasUseCase {
  constructor(
    @Inject(COMPANIAS_READ_REPOSITORY)
    private readonly repository: CompaniasReadRepository,
  ) {}

  execute() {
    return this.repository.findFacetas();
  }
}
