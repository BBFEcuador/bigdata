import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const aEntero = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : parseInt(String(value), 10);

/** Sólo `"false"` desactiva el filtro; cualquier otra cosa lo deja puesto. */
const aBooleano = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : String(value) !== 'false';

export class QueryCreditoDto {
  /** Por defecto, sólo las comparables de la presuntiva. */
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  soloComparables?: boolean;

  /** Umbral sobre el crédito del último ejercicio, no sobre la suma. */
  @IsOptional()
  @Transform(aEntero)
  @IsInt()
  @Min(0)
  minimo?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  rama?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;

  @IsOptional()
  @Transform(aEntero)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Transform(aEntero)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
