import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { SegmentosService } from './segmentos.service';

const ESTADOS = ['cliente', 'en_gestion', 'no_contactar'];
const TIPOS_SUJETO = ['compania', 'persona_natural', 'sociedad_no_supervisada'];

/**
 * API de la capa comercial.
 *
 * Ningún endpoint acepta SQL. Del cliente sólo llegan códigos de segmento y
 * filtros con nombre propio; las condiciones viven en la tabla `segmento`, que
 * se llena desde migraciones revisadas.
 */
@Controller('segmentos')
export class SegmentosController {
  constructor(private readonly segmentos: SegmentosService) {}

  @Get()
  listar() {
    return this.segmentos.listar();
  }

  @Get('catalogo')
  catalogo() {
    return this.segmentos.catalogo();
  }

  /**
   * Reconstruye `perfil_comercial`. Hay que llamarlo después de una
   * importación: los segmentos leen del perfil, no de las tablas de origen.
   */
  @Post('perfil/refrescar')
  @HttpCode(200)
  refrescarPerfil() {
    return this.segmentos.refrescarPerfil();
  }

  @Post('correr')
  @HttpCode(200)
  correrTodos() {
    return this.segmentos.correrTodos();
  }

  @Post(':codigo/correr')
  @HttpCode(200)
  correr(@Param('codigo') codigo: string) {
    return this.segmentos.correr(codigo);
  }

  @Get(':codigo/miembros')
  miembros(
    @Param('codigo') codigo: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('novedades') novedades?: string,
    @Query('dias') dias?: string,
    @Query('conContacto') conContacto?: string,
    @Query('provincia') provincia?: string,
    @Query('incluirGestionados') incluirGestionados?: string,
  ) {
    return this.segmentos.miembros(codigo, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      soloNovedades: novedades === 'true',
      dias: dias ? parseInt(dias, 10) : undefined,
      soloConContacto: conContacto === 'true',
      provincia: provincia || undefined,
      incluirGestionados: incluirGestionados === 'true',
    });
  }

  @Get(':codigo/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async csv(@Param('codigo') codigo: string, @Query('incluirGestionados') inc?: string) {
    return this.segmentos.exportarCsv(codigo, inc === 'true');
  }

  /** En qué segmentos cae un sujeto y qué productos le tocan, en orden. */
  @Get('sujeto/:tipo/:clave')
  productosPara(@Param('tipo') tipo: string, @Param('clave') clave: string) {
    if (!TIPOS_SUJETO.includes(tipo)) {
      throw new BadRequestException(`Tipo de sujeto inválido. Usa: ${TIPOS_SUJETO.join(', ')}`);
    }
    return this.segmentos.productosPara(tipo, clave);
  }

  @Post('sujeto/:tipo/:clave/estado')
  @HttpCode(200)
  marcar(
    @Param('tipo') tipo: string,
    @Param('clave') clave: string,
    @Body() body: { estado?: string; nota?: string },
  ) {
    if (!TIPOS_SUJETO.includes(tipo)) {
      throw new BadRequestException(`Tipo de sujeto inválido. Usa: ${TIPOS_SUJETO.join(', ')}`);
    }
    if (!body?.estado || !ESTADOS.includes(body.estado)) {
      throw new BadRequestException(`Estado inválido. Usa: ${ESTADOS.join(', ')}`);
    }
    return this.segmentos.marcarEstado(tipo, clave, body.estado, body.nota);
  }
}
