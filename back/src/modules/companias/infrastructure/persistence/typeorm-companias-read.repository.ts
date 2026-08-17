import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import {
  aniosPorCatastro,
  condicionCatastro,
} from '../../../../common/catastros/filtro-catastro';
import {
  CompaniaReadModel,
  CompaniasQuery,
  CompaniasReadRepository,
  ConteoAcotado,
  FacetasCompanias,
  FichaRelaciones,
  POBLACIONES_COMPANIAS,
} from '../../application/ports/companias-read.repository';
import { Compania } from './entities/compania.entity';

const TOPE_CONTEO_EXACTO = 10_000;
const CLAVE_POBLACION = new Set<string>(POBLACIONES_COMPANIAS);
const CLAVE_CURSOR = 'COALESCE(c.expediente, c.ruc, c.id::text)';

@Injectable()
export class TypeormCompaniasReadRepository implements CompaniasReadRepository {
  constructor(
    @InjectRepository(Compania)
    private readonly repository: Repository<Compania>,
  ) {}

  async findPage(
    query: CompaniasQuery,
    limit: number,
  ): Promise<CompaniaReadModel[]> {
    const qb = this.repository.createQueryBuilder('c');
    this.aplicarPoblacion(qb, query);
    this.aplicarFiltros(qb, query);
    if (query.cursor)
      qb.andWhere(`${CLAVE_CURSOR} > :cursor`, { cursor: query.cursor });
    return qb.orderBy(CLAVE_CURSOR, 'ASC').take(limit).getMany();
  }

  async countBounded(query: CompaniasQuery): Promise<ConteoAcotado> {
    const qb = this.repository.createQueryBuilder('c').select('1');
    this.aplicarPoblacion(qb, query);
    this.aplicarFiltros(qb, query);
    const [sql, params] = qb.limit(TOPE_CONTEO_EXACTO).getQueryAndParameters();
    const rows = await this.repository.query(
      `SELECT count(*)::bigint AS n FROM (${sql}) t`,
      params,
    );
    const valor = Number(rows?.[0]?.n ?? 0);
    return { valor, exacto: valor < TOPE_CONTEO_EXACTO };
  }

  async findForExport(
    query: CompaniasQuery,
    limit: number,
  ): Promise<CompaniaReadModel[]> {
    const qb = this.repository.createQueryBuilder('c');
    this.aplicarPoblacion(qb, query);
    this.aplicarFiltros(qb, query);
    return qb.orderBy(CLAVE_CURSOR, 'ASC').take(limit).getMany();
  }

  findByExpedienteOrRuc(value: string): Promise<Compania | null> {
    return this.repository.findOne({
      where: [
        { expediente: value },
        { ruc: value, tipo: In([...POBLACIONES_COMPANIAS]) },
      ],
    });
  }

  async findActivityNames(codigos: string[]): Promise<Map<string, string>> {
    if (!codigos.length) return new Map();
    const rows: Array<{ codigo_supercias: string; nombre: string }> =
      await this.repository.query(
        'SELECT codigo_supercias, nombre FROM actividad_ciiu WHERE codigo_supercias = ANY($1::text[])',
        [codigos],
      );
    return new Map(rows.map((row) => [row.codigo_supercias, row.nombre]));
  }

  async findFichaRelaciones(
    ruc: string | null,
    expediente: string,
  ): Promise<FichaRelaciones> {
    const [establecimientos, ejercicios, turismo, catastros] =
      await Promise.all([
        ruc
          ? this.repository.query(
              `SELECT numero, nombre_comercial, estado, provincia, canton, parroquia,
                    codigo_ciiu, actividad FROM establecimiento WHERE ruc = $1 ORDER BY numero`,
              [ruc],
            )
          : Promise.resolve([]),
        this.repository.query(
          `SELECT anio, formulario FROM balance
         WHERE expediente = $1 AND ausente_desde_job IS NULL ORDER BY anio`,
          [expediente],
        ),
        ruc
          ? this.repository.query(
              `SELECT numero_registro, codigo_establecimiento, nombre_comercial, fecha_registro,
                    actividad, clasificacion, categoria, provincia, canton, parroquia,
                    direccion, referencia_direccion, telefono, correo, sitio_web,
                    representante_legal, estado_registro FROM turismo_establecimiento
             WHERE ruc = $1 AND ausente_desde_job IS NULL
             ORDER BY codigo_establecimiento, numero_registro`,
              [ruc],
            )
          : Promise.resolve([]),
        ruc
          ? this.repository.query(
              `SELECT catastro, anio, jurisdiccion, provincia, tipo_contribuyente,
                    clase_contribuyente, obligado_contabilidad, anio_fiscal_analizado
             FROM catastro_sri WHERE ruc = $1 AND ausente_desde_job IS NULL
             ORDER BY catastro, anio DESC`,
              [ruc],
            )
          : Promise.resolve([]),
      ]);
    return { establecimientos, ejercicios, turismo, catastros };
  }

