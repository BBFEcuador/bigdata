import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Compania } from './entities/compania.entity';
import { CompaniasController } from './companias.controller';
import { CompaniasService } from './companias.service';

@Module({
  imports: [TypeOrmModule.forFeature([Compania])],
  controllers: [CompaniasController],
  providers: [CompaniasService],
  exports: [CompaniasService],
})
export class CompaniasModule {}
