import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CATALOGO_READ_REPOSITORY } from './application/ports/catalogo-read.repository';
import { ListarCatalogoUseCase } from './application/use-cases/listar-catalogo.use-case';
import { ObtenerDetalleCatalogoUseCase } from './application/use-cases/obtener-detalle-catalogo.use-case';
import { ObtenerResumenCatalogoUseCase } from './application/use-cases/obtener-resumen-catalogo.use-case';
import { CategoriaCuenta } from './infrastructure/persistence/entities/categoria-cuenta.entity';
import { TypeormCatalogoReadRepository } from './infrastructure/persistence/typeorm-catalogo-read.repository';
import { CatalogoController } from './presentation/catalogo.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CategoriaCuenta])],
  controllers: [CatalogoController],
  providers: [
    TypeormCatalogoReadRepository,
    {
      provide: CATALOGO_READ_REPOSITORY,
      useExisting: TypeormCatalogoReadRepository,
    },
    ListarCatalogoUseCase,
    ObtenerDetalleCatalogoUseCase,
    ObtenerResumenCatalogoUseCase,
  ],
})
export class CatalogoModule {}
