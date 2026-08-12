import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { BalancesService } from './balances.service';
import { QueryBalancesDto } from './dto/query-balances.dto';

@Controller('balances')
export class BalancesController {
  constructor(private readonly service: BalancesService) {}

  @Get()
  listar(@Query() query: QueryBalancesDto) {
    return this.service.listar(query);
  }

  /** Debe ir antes de `:expediente`, o "resumen" se tomaría por un expediente. */
  @Get('resumen')
  resumen() {
    return this.service.resumen();
  }

  /** Serie histórica de las cuentas grandes de una compañía. */
  @Get(':expediente')
  comparativo(@Param('expediente') expediente: string) {
    return this.service.comparativo(expediente);
  }

  /** Estados financieros completos, todas las cuentas, un año por columna. */
  @Get(':expediente/estados')
  estados(
    @Param('expediente') expediente: string,
    @Query('formulario') formulario?: string,
  ) {
    return this.service.estados(
      expediente,
      formulario ? parseInt(formulario, 10) : undefined,
    );
  }

  /** Indicadores financieros de todos los ejercicios. */
  @Get(':expediente/indicadores')
  indicadores(@Param('expediente') expediente: string) {
    return this.service.indicadores(expediente);
  }

  /** Balance completo de un ejercicio concreto. */
  @Get(':expediente/:anio')
  detalle(
    @Param('expediente') expediente: string,
    @Param('anio', ParseIntPipe) anio: number,
  ) {
    return this.service.detalle(expediente, anio);
  }
}
