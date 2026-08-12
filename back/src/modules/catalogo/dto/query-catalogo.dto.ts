import { Transform } from 'class-transformer';
import { IsBooleanString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class QueryCatalogoDto {
  /**
   * Plan de cuentas a consultar. Por defecto el 1 (IFRS, 622 cuentas), que es
   * con el que trabaja el resto de la aplicación. Los códigos NO son
   * comparables entre formularios.
   */
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(9)
  formulario?: number;

  /** Texto libre: se busca a la vez como prefijo de código y dentro del nombre. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(10)
  nivel?: number;

  @IsOptional()
  @IsBooleanString()
  soloHojas?: string;

  /** Por defecto se ocultan las cuentas que ya no vienen en el catálogo. */
  @IsOptional()
  @IsBooleanString()
  incluirAusentes?: string;
}
