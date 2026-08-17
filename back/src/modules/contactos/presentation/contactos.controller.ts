import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ListarContactosContribuyenteUseCase } from '../application/use-cases/listar-contactos-contribuyente.use-case';
import { QueryContactosDto } from './dto/query-contactos.dto';

@Controller('contactos')
export class ContactosController {
  constructor(private readonly listar: ListarContactosContribuyenteUseCase) {}

  @Get('contribuyente/:contribuyenteId')
  porContribuyente(
    @Param('contribuyenteId', new ParseUUIDPipe()) contribuyenteId: string,
    @Query() query: QueryContactosDto,
  ) {
    return this.listar.execute(contribuyenteId, query.limit, query.cursor);
  }
}
