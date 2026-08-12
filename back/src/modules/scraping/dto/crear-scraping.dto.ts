import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, MaxLength, Max, Min } from 'class-validator';

export class CrearScrapingDto {
  @IsString()
  @MaxLength(40)
  expediente: string;

  /** Si no viene, se usa la única fuente registrada. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  fuente?: string;

  /** Un job pedido a mano adelanta al barrido masivo, que va con prioridad 0. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  prioridad?: number;

  @IsOptional()
  @IsObject()
  parametros?: Record<string, unknown>;
}
