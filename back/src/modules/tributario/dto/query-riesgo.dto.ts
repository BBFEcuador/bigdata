import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const aEntero = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : parseInt(String(value), 10);

export const POBLACIONES = ['comparable', 'sin_utilidad', 'sin_ingresos'] as const;
export const ORDENES = ['percentil', 'brecha', 'brecha_total'] as const;

export class QueryRiesgoDto {
  @IsOptional()
  @Transform(aEntero)
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio?: number;

  /**
   * Las tres poblaciones no se mezclan por defecto.
   *
   * Con utilidad <= 0 la brecha es toda la base presunta, así que en una lista
   * conjunta esas empresas copan la cabeza por construcción y no por riesgo.
   */
  @IsOptional()
  @IsIn(POBLACIONES)
  poblacion?: (typeof POBLACIONES)[number];

  /** Mínimo de ejercicios en el decil alto. Es lo que separa patrón de ruido. */
  @IsOptional()
  @Transform(aEntero)
  @IsInt()
  @Min(0)
  @Max(4)
  persistencia?: number;

  /** Sección CIIU (una letra) o grupo completo (`H522`). */
  @IsOptional()
  @IsString()
  @MaxLength(4)
  rama?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;

  /**
   * Umbral de materialidad sobre la brecha del ejercicio.
   *
   * Sin él, la cabeza del ranking la ocupan compañías diminutas: el percentil
   * las coloca arriba con razón —son atípicas dentro de su rama— pero con
   * brechas de cientos de dólares. El percentil dice "raro"; esto dice
   * "además importa".
   */
  @IsOptional()
  @Transform(aEntero)
  @IsInt()
  @Min(0)
  brechaMinima?: number;

  @IsOptional()
  @IsIn(ORDENES)
  orden?: (typeof ORDENES)[number];

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
