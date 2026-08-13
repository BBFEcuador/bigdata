import { Inject, Injectable } from '@nestjs/common';
import {
  BALANCES_PERCENTILES_REPOSITORY,
  BalancesPercentilesRepository,
} from '../ports/balances-read.repository';

@Injectable()
export class RecalcularPercentilesUseCase {
  constructor(
    @Inject(BALANCES_PERCENTILES_REPOSITORY)
    private readonly repository: BalancesPercentilesRepository,
  ) {}
  execute() {
    return this.repository.recalcular();
  }
}

@Injectable()
export class ObtenerSectorPercentilesUseCase {
  constructor(
    @Inject(BALANCES_PERCENTILES_REPOSITORY)
    private readonly repository: BalancesPercentilesRepository,
  ) {}
  execute(anio: number, codigo: string) {
    return this.repository.sector(anio, codigo);
  }
}

@Injectable()
export class ObtenerSectorialPercentilesUseCase {
  constructor(
    @Inject(BALANCES_PERCENTILES_REPOSITORY)
    private readonly repository: BalancesPercentilesRepository,
  ) {}
  execute(expediente: string) {
    return this.repository.sectorial(expediente);
  }
}

@Injectable()
export class SolicitarRecalculoPercentilesUseCase {
  constructor(
    @Inject(BALANCES_PERCENTILES_REPOSITORY)
    private readonly repository: BalancesPercentilesRepository,
  ) {}
  execute(motivo: string) {
    this.repository.solicitar(motivo);
  }
}
