import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BALANCES_READ_REPOSITORY } from './application/ports/balances-read.repository';
import { BalancesModule } from './balances.module';
import { Balance } from './infrastructure/persistence/entities/balance.entity';
import { TypeormBalancesReadRepository } from './infrastructure/persistence/typeorm-balances-read.repository';
import { PercentilesService } from './infrastructure/persistence/percentiles.service';

describe('BalancesModule', () => {
  it('enlaza el puerto de lectura con el adaptador TypeORM', async () => {
    const module = await Test.createTestingModule({ imports: [BalancesModule] })
      .overrideProvider(getRepositoryToken(Balance))
      .useValue({})
      .overrideProvider(PercentilesService)
      .useValue({})
      .compile();

    expect(module.get(BALANCES_READ_REPOSITORY)).toBeInstanceOf(
      TypeormBalancesReadRepository,
    );
  });
});
