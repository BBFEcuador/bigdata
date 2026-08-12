import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Usuario } from '../../common/http/usuario.decorator';
import { CrearMasivoDto } from './dto/crear-masivo.dto';
import { CrearScrapingDto } from './dto/crear-scraping.dto';
import { QueryScrapingDto } from './dto/query-scraping.dto';
import { ScraperRegistry } from './ejecutores/scraper.registry';
import { ScrapingDispatcherService } from './scraping-dispatcher.service';
import { ScrapingJobsService } from './scraping-jobs.service';

/**
 * Los jobs de scraping.
 *
 * ## No hay DELETE ni PATCH de estado
 *
 * Un job sólo se mueve por las cuatro acciones de abajo, y cada una es un
 * UPDATE con su estado de origen en el `WHERE`. Un `PATCH { estado }` genérico
 * dejaría escribir cualquier cosa y haría inútil la máquina de estados; borrar
 * un job perdería el rastro de que se intentó rastrear esa compañía, que es
 * información aunque el intento saliera mal.
 *
 * ## Por qué pausar y cancelar responden 202 y no 200
 *
 * Si el job ya está corriendo, la orden se **anota** y la cumple el worker en
 * su siguiente punto seguro. Responder 200 daría a entender que ya pasó.
 */
@Controller('scraping')
export class ScrapingController {
  constructor(
    private readonly jobs: ScrapingJobsService,
    private readonly registry: ScraperRegistry,
    private readonly dispatcher: ScrapingDispatcherService,
  ) {}

  /** Las fuentes disponibles, para el desplegable de la pantalla. */
  @Get('fuentes')
  fuentes() {
    return this.registry.fuentes();
  }

  /** Cuántos hay en cada estado y cómo va este proceso. */
  @Get('resumen')
  async resumen() {
    return { ...(await this.jobs.resumen()), despachador: this.dispatcher.estado() };
  }

  @Get()
  listar(@Query() q: QueryScrapingDto) {
    return this.jobs.listar(q);
  }

  /** El historial de rastreo de una compañía, para su ficha. */
  @Get('compania/:expediente')
  porCompania(@Param('expediente') expediente: string) {
    return this.jobs.porCompania(expediente);
  }

  @Get(':id')
  detalle(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.obtener(id);
  }

  @Get(':id/resultados')
  resultados(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.resultados(id);
  }

  /** Un job para una compañía. 404 si no existe; 409 si ya tiene uno vivo. */
  @Post()
  crear(@Body() dto: CrearScrapingDto, @Usuario() usuario: string) {
    return this.jobs.crear({
      expediente: dto.expediente,
      fuente: dto.fuente ?? this.registry.fuentePorDefecto(),
      prioridad: dto.prioridad,
      parametros: dto.parametros,
      usuario,
    });
  }

  /**
   * Encola muchas de golpe.
   *
   * Las compañías que ya tienen un job vivo se saltan en silencio y salen en
   * `omitidos`: así relanzar el barrido es seguro y no hace falta saber por
   * dónde iba.
   */
  @Post('masivo')
  @HttpCode(202)
  masivo(@Body() dto: CrearMasivoDto, @Usuario() usuario: string) {
    return this.jobs.crearMasivo({
      fuente: dto.fuente ?? this.registry.fuentePorDefecto(),
      expedientes: dto.expedientes,
      provincia: dto.provincia,
      limite: dto.limite,
      prioridad: dto.prioridad,
      usuario,
    });
  }

  @Post(':id/pausar')
  @HttpCode(202)
  pausar(@Param('id', ParseUUIDPipe) id: string, @Usuario() usuario: string) {
    return this.jobs.accionar(id, 'pausar', usuario);
  }

  @Post(':id/cancelar')
  @HttpCode(202)
  cancelar(@Param('id', ParseUUIDPipe) id: string, @Usuario() usuario: string) {
    return this.jobs.accionar(id, 'cancelar', usuario);
  }

  /** Devuelve el job a la cola. Conserva el checkpoint: sigue donde iba. */
  @Post(':id/reanudar')
  reanudar(@Param('id', ParseUUIDPipe) id: string, @Usuario() usuario: string) {
    return this.jobs.accionar(id, 'reanudar', usuario);
  }

  /** Empieza de cero uno que ya se rindió: intentos a 0 y checkpoint limpio. */
  @Post(':id/reintentar')
  reintentar(@Param('id', ParseUUIDPipe) id: string, @Usuario() usuario: string) {
    return this.jobs.accionar(id, 'reintentar', usuario);
  }
}