  async findFacetas(): Promise<FacetasCompanias> {
    const [provincias, situaciones, tipos, poblaciones, aniosCatastro] =
      await Promise.all([
        this.repository
          .query(`SELECT provincia AS valor, count(*)::bigint AS n FROM contribuyentes
        WHERE tipo IN ('companies', 'natural_contable', 'natural_no_contable', 'sociedad_no_supervisada')
          AND provincia IS NOT NULL AND ausente_desde_job IS NULL GROUP BY provincia ORDER BY n DESC LIMIT 40`),
        this.repository
          .query(`SELECT situacion_legal AS valor, count(*)::bigint AS n FROM contribuyentes
        WHERE tipo = 'companies' AND situacion_legal IS NOT NULL AND ausente_desde_job IS NULL
        GROUP BY situacion_legal ORDER BY n DESC LIMIT 40`),
        this.repository
          .query(`SELECT tipo_compania AS valor, count(*)::bigint AS n FROM contribuyentes
        WHERE tipo = 'companies' AND tipo_compania IS NOT NULL AND ausente_desde_job IS NULL
        GROUP BY tipo_compania ORDER BY n DESC LIMIT 40`),
        this.repository
          .query(`SELECT tipo AS valor, count(*)::bigint AS n FROM contribuyentes
        WHERE tipo IN ('companies', 'natural_contable', 'natural_no_contable', 'sociedad_no_supervisada')
          AND ausente_desde_job IS NULL GROUP BY tipo ORDER BY tipo`),
        aniosPorCatastro((sql) => this.repository.query(sql)),
      ]);
    const map = (rows: Array<{ valor: string; n: string | number }>) =>
      rows.map((row) => ({ valor: row.valor, n: Number(row.n) }));
    return {
      provincias: map(provincias),
      situaciones: map(situaciones),
      tipos: map(tipos),
      poblaciones: map(poblaciones),
      aniosCatastro,
    };
  }

  private aplicarFiltros(
    qb: SelectQueryBuilder<Compania>,
    query: CompaniasQuery,
  ): void {
    if (query.incluirAusentes !== 'true')
      qb.andWhere('c.ausenteDesdeJob IS NULL');
    if (query.nombre)
      qb.andWhere('c.nombre ILIKE :nombre', { nombre: `%${query.nombre}%` });
    if (query.ruc) qb.andWhere('c.ruc LIKE :ruc', { ruc: `${query.ruc}%` });
    if (query.provincia)
      qb.andWhere('c.provincia = :provincia', { provincia: query.provincia });
    if (query.canton)
      qb.andWhere('c.canton = :canton', { canton: query.canton });
    if (query.situacionLegal)
      qb.andWhere('c.situacionLegal = :situacionLegal', {
        situacionLegal: query.situacionLegal,
      });
    if (query.tipo && !CLAVE_POBLACION.has(query.tipo))
      qb.andWhere('c.tipoCompania = :tipo', { tipo: query.tipo });
    if (query.ciiuNivel1)
      qb.andWhere('c.ciiuNivel1 = :ciiu1', { ciiu1: query.ciiuNivel1 });
    if (query.ciiu) {
      const normalizado = query.ciiu.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      qb.andWhere("replace(c.ciiu_nivel_6, '.', '') LIKE :ciiuPref", {
        ciiuPref: `${normalizado}%`,
      });
    }
    const catastro = condicionCatastro('c', query.catastro, query.catastroAnio);
    if (catastro) qb.andWhere(catastro.sql, catastro.params);
  }

  private aplicarPoblacion(
    qb: SelectQueryBuilder<Compania>,
    query: CompaniasQuery,
  ): void {
    const poblacion =
      query.poblacion ??
      (CLAVE_POBLACION.has(query.tipo ?? '') ? query.tipo : undefined);
    if (poblacion) qb.andWhere('c.tipo = :poblacion', { poblacion });
    else
      qb.andWhere('c.tipo IN (:...poblaciones)', {
        poblaciones: [...POBLACIONES_COMPANIAS],
      });
  }
}
