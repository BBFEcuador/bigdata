import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CATALOGO_READ_REPOSITORY } from './application/ports/catalogo-read.repository';
import { CatalogoModule } from './catalogo.module';
import { CategoriaCuenta } from './infrastructure/persistence/entities/categoria-cuenta.entity';
import { TypeormCatalogoReadRepository } from './infrastructure/persistence/typeorm-catalogo-read.repository';

describe('CatalogoModule', () => {
  it('enlaza el puerto de lectura con el adaptador TypeORM', async () => {
    const module = await Test.createTestingModule({
      imports: [CatalogoModule],
    })
      .overrideProvider(getRepositoryToken(CategoriaCuenta))
      .useValue({})
      .compile();

    expect(module.get(CATALOGO_READ_REPOSITORY)).toBeInstanceOf(
      TypeormCatalogoReadRepository,
    );
  });
});
