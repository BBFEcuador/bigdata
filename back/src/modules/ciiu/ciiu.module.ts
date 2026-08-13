import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CIIU_READ_REPOSITORY } from './application/ports/ciiu-read.repository';
import { ListarCiiuUseCase } from './application/use-cases/listar-ciiu.use-case';
import { ObtenerDetalleCiiuUseCase } from './application/use-cases/obtener-detalle-ciiu.use-case';
import { ObtenerResumenCiiuUseCase } from './application/use-cases/obtener-resumen-ciiu.use-case';
import { ActividadCiiu } from './infrastructure/persistence/entities/actividad-ciiu.entity';
import { TypeormCiiuReadRepository } from './infrastructure/persistence/typeorm-ciiu-read.repository';
import { CiiuController } from './presentation/ciiu.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ActividadCiiu])],
  controllers: [CiiuController],
  providers: [
    TypeormCiiuReadRepository,
    {
      provide: CIIU_READ_REPOSITORY,
      useExisting: TypeormCiiuReadRepository,
    },
    ListarCiiuUseCase,
    ObtenerDetalleCiiuUseCase,
    ObtenerResumenCiiuUseCase,
  ],
})
export class CiiuModule {}
