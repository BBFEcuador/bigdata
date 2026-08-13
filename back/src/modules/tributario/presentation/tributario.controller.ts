import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import {
  ConsultaCredito,
  ConsultaRiesgo,
  ConsultaUtilidades,
} from '../application/ports/tributario-read.repository';
import { ListarCreditoTributarioUseCase } from '../application/use-cases/listar-credito-tributario.use-case';
import { ListarRiesgoTributarioUseCase } from '../application/use-cases/listar-riesgo-tributario.use-case';
import { ListarUtilidadesNoDistribuidasUseCase } from '../application/use-cases/listar-utilidades-no-distribuidas.use-case';
import { ObtenerFichaTributariaUseCase } from '../application/use-cases/obtener-ficha-tributaria.use-case';
import { ObtenerResumenTributarioUseCase } from '../application/use-cases/obtener-resumen-tributario.use-case';
import { QueryCreditoDto } from './dto/query-credito.dto';
import { QueryRiesgoDto } from './dto/query-riesgo.dto';
import { QueryUtilidadesDto } from './dto/query-utilidades.dto';

@Controller('tributario')
export class TributarioController {
  constructor(
    private readonly resumenTributario: ObtenerResumenTributarioUseCase,
    private readonly listarRiesgo: ListarRiesgoTributarioUseCase,
    private readonly listarUtilidades: ListarUtilidadesNoDistribuidasUseCase,
    private readonly listarCredito: ListarCreditoTributarioUseCase,
    private readonly obtenerFicha: ObtenerFichaTributariaUseCase,
  ) {}

  @Get('resumen')
  resumen() {
    return this.resumenTributario.execute();
  }

  @Get('empresas')
  listar(@Query() query: QueryRiesgoDto) {
    return this.listarRiesgo.execute(aConsultaRiesgo(query));
  }

  @Get('utilidades-no-distribuidas')
  utilidadesNoDistribuidas(@Query() query: QueryUtilidadesDto) {
    return this.listarUtilidades.execute(aConsultaUtilidades(query));
  }

  @Get('credito-tributario')
  creditoTributario(@Query() query: QueryCreditoDto) {
    return this.listarCredito.execute(aConsultaCredito(query));
  }

  @Get('empresas/:expediente')
  async ficha(@Param('expediente') expediente: string) {
    const ficha = await this.obtenerFicha.execute(expediente);
    if (!ficha)
      throw new NotFoundException(`No existe la compañía ${expediente}.`);
    return ficha;
  }
}

function aConsultaRiesgo(dto: QueryRiesgoDto): Partial<ConsultaRiesgo> {
  return {
    anio: dto.anio,
    poblacion: dto.poblacion,
    persistencia: dto.persistencia,
    rama: dto.rama,
    q: dto.q,
    brechaMinima: dto.brechaMinima,
    orden: dto.orden,
    limit: dto.limit,
    offset: dto.offset,
  };
}

function aConsultaUtilidades(
  dto: QueryUtilidadesDto,
): Partial<ConsultaUtilidades> {
  return {
    anio: dto.anio,
    minimo: dto.minimo,
    rama: dto.rama,
    q: dto.q,
    limit: dto.limit,
    offset: dto.offset,
  };
}

function aConsultaCredito(dto: QueryCreditoDto): Partial<ConsultaCredito> {
  return {
    soloComparables: dto.soloComparables,
    minimo: dto.minimo,
    rama: dto.rama,
    q: dto.q,
    limit: dto.limit,
    offset: dto.offset,
  };
}
