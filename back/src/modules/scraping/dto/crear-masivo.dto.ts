import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { LIMITE_MASIVO } from '../scraping.constants';
import { TIPOS_SUJETO, TipoSujeto } from '../scraping.sujetos';

export class CrearMasivoDto {
  /**
   * Una población por llamada, nunca varias.
   *
   * Encolar "todo" de una vez sería encolar 7,1 millones de sujetos de tres
   * poblaciones que no se trabajan igual, y no habría forma cómoda de deshacer
   * sólo una parte.
   */
  @IsIn(TIPOS_SUJETO)
  tipoSujeto: TipoSujeto;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  fuente?: string;

  /** Lista explícita. Si no viene, se toma la población entera con el tope. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(LIMITE_MASIVO)
  @IsString({ each: true })
  claves?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  provincia?: string;

  /**
   * Tope de la llamada. Sin él, un POST sin filtros encolaría los millones de
   * personas naturales de una vez y no habría forma cómoda de deshacerlo.
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
