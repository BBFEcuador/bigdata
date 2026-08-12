import { Module } from '@nestjs/common';
import { TributarioController } from './tributario.controller';
import { TributarioService } from './tributario.service';

/**
 * Riesgo tributario: sólo lectura.
 *
 * No registra ninguna entidad de TypeORM porque no hay ninguna que registrar:
 * todo son vistas materializadas que llena `npm run coeficientes`. Declararlas
 * como entidades invitaría a escribir en ellas.
 */
@Module({
  controllers: [TributarioController],
  providers: [TributarioService],
})
export class TributarioModule {}
