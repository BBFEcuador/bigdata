import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NOMINA_READ_REPOSITORY } from './application/ports/nomina-read.repository';
import { ListarNominaContribuyenteUseCase } from './application/use-cases/listar-nomina-contribuyente.use-case';
import { DataportalNomina } from './infrastructure/persistence/entities/dataportal-nomina.entity';
import { TypeormNominaReadRepository } from './infrastructure/persistence/typeorm-nomina-read.repository';
import { NominaController } from './presentation/nomina.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DataportalNomina])],
  controllers: [NominaController],
  providers: [
    TypeormNominaReadRepository,
    {
      provide: NOMINA_READ_REPOSITORY,
      useExisting: TypeormNominaReadRepository,
    },
    ListarNominaContribuyenteUseCase,
  ],
})
export class NominaModule {}
