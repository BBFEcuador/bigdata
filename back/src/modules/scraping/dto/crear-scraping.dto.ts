import { Type } from 'class-transformer';
import { IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Max, Min } from 'class-validator';
import { TIPOS_SUJETO, TipoSujeto } from '../scraping.sujetos';

export class CrearScrapingDto {
  /**
   * Qué población. Sin valor por defecto a propósito: si lo tuviera, un alta a
   * la que se le olvide el tipo crearía un job sobre el sujeto equivocado, y
   * eso no falla —trae los datos de otro—, que es la peor forma de fallar.
   */
  @IsIn(TIPOS_SUJETO)
  tipoSujeto: TipoSujeto;

  /** El expediente si es compañía; el RUC en las otras dos poblaciones. */
  @IsString()
  @MaxLength(40)
  clave: string;

  /** Si no viene, se usa la única fuente registrada. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  fuente?: string;

  /** Un job pedido a mano adelanta al barrido masivo, que va con prioridad 0. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  prioridad?: number;

  @IsOptional()
  @IsObject()
  parametros?: Record<string, unknown>;
}
