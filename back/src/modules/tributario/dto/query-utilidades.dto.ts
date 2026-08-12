import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const aEntero = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : parseInt(String(value), 10);

export class QueryUtilidadesDto {
  /** Por defecto, el último ejercicio con balances. */
  @IsOptional()
  @Transform(aEntero)
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio?: number;

  /** Umbral: por debajo de cierto monto el aviso no le interesa a nadie. */
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
