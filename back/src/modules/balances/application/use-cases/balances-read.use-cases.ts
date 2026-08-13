import { Inject, Injectable } from '@nestjs/common';
import {
  BALANCES_READ_REPOSITORY,
  BalancesQuery,
  BalancesReadRepository,
} from '../ports/balances-read.repository';

@Injectable()
export class ListarBalancesUseCase {
  constructor(
    @Inject(BALANCES_READ_REPOSITORY)
    private readonly repository: BalancesReadRepository,
  ) {}
  execute(query: BalancesQuery) {
    return this.repository.list(query);
  }
}

@Injectable()
export class ObtenerResumenBalancesUseCase {
  constructor(
    @Inject(BALANCES_READ_REPOSITORY)
    private readonly repository: BalancesReadRepository,
  ) {}
  execute() {
    return this.repository.summary();
  }
}

@Injectable()
export class ObtenerComparativoBalancesUseCase {
  constructor(
    @Inject(BALANCES_READ_REPOSITORY)
    private readonly repository: BalancesReadRepository,
  ) {}
  execute(expediente: string) {
    return this.repository.comparative(expediente);
  }
}

@Injectable()
export class ObtenerEstadosBalancesUseCase {
  constructor(
    @Inject(BALANCES_READ_REPOSITORY)
    private readonly repository: BalancesReadRepository,
  ) {}
  execute(expediente: string, formulario?: number) {
    return this.repository.statements(expediente, formulario);
  }
}

@Injectable()
export class ObtenerIndicadoresBalancesUseCase {
  constructor(
    @Inject(BALANCES_READ_REPOSITORY)
    private readonly repository: BalancesReadRepository,
  ) {}
  execute(expediente: string) {
    return this.repository.indicators(expediente);
  }
}

@Injectable()
export class ObtenerDetalleBalanceUseCase {
  constructor(
    @Inject(BALANCES_READ_REPOSITORY)
    private readonly repository: BalancesReadRepository,
  ) {}
  execute(expediente: string, anio: number, formulario?: number) {
    return this.repository.detail(expediente, anio, formulario);
  }
}
