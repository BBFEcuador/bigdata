import { Controller, Get, Param, Query } from '@nestjs/common';
import { CatalogoService } from './catalogo.service';
import { QueryCatalogoDto } from './dto/query-catalogo.dto';

@Controller('catalogo-cuentas')
export class CatalogoController {
  constructor(private readonly service: CatalogoService) {}

  @Get()
  listar(@Query() query: QueryCatalogoDto) {
    return this.service.listar(query);
  }

  /** Debe declararse antes de `:codigo`, o "resumen" se tomaría por un código. */
  @Get('resumen')
  resumen() {
    return this.service.resumen();
  }

  @Get(':codigo')
  detalle(@Param('codigo') codigo: string) {
    return this.service.detalle(codigo);
  }
}
