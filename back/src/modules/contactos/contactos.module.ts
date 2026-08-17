import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CONTACTOS_READ_REPOSITORY } from './application/ports/contactos-read.repository';
import { ListarContactosContribuyenteUseCase } from './application/use-cases/listar-contactos-contribuyente.use-case';
import { DataportalContacto } from './infrastructure/persistence/entities/dataportal-contacto.entity';
import { TypeormContactosReadRepository } from './infrastructure/persistence/typeorm-contactos-read.repository';
import { ContactosController } from './presentation/contactos.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DataportalContacto])],
  controllers: [ContactosController],
  providers: [
    TypeormContactosReadRepository,
    {
      provide: CONTACTOS_READ_REPOSITORY,
      useExisting: TypeormContactosReadRepository,
    },
    ListarContactosContribuyenteUseCase,
  ],
})
export class ContactosModule {}
