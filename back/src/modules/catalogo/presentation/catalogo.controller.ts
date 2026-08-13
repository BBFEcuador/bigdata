import { Controller, Get, Param, Query } from '@nestjs/common';
import { CatalogoQuery } from '../application/ports/catalogo-read.repository';
import { ListarCatalogoUseCase } from '../application/use-cases/listar-catalogo.use-case';
import { ObtenerDetalleCatalogoUseCase } from '../application/use-cases/obtener-detalle-catalogo.use-case';
import { ObtenerResumenCatalogoUseCase } from '../application/use-cases/obtener-resumen-catalogo.use-case';
import { QueryCatalogoDto } from './dto/query-catalogo.dto';

@Controller('catalogo-cuentas')
export class CatalogoController {
  constructor(
    private readonly listarCatalogo: ListarCatalogoUseCase,
    private readonly obtenerDetalleCatalogo: ObtenerDetalleCatalogoUseCase,
    private readonly obtenerResumenCatalogo: ObtenerResumenCatalogoUseCase,
  ) {}

  @Get()
  listar(@Query() query: QueryCatalogoDto) {
    return this.listarCatalogo.execute(aConsulta(query));
  }

  /** Debe declararse antes de `:codigo`, o "resumen" se tomaría por un código. */
  @Get('resumen')
  resumen(@Query() query: QueryCatalogoDto) {
    return this.obtenerResumenCatalogo.execute(query.formulario);
  }

  @Get(':codigo')
  detalle(@Param('codigo') codigo: string, @Query() query: QueryCatalogoDto) {
    return this.obtenerDetalleCatalogo.execute(codigo, query.formulario);
  }
}

function aConsulta(dto: QueryCatalogoDto): CatalogoQuery {
  return {
    formulario: dto.formulario,
    q: dto.q,
    nivel: dto.nivel,
    soloHojas: dto.soloHojas,
    incluirAusentes: dto.incluirAusentes,
  };
}
