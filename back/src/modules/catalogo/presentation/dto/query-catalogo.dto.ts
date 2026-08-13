import { Transform } from 'class-transformer';
import {
  IsBooleanString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class QueryCatalogoDto {
  /** Plan de cuentas a consultar; por defecto el IFRS (formulario 1). */
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(9)
  formulario?: number;

  /** Texto libre: prefijo de código o parte del nombre. */
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
