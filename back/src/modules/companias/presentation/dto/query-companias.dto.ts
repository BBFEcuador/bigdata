import { Transform } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  POBLACIONES_COMPANIAS,
  PoblacionCompanias,
} from '../../application/ports/companias-read.repository';

export { POBLACIONES_COMPANIAS, PoblacionCompanias };

export class QueryCompaniasDto {
  /** Población del padrón; por defecto devuelve las tres. */
  @IsOptional()
  @IsIn(POBLACIONES_COMPANIAS)
  poblacion?: PoblacionCompanias;

  /** Búsqueda por nombre parcial (apoyada en el índice GIN de trigramas). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(13)
  ruc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  provincia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  canton?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  situacionLegal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tipo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  ciiuNivel1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  ciiu?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  catastro?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(2000)
  @Max(2100)
  catastroAnio?: number;


  @IsOptional()
  @IsBooleanString()
  incluirAusentes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
