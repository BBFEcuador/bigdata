import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, MaxLength, Max, Min } from 'class-validator';
import { LIMITE_MASIVO } from '../scraping.constants';

export class CrearMasivoDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  fuente?: string;

  /** Lista explícita. Si no viene, se toman compañías del padrón vigente. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(LIMITE_MASIVO)
  @IsString({ each: true })
  expedientes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  provincia?: string;

  /**
   * Tope de la llamada. Sin él, un `POST` sin filtros encolaría el millón de
   * compañías de una vez y no habría forma cómoda de deshacerlo.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIMITE_MASIVO)
  limite?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  prioridad?: number;
}
