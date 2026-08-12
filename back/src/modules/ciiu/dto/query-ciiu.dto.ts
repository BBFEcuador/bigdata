import { Transform } from 'class-transformer';
import { IsBooleanString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

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

  /**
   * Tope de resultados. Lo usa el selector de actividades de la pantalla de
   * compañías: sin él, teclear una letra suelta devolvería más de mil filas con
   * nombres larguísimos en cada pulsación.
   */
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(2000)
  limit?: number;

  @IsOptional()
  @IsBooleanString()
  incluirAusentes?: string;

  /**
   * Añade a cada fila el número de compañías registradas en esa actividad.
   * Cuesta un agregado sobre `companias`, así que va bajo petición.
   */
  @IsOptional()
  @IsBooleanString()
  conConteo?: string;
}
