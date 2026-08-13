import { Controller, Get, Param, Query } from '@nestjs/common';
import { CiiuQuery } from '../application/ports/ciiu-read.repository';
import { ListarCiiuUseCase } from '../application/use-cases/listar-ciiu.use-case';
import { ObtenerDetalleCiiuUseCase } from '../application/use-cases/obtener-detalle-ciiu.use-case';
import { ObtenerResumenCiiuUseCase } from '../application/use-cases/obtener-resumen-ciiu.use-case';
import { QueryCiiuDto } from './dto/query-ciiu.dto';

@Controller('ciiu')
export class CiiuController {
  constructor(
    private readonly listarCiiu: ListarCiiuUseCase,
    private readonly obtenerDetalleCiiu: ObtenerDetalleCiiuUseCase,
    private readonly obtenerResumenCiiu: ObtenerResumenCiiuUseCase,
  ) {}

  @Get()
  listar(@Query() query: QueryCiiuDto) {
    return this.listarCiiu.execute(aConsulta(query));
  }

  /** Debe ir antes de `:codigo`, o "resumen" se tomaría por un código. */
  @Get('resumen')
  resumen() {
    return this.obtenerResumenCiiu.execute();
  }

  @Get(':codigo')
  detalle(@Param('codigo') codigo: string) {
    return this.obtenerDetalleCiiu.execute(codigo);
  }
}

function aConsulta(dto: QueryCiiuDto): CiiuQuery {
  return {
    q: dto.q,
    nivel: dto.nivel,
    soloHojas: dto.soloHojas,
    limit: dto.limit,
    incluirAusentes: dto.incluirAusentes,
    conConteo: dto.conConteo,
  };
}
