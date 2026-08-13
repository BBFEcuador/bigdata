import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { CompaniasQuery } from '../application/ports/companias-read.repository';
import { ExportarCompaniasCsvUseCase } from '../application/use-cases/exportar-companias-csv.use-case';
import { ListarCompaniasUseCase } from '../application/use-cases/listar-companias.use-case';
import { ObtenerCompaniaUseCase } from '../application/use-cases/obtener-compania.use-case';
import { ObtenerFacetasCompaniasUseCase } from '../application/use-cases/obtener-facetas-companias.use-case';
import { ObtenerFichaCompaniaUseCase } from '../application/use-cases/obtener-ficha-compania.use-case';
import { QueryCompaniasDto } from './dto/query-companias.dto';

@Controller('companias')
export class CompaniasController {
  constructor(
    private readonly listarCompanias: ListarCompaniasUseCase,
    private readonly exportarCompaniasCsv: ExportarCompaniasCsvUseCase,
    private readonly obtenerCompania: ObtenerCompaniaUseCase,
    private readonly obtenerFichaCompania: ObtenerFichaCompaniaUseCase,
    private readonly obtenerFacetasCompanias: ObtenerFacetasCompaniasUseCase,
  ) {}

  @Get()
  listar(@Query() query: QueryCompaniasDto) {
    return this.listarCompanias.execute(aConsulta(query));
  }

  @Get('facetas')
  facetas() {
    return this.obtenerFacetasCompanias.execute();
  }

  @Get('csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  exportar(@Query() query: QueryCompaniasDto) {
    return this.exportarCompaniasCsv.execute(aConsulta(query));
  }

  /** Alias explícito para clientes que llaman la operación "export". */
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  exportarAlternativo(@Query() query: QueryCompaniasDto) {
    return this.exportarCompaniasCsv.execute(aConsulta(query));
  }

  @Get(':expediente')
  async detalle(@Param('expediente') expediente: string) {
    const c = await this.obtenerCompania.execute(expediente);
    if (!c) throw new NotFoundException(`No existe la compañía ${expediente}`);
    return c;
  }

  @Get(':expediente/ficha')
  async ficha(@Param('expediente') expediente: string) {
    const ficha = await this.obtenerFichaCompania.execute(expediente);
    if (!ficha)
      throw new NotFoundException(`No existe la compañía ${expediente}`);
    return ficha;
  }
}

function aConsulta(dto: QueryCompaniasDto): CompaniasQuery {
  return {
    poblacion: dto.poblacion,
    nombre: dto.nombre,
    ruc: dto.ruc,
    provincia: dto.provincia,
    canton: dto.canton,
    situacionLegal: dto.situacionLegal,
    tipo: dto.tipo,
    ciiuNivel1: dto.ciiuNivel1,
    ciiu: dto.ciiu,
    catastro: dto.catastro,
    catastroAnio: dto.catastroAnio,
    incluirAusentes: dto.incluirAusentes,
    cursor: dto.cursor,
    limit: dto.limit,
  };
}
