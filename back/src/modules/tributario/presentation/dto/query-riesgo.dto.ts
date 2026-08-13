import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const aEntero = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : parseInt(String(value), 10);

export const POBLACIONES = [
  'comparable',
  'sin_utilidad',
  'sin_ingresos',
] as const;
export const ORDENES = ['percentil', 'brecha', 'brecha_total'] as const;

export class QueryRiesgoDto {
  @IsOptional()
  @Transform(aEntero)
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio?: number;
  @IsOptional() @IsIn(POBLACIONES) poblacion?: (typeof POBLACIONES)[number];
  @IsOptional()
  @Transform(aEntero)
  @IsInt()
  @Min(0)
  @Max(4)
  persistencia?: number;
  @IsOptional() @IsString() @MaxLength(4) rama?: string;
  @IsOptional() @IsString() @MaxLength(160) q?: string;
  @IsOptional() @Transform(aEntero) @IsInt() @Min(0) brechaMinima?: number;
  @IsOptional() @IsIn(ORDENES) orden?: (typeof ORDENES)[number];
  @IsOptional() @Transform(aEntero) @IsInt() @Min(0) offset?: number;
  @IsOptional() @Transform(aEntero) @IsInt() @Min(1) @Max(200) limit?: number;
}
