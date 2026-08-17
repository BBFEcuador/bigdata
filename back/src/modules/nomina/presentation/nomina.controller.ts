import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ListarNominaContribuyenteUseCase } from '../application/use-cases/listar-nomina-contribuyente.use-case';
import { QueryNominaDto } from './dto/query-nomina.dto';

@Controller('nomina')
export class NominaController {
  constructor(private readonly listar: ListarNominaContribuyenteUseCase) {}

  @Get('contribuyente/:contribuyenteId')
  porContribuyente(
    @Param('contribuyenteId', new ParseUUIDPipe()) contribuyenteId: string,
    @Query() query: QueryNominaDto,
  ) {
    return this.listar.execute(contribuyenteId, query.limit, query.cursor);
  }
}
