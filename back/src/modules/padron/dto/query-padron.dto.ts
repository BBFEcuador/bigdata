import { Transform } from 'class-transformer';
import {
  IsBooleanString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

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

  /**
   * Todo lo que NO está activo, en un solo filtro.
   *
   * No es lo mismo que `estado=PASIVO`: hay suspendidos y pasivos, y la
   * pantalla de inactivas los quiere a los dos. Con `IS DISTINCT FROM` entra
   * además cualquier estado nuevo que publique el SRI, en vez de desaparecer
   * de las tres pantallas a la vez.
   */
  @IsOptional()
  @IsBooleanString()
  estadoInactivo?: string;

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

  /**
   * Los tres indicadores tributarios del padrón, como 'true' o 'false'.
   *
   * Van sueltos y no en un único parámetro porque se combinan: "obligada a
   * llevar contabilidad Y agente de retención" es una consulta real, y con un
   * solo campo habría que inventar una gramática para expresarla.
   */
  @IsOptional()
  @IsBooleanString()
  obligadoContabilidad?: string;

  @IsOptional()
  @IsBooleanString()
  agenteRetencion?: string;

  @IsOptional()
  @IsBooleanString()
  contribuyenteEspecial?: string;

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
