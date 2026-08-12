import { Transform } from 'class-transformer';
import { IsBooleanString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class QueryCatalogoDto {
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
