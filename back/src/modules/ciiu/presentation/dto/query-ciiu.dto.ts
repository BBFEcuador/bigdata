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

export class QueryCiiuDto {
  /** Texto libre: prefijo del código o parte del nombre. */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(6)
  nivel?: number;

  @IsOptional()
  @IsBooleanString()
  soloHojas?: string;

  /** Tope de resultados usado por el selector de actividades. */
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(2000)
  limit?: number;

  @IsOptional()
  @IsBooleanString()
  incluirAusentes?: string;

  /** Añade el número de compañías registradas por actividad. */
  @IsOptional()
  @IsBooleanString()
  conConteo?: string;
}
