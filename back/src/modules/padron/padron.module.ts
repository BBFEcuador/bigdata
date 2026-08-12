import { Module } from '@nestjs/common';
import { PadronController } from './padron.controller';
import { PadronService } from './padron.service';

/**
 * Padrón del SRI: personas naturales, sociedades no supervisadas y
 * establecimientos.
 *
 * Sin entidades de TypeORM: las tres tablas se consultan con SQL directo porque
 * las consultas son agregaciones y keyset sobre tablas de millones de filas, no
 * navegación por relaciones.
 */
@Module({
  controllers: [PadronController],
  providers: [PadronService],
  exports: [PadronService],
})
export class PadronModule {}
