import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ListarBalancesUseCase,
  ObtenerComparativoBalancesUseCase,
  ObtenerDetalleBalanceUseCase,
  ObtenerEstadosBalancesUseCase,
  ObtenerIndicadoresBalancesUseCase,
  ObtenerResumenBalancesUseCase,
} from '../application/use-cases/balances-read.use-cases';
import {
  ObtenerSectorialPercentilesUseCase,
  ObtenerSectorPercentilesUseCase,
  RecalcularPercentilesUseCase,
} from '../application/use-cases/percentiles.use-cases';
import { QueryBalancesDto } from './dto/query-balances.dto';

@Controller('balances')
export class BalancesController {
  constructor(
    private readonly listarBalances: ListarBalancesUseCase,
    private readonly obtenerResumen: ObtenerResumenBalancesUseCase,
    private readonly obtenerComparativo: ObtenerComparativoBalancesUseCase,
    private readonly obtenerEstados: ObtenerEstadosBalancesUseCase,
    private readonly obtenerIndicadores: ObtenerIndicadoresBalancesUseCase,
    private readonly obtenerDetalle: ObtenerDetalleBalanceUseCase,
    private readonly recalcularPercentilesUseCase: RecalcularPercentilesUseCase,
    private readonly obtenerSector: ObtenerSectorPercentilesUseCase,
    private readonly obtenerSectorial: ObtenerSectorialPercentilesUseCase,
  ) {}

  @Get()
  listar(@Query() query: QueryBalancesDto) {
    return this.listarBalances.execute(query);
  }

  /** Debe ir antes de `:expediente`, o "resumen" se tomaría por un expediente. */
  @Get('resumen')
  resumen() {
    return this.obtenerResumen.execute();
  }

  /**
   * Recalcula los percentiles sectoriales de todos los ejercicios.
   *
   * Tarda minutos y toca 670.000 balances, así que no se dispara solo al
   * consultar: se corre después de importar balances.
   */
  @Post('percentiles/recalcular')
  recalcularPercentiles() {
    return this.recalcularPercentilesUseCase.execute();
  }

  /** Cortes de un sector completo, sin mirar a ninguna empresa. */
  @Get('sectores/:anio/:codigo')
  sector(
    @Param('anio', ParseIntPipe) anio: number,
    @Param('codigo') codigo: string,
  ) {
    return this.obtenerSector.execute(anio, codigo.toUpperCase());
  }

  /** Serie histórica de las cuentas grandes de una compañía. */
  @Get(':expediente')
  comparativo(@Param('expediente') expediente: string) {
    return this.obtenerComparativo.execute(expediente);
  }

  /** Estados financieros completos, todas las cuentas, un año por columna. */
  @Get(':expediente/estados')
  estados(
    @Param('expediente') expediente: string,
    @Query('formulario') formulario?: string,
  ) {
    return this.obtenerEstados.execute(
      expediente,
      formulario ? parseInt(formulario, 10) : undefined,
    );
  }

  /** Indicadores financieros de todos los ejercicios. */
  @Get(':expediente/indicadores')
  indicadores(@Param('expediente') expediente: string) {
    return this.obtenerIndicadores.execute(expediente);
  }

  /** Posición de la compañía dentro de su sector, con los cortes del sector. */
  @Get(':expediente/sectorial')
  sectorial(@Param('expediente') expediente: string) {
    return this.obtenerSectorial.execute(expediente);
  }

  /** Balance completo de un ejercicio concreto. */
  @Get(':expediente/:anio')
  detalle(
    @Param('expediente') expediente: string,
    @Param('anio', ParseIntPipe) anio: number,
  ) {
    return this.obtenerDetalle.execute(expediente, anio);
  }
}
