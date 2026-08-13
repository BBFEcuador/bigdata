import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  BALANCES_PERCENTILES_REPOSITORY,
  BALANCES_READ_REPOSITORY,
} from './application/ports/balances-read.repository';
import {
  ListarBalancesUseCase,
  ObtenerComparativoBalancesUseCase,
  ObtenerDetalleBalanceUseCase,
  ObtenerEstadosBalancesUseCase,
  ObtenerIndicadoresBalancesUseCase,
  ObtenerResumenBalancesUseCase,
} from './application/use-cases/balances-read.use-cases';
import {
  ObtenerSectorialPercentilesUseCase,
  ObtenerSectorPercentilesUseCase,
  RecalcularPercentilesUseCase,
  SolicitarRecalculoPercentilesUseCase,
} from './application/use-cases/percentiles.use-cases';
import { Balance } from './infrastructure/persistence/entities/balance.entity';
import { PercentilesService } from './infrastructure/persistence/percentiles.service';
import { TypeormBalancesReadRepository } from './infrastructure/persistence/typeorm-balances-read.repository';
import { BalancesController } from './presentation/balances.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Balance])],
  controllers: [BalancesController],
  providers: [
    TypeormBalancesReadRepository,
    {
      provide: BALANCES_READ_REPOSITORY,
      useExisting: TypeormBalancesReadRepository,
    },
    PercentilesService,
    {
      provide: BALANCES_PERCENTILES_REPOSITORY,
      useExisting: PercentilesService,
    },
    ListarBalancesUseCase,
    ObtenerResumenBalancesUseCase,
    ObtenerComparativoBalancesUseCase,
    ObtenerEstadosBalancesUseCase,
    ObtenerIndicadoresBalancesUseCase,
    ObtenerDetalleBalanceUseCase,
    RecalcularPercentilesUseCase,
    ObtenerSectorPercentilesUseCase,
    ObtenerSectorialPercentilesUseCase,
    SolicitarRecalculoPercentilesUseCase,
  ],
  exports: [SolicitarRecalculoPercentilesUseCase],
})
export class BalancesModule {}
