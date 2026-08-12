import { Controller, Get, Param, Query } from '@nestjs/common';
import { CiiuService } from './ciiu.service';
import { QueryCiiuDto } from './dto/query-ciiu.dto';

@Controller('ciiu')
export class CiiuController {
  constructor(private readonly service: CiiuService) {}

  @Get()
  listar(@Query() query: QueryCiiuDto) {
    return this.service.listar(query);
  }

  /** Debe ir antes de `:codigo`, o "resumen" se tomaría por un código. */
  @Get('resumen')
  resumen() {
    return this.service.resumen();
  }

  @Get(':codigo')
  detalle(@Param('codigo') codigo: string) {
    return this.service.detalle(codigo);
  }
}
