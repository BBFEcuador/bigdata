import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class QueryBienesDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limitPropiedades?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  cursorPropiedades?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limitVehiculos?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cursorVehiculos?: string;
}
