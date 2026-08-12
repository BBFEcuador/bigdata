import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { TributarioService } from './tributario.service';
import { QueryRiesgoDto } from './dto/query-riesgo.dto';
import { QueryUtilidadesDto } from './dto/query-utilidades.dto';
import { QueryCreditoDto } from './dto/query-credito.dto';

@Controller('tributario')
export class TributarioController {
  constructor(private readonly service: TributarioService) {}

  /** Panorama por ejercicio y resoluciones que lo respaldan. */
  @Get('resumen')
  resumen() {
    return this.service.resumen();
  }

  /** Ranking de riesgo. Por defecto, población comparable del último ejercicio. */
  @Get('empresas')
  listar(@Query() query: QueryRiesgoDto) {
    return this.service.listar(query);
  }

  /**
   * Aviso del pago a cuenta sobre utilidades no distribuidas.
   *
   * Va antes de `empresas/:expediente` sólo por claridad; son rutas distintas.
   */
  @Get('utilidades-no-distribuidas')
  utilidadesNoDistribuidas(@Query() query: QueryUtilidadesDto) {
    return this.service.utilidadesNoDistribuidas(query);
  }

  /** Crédito tributario por compañía y ejercicio: la devolución potencial. */
  @Get('credito-tributario')
  creditoTributario(@Query() query: QueryCreditoDto) {
    return this.service.creditoTributario(query);
  }

  /** Ficha de una compañía: los cuatro ejercicios con sus tres bases. */
  @Get('empresas/:expediente')
  async ficha(@Param('expediente') expediente: string) {
    const ficha = await this.service.ficha(expediente);
    if (!ficha) throw new NotFoundException(`No existe la compañía ${expediente}.`);
    return ficha;
  }
}
