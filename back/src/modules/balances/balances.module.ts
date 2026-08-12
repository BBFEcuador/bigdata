import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Balance } from './entities/balance.entity';
import { BalancesController } from './balances.controller';
import { BalancesService } from './balances.service';
import { PercentilesService } from './percentiles.service';

@Module({
  imports: [TypeOrmModule.forFeature([Balance])],
  controllers: [BalancesController],
  providers: [BalancesService, PercentilesService],
  exports: [BalancesService, PercentilesService],
})
export class BalancesModule {}
