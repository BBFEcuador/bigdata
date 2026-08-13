import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { COMPANIAS_READ_REPOSITORY } from './application/ports/companias-read.repository';
import { Compania } from './infrastructure/persistence/entities/compania.entity';
import { TypeormCompaniasReadRepository } from './infrastructure/persistence/typeorm-companias-read.repository';
import { CompaniasModule } from './companias.module';

describe('CompaniasModule', () => {
  it('enlaza el puerto de lectura con el adaptador TypeORM', async () => {
    const module = await Test.createTestingModule({
      imports: [CompaniasModule],
    })
      .overrideProvider(getRepositoryToken(Compania))
      .useValue({})
      .compile();

    expect(module.get(COMPANIAS_READ_REPOSITORY)).toBeInstanceOf(
      TypeormCompaniasReadRepository,
    );
  });
});
