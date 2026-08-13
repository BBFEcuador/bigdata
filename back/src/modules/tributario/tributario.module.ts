import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TRIBUTARIO_READ_REPOSITORY } from './application/ports/tributario-read.repository';
import { ListarCreditoTributarioUseCase } from './application/use-cases/listar-credito-tributario.use-case';
import { ListarRiesgoTributarioUseCase } from './application/use-cases/listar-riesgo-tributario.use-case';
import { ListarUtilidadesNoDistribuidasUseCase } from './application/use-cases/listar-utilidades-no-distribuidas.use-case';
import { ObtenerFichaTributariaUseCase } from './application/use-cases/obtener-ficha-tributaria.use-case';
import { ObtenerResumenTributarioUseCase } from './application/use-cases/obtener-resumen-tributario.use-case';
import { RiesgoTributarioAnio } from './infrastructure/persistence/entities/riesgo-tributario-anio.entity';
import { TypeormTributarioReadRepository } from './infrastructure/persistence/typeorm-tributario-read.repository';
import { TributarioController } from './presentation/tributario.controller';

/** Riesgo tributario: consultas de sólo lectura sobre vistas precalculadas. */
@Module({
  imports: [TypeOrmModule.forFeature([RiesgoTributarioAnio])],
  controllers: [TributarioController],
  providers: [
    TypeormTributarioReadRepository,
    {
      provide: TRIBUTARIO_READ_REPOSITORY,
      useExisting: TypeormTributarioReadRepository,
    },
    ObtenerResumenTributarioUseCase,
    ListarRiesgoTributarioUseCase,
    ListarUtilidadesNoDistribuidasUseCase,
    ListarCreditoTributarioUseCase,
    ObtenerFichaTributariaUseCase,
  ],
})
export class TributarioModule {}
