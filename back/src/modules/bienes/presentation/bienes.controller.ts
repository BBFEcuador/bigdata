import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ListarBienesContribuyenteUseCase } from '../application/use-cases/listar-bienes-contribuyente.use-case';
import { QueryBienesDto } from './dto/query-bienes.dto';

@Controller('bienes')
export class BienesController {
  constructor(private readonly listar: ListarBienesContribuyenteUseCase) {}

  @Get('contribuyente/:contribuyenteId')
  porContribuyente(
    @Param('contribuyenteId', new ParseUUIDPipe()) contribuyenteId: string,
    @Query() query: QueryBienesDto,
  ) {
    return this.listar.execute({ contribuyenteId, ...query });
  }
}
