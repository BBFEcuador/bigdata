import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Compania } from './entities/compania.entity';
import { QueryCompaniasDto } from './dto/query-companias.dto';
import { aniosPorCatastro, condicionCatastro } from '../../common/catastros/filtro-catastro';

/** Cuánto está dispuesto a contar exactamente antes de dar un aproximado. */
const TOPE_CONTEO_EXACTO = 10_000;

/**
 * Filtro por código CIIU de cualquier nivel.
 *
 * El archivo de compañías guarda el código con punto (`H4923.01`) y el catálogo
 * sin él (`H492301`). Se compara sobre la forma normalizada, que es exactamente
 * lo que indexa `idx_companias_ciiu6_norm`; sin ese índice esto sería un
 * recorrido completo de la tabla en cada tecla.
 */
function aplicarFiltroCiiu(qb: SelectQueryBuilder<Compania>, codigo: string): void {
  const normalizado = codigo.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  qb.andWhere(`replace(c.ciiu_nivel_6, '.', '') LIKE :ciiuPref`, {
    ciiuPref: `${normalizado}%`,
  });
}

@Injectable()
export class CompaniasService {
  constructor(
    @InjectRepository(Compania) private readonly repo: Repository<Compania>,
  ) {}

  /**
   * Listado paginado por keyset.
   *
   * Ni OFFSET ni `COUNT(*)` sin límite: sobre un millón de filas los dos se
   * degradan mucho en las páginas profundas. Se ordena por la clave primaria y
   * se devuelve un cursor; el total se acota con un subquery limitado.
   */
  async listar(q: QueryCompaniasDto) {
    const limit = q.limit ?? 50;
    const qb = this.repo.createQueryBuilder('c');

    this.aplicarFiltros(qb, q);
    if (q.cursor) {
      qb.andWhere('c.expediente > :cursor', { cursor: q.cursor });
    }

    // Se pide una fila de más para saber si hay página siguiente sin contar nada.
    const filas = await qb.orderBy('c.expediente', 'ASC').take(limit + 1).getMany();
    const hayMas = filas.length > limit;
    const datos = hayMas ? filas.slice(0, limit) : filas;

    return {
      datos: await this.conNombreActividad(datos),
      cursorSiguiente: hayMas ? datos[datos.length - 1].expediente : null,
      hayMas,
      total: await this.contarAcotado(q),
    };
  }

  /**
   * Filtros del listado, en un solo sitio.
   *
   * Los usan tanto la consulta como el recuento: cuando estaban duplicados,
   * olvidarse de añadir un filtro nuevo aquí hacía que el total saliera como si
   * no hubiera filtro y la UI mintiera.
   */
  private aplicarFiltros(qb: SelectQueryBuilder<Compania>, q: QueryCompaniasDto): void {
    if (q.incluirAusentes !== 'true') qb.andWhere('c.ausenteDesdeJob IS NULL');
    if (q.nombre) qb.andWhere('c.nombre ILIKE :nombre', { nombre: `%${q.nombre}%` });
    if (q.ruc) qb.andWhere('c.ruc LIKE :ruc', { ruc: `${q.ruc}%` });
    if (q.provincia) qb.andWhere('c.provincia = :provincia', { provincia: q.provincia });
    if (q.canton) qb.andWhere('c.canton = :canton', { canton: q.canton });
    if (q.situacionLegal) {
      qb.andWhere('c.situacionLegal = :situacionLegal', { situacionLegal: q.situacionLegal });
    }
    if (q.tipo) qb.andWhere('c.tipo = :tipo', { tipo: q.tipo });
    if (q.ciiuNivel1) qb.andWhere('c.ciiuNivel1 = :ciiu1', { ciiu1: q.ciiuNivel1 });
    if (q.ciiu) aplicarFiltroCiiu(qb, q.ciiu);

    const catastro = condicionCatastro('c', q.catastro, q.catastroAnio);
    if (catastro) qb.andWhere(catastro.sql, catastro.params);
  }

  /**
   * Añade el nombre de la actividad económica a cada compañía.
   *
   * Se resuelve con una sola consulta sobre los códigos de la página, en vez de
   * un JOIN en la consulta principal: así el listado paginado por keyset sigue
   * usando limpiamente el índice de la clave primaria.
   *
   * Un código que no esté en el catálogo (hay unos pocos, incluido un `ZZZZZ.ZZ`
   * de relleno) se queda sin nombre. Eso es correcto, no un error.
   */
  private async conNombreActividad(datos: Compania[]) {
    const codigos = [...new Set(datos.map((d) => d.ciiuNivel6).filter((c): c is string => !!c))];
    if (codigos.length === 0) return datos.map((d) => ({ ...d, actividad: null }));

    const filas: { codigo_supercias: string; nombre: string }[] = await this.repo.query(
      `SELECT codigo_supercias, nombre FROM actividad_ciiu WHERE codigo_supercias = ANY($1::text[])`,
      [codigos],
    );
    const porCodigo = new Map(filas.map((f) => [f.codigo_supercias, f.nombre]));

    return datos.map((d) => ({
      ...d,
      actividad: d.ciiuNivel6 ? porCodigo.get(d.ciiuNivel6) ?? null : null,
    }));
  }

