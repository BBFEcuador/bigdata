import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Max, Min } from 'class-validator';
import { EstadoScraping, TRANSICIONES } from '../scraping.estados';
import { LIMITE_LISTADO } from '../scraping.constants';

const ESTADOS = Object.keys(TRANSICIONES) as EstadoScraping[];

export class QueryScrapingDto {
  @IsOptional()
  @IsIn(ESTADOS)
  estado?: EstadoScraping;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  fuente?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  expediente?: string;

  /**
   * Cursor `creado_en|id` de la página anterior.
   *
   * Se pagina por cursor y no por OFFSET porque la lista se mueve sola mientras
   * el despachador trabaja: con OFFSET, cada refresco saltaría filas.
   */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  desde?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIMITE_LISTADO)
  limite?: number;
}
