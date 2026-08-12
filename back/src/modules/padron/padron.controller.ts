import { Controller, Get, Param, Query } from '@nestjs/common';
import { PadronService } from './padron.service';
import { QueryPadronDto } from './dto/query-padron.dto';

@Controller('padron')
export class PadronController {
  constructor(private readonly service: PadronService) {}

  @Get('resumen')
  resumen() {
    return this.service.resumen();
  }

  @Get('provincias')
  provincias() {
    return this.service.provincias();
  }

  /** Personas naturales. Tienen su propio endpoint y nunca salen mezcladas. */
  @Get('personas')
  personas(@Query() query: QueryPadronDto) {
    return this.service.listar('persona_natural', query);
  }

  /** Sociedades del SRI sin expediente en la Superintendencia. */
  @Get('sociedades-no-supervisadas')
  sociedades(@Query() query: QueryPadronDto) {
    return this.service.listar('sociedad_no_supervisada', query);
  }

  @Get('establecimientos/:ruc')
  establecimientos(@Param('ruc') ruc: string) {
    return this.service.establecimientos(ruc);
  }
}
