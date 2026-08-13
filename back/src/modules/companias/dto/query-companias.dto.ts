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

export const POBLACIONES_COMPANIAS = [
  'companies',
  'natural_contable',
  'natural_no_contable',
] as const;

export type PoblacionCompanias = (typeof POBLACIONES_COMPANIAS)[number];

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

  /**
   * Código CIIU de CUALQUIER nivel (`G`, `G46`, `G4669`, `H4923.01`…).
   * Se resuelve por prefijo sobre el código normalizado sin punto.
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  ciiu?: string;

  /**
   * Filtra por pertenencia a un catastro público, enlazado por RUC.
   *
   * Valores: `turismo`, `turismo_ratificado`, `exportador_bienes_ir`,
   * `exportador_bienes_iva`, `exportador_servicios_iva`, `exportador` (en
   * cualquiera de los tres) y `ninguno`.
   */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  catastro?: string;

  /**
   * Año de aplicación del catastro de exportadores. Sólo tiene sentido junto a
   * `catastro`: sin él no se sabe de qué lista es el año.
   */
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(2000)
  @Max(2100)
  catastroAnio?: number;

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
