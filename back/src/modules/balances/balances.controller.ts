import { Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { BalancesService } from './balances.service';
import { PercentilesService } from './percentiles.service';
import { QueryBalancesDto } from './dto/query-balances.dto';

@Controller('balances')
export class BalancesController {
  constructor(
    private readonly service: BalancesService,
    private readonly percentiles: PercentilesService,
  ) {}

  @Get()
  listar(@Query() query: QueryBalancesDto) {
    return this.service.listar(query);
  }

  /** Debe ir antes de `:expediente`, o "resumen" se tomaría por un expediente. */
  @Get('resumen')
  resumen() {
    return this.service.resumen();
  }

  /**
   * Recalcula los percentiles sectoriales de todos los ejercicios.
   *
   * Tarda minutos y toca 670.000 balances, así que no se dispara solo al
   * consultar: se corre después de importar balances.
   */
  @Post('percentiles/recalcular')
  recalcularPercentiles() {
    return this.percentiles.recalcular();
  }

  /** Cortes de un sector completo, sin mirar a ninguna empresa. */
  @Get('sectores/:anio/:codigo')
  sector(@Param('anio', ParseIntPipe) anio: number, @Param('codigo') codigo: string) {
    return this.percentiles.sector(anio, codigo.toUpperCase());
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

  /** Posición de la compañía dentro de su sector, con los cortes del sector. */
  @Get(':expediente/sectorial')
  sectorial(@Param('expediente') expediente: string) {
    return this.percentiles.sectorial(expediente);
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
