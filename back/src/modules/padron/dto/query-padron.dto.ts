import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class QueryPadronDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  ruc?: string;

  /** ACTIVO, PASIVO o SUSPENDIDO. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  estado?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  provincia?: string;

  /**
   * Pertenencia a un catastro público: `turismo`, `turismo_ratificado`,
   * `exportador`, `exportador_bienes_ir`, `exportador_bienes_iva`,
   * `exportador_servicios_iva` o `ninguno`.
   */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  catastro?: string;

  /** Año de aplicación; sólo aplica a los catastros de exportadores. */
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : parseInt(value, 10)))
  @IsInt()
  @Min(2000)
  @Max(2100)
  catastroAnio?: number;

  /** Cursor de keyset: el último RUC de la página anterior. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : parseInt(value, 10)))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
