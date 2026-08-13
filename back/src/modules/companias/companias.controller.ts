import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { CompaniasService } from './companias.service';
import { QueryCompaniasDto } from './dto/query-companias.dto';

@Controller('companias')
export class CompaniasController {
  constructor(private readonly service: CompaniasService) { }

  @Get()
  listar(@Query() query: QueryCompaniasDto) {
    return this.service.listar(query);
  }

  @Get('facetas')
  facetas() {
    return this.service.facetas();
  }

  @Get(':expediente')
  async detalle(@Param('expediente') expediente: string) {
    const c = await this.service.buscarUno(expediente);
    if (!c) throw new NotFoundException(`No existe la compañía ${expediente}`);
    return c;
  }

  @Get(':expediente/ficha')
  async ficha(@Param('expediente') expediente: string) {
    const ficha = await this.service.fichaCompleta(expediente);
    if (!ficha) throw new NotFoundException(`No existe la compañía ${expediente}`);
    return ficha;
  }
}
