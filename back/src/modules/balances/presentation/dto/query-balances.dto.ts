import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const aEntero = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : parseInt(String(value), 10);

export class QueryBalancesDto {
  @IsOptional()
  @Transform(aEntero)
  @IsInt()
  @Min(1990)
  @Max(2100)
  anio?: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  ruc?: string;

  /** Sección CIIU de nivel 1: A, B, C… */
  @IsOptional()
  @IsString()
  @MaxLength(2)
  rama?: string;

  /** Cursor de keyset: el último expediente de la página anterior. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  cursor?: string;

  @IsOptional()
  @Transform(aEntero)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