  /**
   * Total "hasta cierto punto".
   *
   * Sin filtros se usa la estimación del planner (`reltuples`), que es
   * instantánea. Con filtros se cuenta de verdad pero con un tope: la UI muestra
   * "más de 10.000" en lugar de pagar un recuento completo en cada tecleo.
   */
  private async contarAcotado(q: QueryCompaniasDto): Promise<{ valor: number; exacto: boolean }> {
    const sinFiltros =
      !q.nombre &&
      !q.ruc &&
      !q.provincia &&
      !q.canton &&
      !q.situacionLegal &&
      !q.tipo &&
      !q.ciiuNivel1 &&
      !q.ciiu &&
      !q.catastro;

    if (sinFiltros) {
      const r = await this.repo.query(
        `SELECT reltuples::bigint AS n FROM pg_class WHERE relname = 'companias'`,
      );
      return { valor: Math.max(0, Number(r?.[0]?.n ?? 0)), exacto: false };
    }

    // Los mismos filtros que la consulta, por construcción: `aplicarFiltros` es
    // el único sitio donde están escritos.
    const qb = this.repo.createQueryBuilder('c').select('1');
    this.aplicarFiltros(qb, q);

    const [sql, params] = qb.limit(TOPE_CONTEO_EXACTO).getQueryAndParameters();
    const r = await this.repo.query(`SELECT count(*)::bigint AS n FROM (${sql}) t`, params);
    const n = Number(r?.[0]?.n ?? 0);
    return { valor: n, exacto: n < TOPE_CONTEO_EXACTO };
  }

  buscarUno(expediente: string) {
    return this.repo.findOne({ where: { expediente } });
  }

  /** Valores distintos para poblar los desplegables de filtro. */
  /**
   * Ficha completa de una compañía: todo lo que la base sabe de ella.
   *
   * Junta las tres fuentes en una sola respuesta —directorio de la
   * Superintendencia, padrón del SRI y balances— porque la pantalla las
   * necesita a la vez y hacer tres viajes desde el navegador sólo añadiría
   * parpadeo.
   */
  async fichaCompleta(expediente: string) {
    const compania = await this.buscarUno(expediente);
    if (!compania) return null;

    const [establecimientos, ejercicios, turismo, catastros] = await Promise.all([
      compania.ruc
        ? this.repo.query(
            `SELECT numero, nombre_comercial, estado, provincia, canton, parroquia,
                    codigo_ciiu, actividad
               FROM establecimiento WHERE ruc = $1 ORDER BY numero`,
            [compania.ruc],
          )
        : Promise.resolve([]),
      this.repo.query(
        `SELECT anio, formulario FROM balance
          WHERE expediente = $1 AND ausente_desde_job IS NULL
          ORDER BY anio`,
        [expediente],
      ),
      // Registros del Catastro Nacional de Turismo. El detalle —dirección,
      // categoría, contacto— sólo existe aquí: el directorio de la
      // Superintendencia no lo tiene.
      compania.ruc
        ? this.repo.query(
            `SELECT numero_registro, codigo_establecimiento, nombre_comercial, fecha_registro,
                    actividad, clasificacion, categoria, provincia, canton, parroquia,
                    direccion, referencia_direccion, telefono, correo, sitio_web,
                    representante_legal, estado_registro
               FROM turismo_establecimiento
              WHERE ruc = $1 AND ausente_desde_job IS NULL
              ORDER BY codigo_establecimiento, numero_registro`,
            [compania.ruc],
          )
        : Promise.resolve([]),
      compania.ruc
        ? this.repo.query(
            `SELECT catastro, anio, jurisdiccion, provincia, tipo_contribuyente,
                    clase_contribuyente, obligado_contabilidad, anio_fiscal_analizado
               FROM catastro_sri
              WHERE ruc = $1 AND ausente_desde_job IS NULL
              ORDER BY catastro, anio DESC`,
            [compania.ruc],
          )
        : Promise.resolve([]),
    ]);

    // Misma resolución del nombre de actividad que en el listado: sin esto la
    // ficha mostraría el código CIIU y un guion donde la tabla sí da el nombre.
    const [conActividad] = await this.conNombreActividad([compania]);

    return {
      compania: conActividad,
      establecimientos,
      // Sólo qué ejercicios existen; las cifras están en /balances y en
      // /analisis, y duplicarlas aquí sería tener dos verdades.
      ejercicios: ejercicios.map((e: Record<string, string>) => ({
        anio: Number(e.anio),
        formulario: Number(e.formulario),
      })),
      turismo,
      catastros,
    };
  }

  async facetas() {
    const [provincias, situaciones, tipos, aniosCatastro] = await Promise.all([
      this.repo.query(
        `SELECT provincia AS valor, count(*)::bigint AS n FROM companias
         WHERE provincia IS NOT NULL AND ausente_desde_job IS NULL
         GROUP BY provincia ORDER BY n DESC LIMIT 40`,
      ),
      this.repo.query(
        `SELECT situacion_legal AS valor, count(*)::bigint AS n FROM companias
         WHERE situacion_legal IS NOT NULL AND ausente_desde_job IS NULL
         GROUP BY situacion_legal ORDER BY n DESC LIMIT 40`,
      ),
      this.repo.query(
        `SELECT tipo AS valor, count(*)::bigint AS n FROM companias
         WHERE tipo IS NOT NULL AND ausente_desde_job IS NULL
         GROUP BY tipo ORDER BY n DESC LIMIT 40`,
      ),
      aniosPorCatastro((sql) => this.repo.query(sql)),
    ]);
    const map = (rows: any[]) => rows.map((r) => ({ valor: r.valor, n: Number(r.n) }));
    return {
      provincias: map(provincias),
      situaciones: map(situaciones),
      tipos: map(tipos),
      aniosCatastro,
    };
  }
}
