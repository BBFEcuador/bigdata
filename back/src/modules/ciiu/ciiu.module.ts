import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActividadCiiu } from './entities/actividad-ciiu.entity';
import { CiiuController } from './ciiu.controller';
import { CiiuService } from './ciiu.service';

@Module({
  imports: [TypeOrmModule.forFeature([ActividadCiiu])],
  controllers: [CiiuController],
  providers: [CiiuService],
  exports: [CiiuService],
})
export class CiiuModule {}
