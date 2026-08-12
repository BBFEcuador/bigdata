import { Transform } from 'class-transformer';
import { IsBooleanString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class QueryCompaniasDto {
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

  /**
   * Código CIIU de CUALQUIER nivel (`G`, `G46`, `G4669`, `H4923.01`…).
   * Se resuelve por prefijo sobre el código normalizado sin punto.
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  ciiu?: string;

  /** Por defecto sólo se listan las vigentes en la última carga. */
  @IsOptional()
  @IsBooleanString()
  incluirAusentes?: string;

  /**
   * Cursor de paginación por keyset: el último `expediente` de la página
   * anterior. Se prefiere a OFFSET porque con un millón de filas un
   * `OFFSET 900000` obliga a Postgres a recorrer y descartar 900.000 filas.
   */
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
