import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CIIU_READ_REPOSITORY } from './application/ports/ciiu-read.repository';
import { ActividadCiiu } from './infrastructure/persistence/entities/actividad-ciiu.entity';
import { TypeormCiiuReadRepository } from './infrastructure/persistence/typeorm-ciiu-read.repository';
import { CiiuModule } from './ciiu.module';

describe('CiiuModule', () => {
  it('enlaza el puerto de lectura con el adaptador TypeORM', async () => {
    const module = await Test.createTestingModule({
      imports: [CiiuModule],
    })
      .overrideProvider(getRepositoryToken(ActividadCiiu))
      .useValue({})
      .compile();

    expect(module.get(CIIU_READ_REPOSITORY)).toBeInstanceOf(
      TypeormCiiuReadRepository,
    );
  });
});
