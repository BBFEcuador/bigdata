import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { COMPANIAS_READ_REPOSITORY } from './application/ports/companias-read.repository';
import { ExportarCompaniasCsvUseCase } from './application/use-cases/exportar-companias-csv.use-case';
import { ListarCompaniasUseCase } from './application/use-cases/listar-companias.use-case';
import { ObtenerCompaniaUseCase } from './application/use-cases/obtener-compania.use-case';
import { ObtenerFacetasCompaniasUseCase } from './application/use-cases/obtener-facetas-companias.use-case';
import { ObtenerFichaCompaniaUseCase } from './application/use-cases/obtener-ficha-compania.use-case';
import { Compania } from './infrastructure/persistence/entities/compania.entity';
import { TypeormCompaniasReadRepository } from './infrastructure/persistence/typeorm-companias-read.repository';
import { CompaniasController } from './presentation/companias.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Compania])],
  controllers: [CompaniasController],
  providers: [
    TypeormCompaniasReadRepository,
    {
      provide: COMPANIAS_READ_REPOSITORY,
      useExisting: TypeormCompaniasReadRepository,
    },
    ListarCompaniasUseCase,
    ExportarCompaniasCsvUseCase,
    ObtenerCompaniaUseCase,
    ObtenerFichaCompaniaUseCase,
    ObtenerFacetasCompaniasUseCase,
  ],
})
export class CompaniasModule {}
