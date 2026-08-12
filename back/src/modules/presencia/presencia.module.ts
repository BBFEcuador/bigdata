import { Module } from '@nestjs/common';
import { PresenciaController } from './presencia.controller';
import { PresenciaService } from './presencia.service';

/**
 * Curación de la presencia digital.
 *
 * Va aparte del módulo de importación a propósito: el rastreador de
 * `imports/web` genera propuestas y esto las valida. Son dos ritmos distintos
 * —uno tarda horas y corre solo, el otro es una persona haciendo clic— y
 * mezclarlos haría que la pantalla de revisión dependiera del importador.
 */
@Module({
  controllers: [PresenciaController],
  providers: [PresenciaService],
  exports: [PresenciaService],
})
export class PresenciaModule {}
