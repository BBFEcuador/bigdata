import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BIENES_READ_REPOSITORY } from './application/ports/bienes-read.repository';
import { ListarBienesContribuyenteUseCase } from './application/use-cases/listar-bienes-contribuyente.use-case';
import { DataportalPropiedad } from './infrastructure/persistence/entities/dataportal-propiedad.entity';
import { DataportalVehiculo } from './infrastructure/persistence/entities/dataportal-vehiculo.entity';
import { TypeormBienesReadRepository } from './infrastructure/persistence/typeorm-bienes-read.repository';
import { BienesController } from './presentation/bienes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DataportalPropiedad, DataportalVehiculo])],
  controllers: [BienesController],
  providers: [
    TypeormBienesReadRepository,
    {
      provide: BIENES_READ_REPOSITORY,
      useExisting: TypeormBienesReadRepository,
    },
    ListarBienesContribuyenteUseCase,
  ],
})
export class BienesModule {}
