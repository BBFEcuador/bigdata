import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PresenciaService } from './presencia.service';

// El decorador se mudó a `common/http` cuando `scraping` también lo necesitó.
// Se re-exporta desde aquí para no romper lo que ya lo importaba de este
// archivo.
export { Usuario } from '../../common/http/usuario.decorator';
import { Usuario } from '../../common/http/usuario.decorator';

/**
 * Presencia digital: web y redes sociales, con validación humana.
 *
 * Lo que trae el rastreador entra como propuesta. Estas rutas son la otra
 * mitad: la persona que confirma, corrige o añade lo que el rastreador nunca
 * iba a encontrar.
 */
@Controller('presencia')
export class PresenciaController {
  constructor(private readonly presencia: PresenciaService) {}

  /** Cuánto hay confirmado y cuánto queda por mirar, por canal. */
  @Get('resumen')
  resumen() {
    return this.presencia.resumen();
  }

  /**
   * La cola de revisión, con el nombre de la compañía al lado.
   *
   * `desde` pagina por expediente en vez de por `offset`: la cola encoge según
   * se revisa, y con `offset` cada confirmación desplaza la página y hace que
   * el revisor se salte filas sin enterarse.
   */
  @Get('revisar')
  porRevisar(
    @Query('canal') canal?: string,
    @Query('limite') limite?: string,
    @Query('desde') desde?: string,
  ) {
    return this.presencia.porRevisar({ canal, limite: limite ? Number(limite) : undefined, desde });
  }

  /** Todo lo de una compañía: canales, estado de cada uno e historial. */
  @Get(':expediente')
  deCompania(@Param('expediente') expediente: string) {
    return this.presencia.deCompania(expediente);
  }

  /** Alta manual. Nace confirmada: la escribió una persona. */
  @Post(':expediente')
  crear(
    @Param('expediente') expediente: string,
    @Body() body: { canal: string; valor: string; handle?: string; nota?: string },
    @Usuario() usuario: string,
  ) {
    if (!body?.canal || !body?.valor) {
      throw new BadRequestException('Hacen falta "canal" y "valor".');
    }
    return this.presencia.crear(expediente, body, usuario);
  }

  /** Da por bueno lo que propuso el rastreador. */
  @Post('canal/:id/confirmar')
  confirmar(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { nota?: string },
    @Usuario() usuario: string,
  ) {
    return this.presencia.revisar(id, 'confirmado', usuario, body?.nota);
  }

  /**
   * Dice que no es de esta compañía.
   *
   * La fila se queda como descartada en vez de borrarse: así el siguiente
   * rastreo no vuelve a proponer lo mismo y el trabajo de revisión no se repite.
   */
  @Post('canal/:id/descartar')
  descartar(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { nota?: string },
    @Usuario() usuario: string,
  ) {
    return this.presencia.revisar(id, 'descartado', usuario, body?.nota);
  }

  /** Corrige el valor de un canal existente. */
  @Patch('canal/:id')
  editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { valor?: string; handle?: string; nota?: string },
    @Usuario() usuario: string,
  ) {
    return this.presencia.editar(id, body ?? {}, usuario);
  }

  /** Borrado de verdad. Para errores de tecleo; lo normal es descartar. */
  @Delete('canal/:id')
  borrar(
    @Param('id', ParseIntPipe) id: number,
    @Query('nota') nota: string | undefined,
    @Usuario() usuario: string,
  ) {
    return this.presencia.borrar(id, usuario, nota);
  }
}
