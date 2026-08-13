import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Balance } from './entities/balance.entity';
import {
  BalancesQuery,
  BalancesReadRepository,
} from '../../application/ports/balances-read.repository';
import { FORMULARIO_IFRS } from '../../balances.constants';
import {
  CONCEPTOS,
  clavePorCodigo,
} from '../../../../common/finanzas/conceptos';
import {
  GRUPOS_INDICADOR,
  INDICADORES,
  Magnitudes,
  calcularIndicadores,
} from '../../../../common/finanzas/indicadores';

/**
 * Orden contable: cada cuenta justo encima de sus hijas.
 *
 *     1          ACTIVO
 *     101          ACTIVO CORRIENTE
 *     10101          EFECTIVO Y EQUIVALENTES
 *     10102          ACTIVOS FINANCIEROS
 *     102          ACTIVOS NO CORRIENTES
 *     2          PASIVO
 *
 * Se compara como TEXTO, nunca como número. En este plan de cuentas el padre es
 * siempre prefijo de sus hijas, así que la comparación lexicográfica reproduce
 * el árbol exactamente.
 *
 * Comparar como número —que es lo que hacía `localeCompare(..., {numeric:true})`—
 * ordena 1, 2, 3, 101, 102, 10101: saca primero TODAS las cuentas madre y deja
 * las hijas agrupadas al final, que es justo lo que no se quiere leer en un
 * estado financiero.
 */
export function porOrdenContable(
  a: { codigo: string },
  b: { codigo: string },
): number {
  return a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0;
}

/** Todos los códigos clave de todos los formularios, para pedirlos de una vez. */
function todosLosCodigosClave(): string[] {
  const codigos = new Set<string>();
  for (const c of CONCEPTOS) {
    for (const codigo of Object.values(c.codigos)) {
      if (codigo) codigos.add(codigo);
    }
  }
  return [...codigos];
}

@Injectable()
export class TypeormBalancesReadRepository implements BalancesReadRepository {
  constructor(
    @InjectRepository(Balance) private readonly repo: Repository<Balance>,
  ) {}

  /**
   * Listado paginado por keyset.
   *
   * Ni `OFFSET` ni `COUNT(*)` sin acotar: son 577.557 cabeceras y ambos se
   * degradan en las páginas profundas. Se ordena por la clave y se devuelve un
   * cursor, igual que en el listado de compañías.
   */
  async list(q: BalancesQuery) {
    const limit = q.limit ?? 50;
    // Sin filtro de formulario: en 2021 la mayoría de balances son del fiscal.
    const qb = this.repo
      .createQueryBuilder('b')
      .where('b.ausenteDesdeJob IS NULL');

    if (q.anio) qb.andWhere('b.anio = :anio', { anio: q.anio });
    if (q.nombre)
      qb.andWhere('b.nombre ILIKE :nombre', { nombre: `%${q.nombre}%` });
    if (q.ruc) qb.andWhere('b.ruc LIKE :ruc', { ruc: `${q.ruc}%` });
    if (q.rama)
      qb.andWhere('b.ramaActividad = :rama', { rama: q.rama.toUpperCase() });
    if (q.cursor) qb.andWhere('b.expediente > :cursor', { cursor: q.cursor });

    // Una fila de más para saber si hay página siguiente sin contar nada.
    const filas = await qb
      .orderBy('b.expediente', 'ASC')
      .addOrderBy('b.anio', 'ASC')
      .take(limit + 1)
      .getMany();

    const hayMas = filas.length > limit;
    const datos = hayMas ? filas.slice(0, limit) : filas;

    return {
      datos,
      cursorSiguiente: hayMas ? datos[datos.length - 1].expediente : null,
    };
  }

  /**
   * Cuántos balances y cuántas celdas hay por ejercicio.
   *
   * Agrupado por AÑO, no por (año, formulario): en 2021 conviven los dos
   * formularios y desglosarlos aquí sacaba dos entradas "2021" en la pantalla.
   * El reparto por formulario se devuelve como detalle dentro del mismo año.
   */
  async summary() {
    const filas = await this.repo.query(`
      SELECT b.anio,
             b.formulario,
             count(*)::int AS balances,
             (SELECT count(*)::bigint FROM balance_cuenta c
               WHERE c.anio = b.anio AND c.formulario = b.formulario) AS celdas
      FROM balance b
      WHERE b.ausente_desde_job IS NULL
      GROUP BY b.anio, b.formulario
      ORDER BY b.anio DESC, b.formulario
    `);

    const porAnio = new Map<
      number,
      {
        anio: number;
        balances: number;
        celdas: number;
        formularios: { formulario: number; balances: number }[];
      }
    >();
    for (const f of filas) {
      const anio = Number(f.anio);
      if (!porAnio.has(anio))
        porAnio.set(anio, { anio, balances: 0, celdas: 0, formularios: [] });
      const entrada = porAnio.get(anio)!;
      entrada.balances += Number(f.balances);
      entrada.celdas += Number(f.celdas);
      entrada.formularios.push({
        formulario: Number(f.formulario),
        balances: Number(f.balances),
      });
    }
    return [...porAnio.values()].sort((a, b) => b.anio - a.anio);
  }

  /**
   * Serie histórica de una compañía: las cuentas grandes, un año por columna.
   *
   * Es la consulta que da sentido a haber cargado cinco ejercicios. Sólo pide
   * las 13 cuentas de `CONCEPTOS_CLAVE`, así que toca unas decenas de filas por
   * empresa en vez de las ~7.000 que suman sus cinco balances completos.
   */
  async comparative(expediente: string) {
    // Sin filtrar por formulario: en 2021 la mayoría declaró en el fiscal y en
    // los demás años en el IFRS. Filtrar aquí dejaría 2021 fuera de la serie
    // justo en la empresa que sí lo presentó.
    const cabeceras = await this.repo.find({
      where: { expediente },
      order: { anio: 'ASC' },
    });
    if (cabeceras.length === 0) {
      throw new NotFoundException(
        `No hay balances del expediente ${expediente}`,
      );
    }

    // Si una empresa declaró el mismo año en dos formularios, gana el IFRS: es
    // el plan con el que se compara todo lo demás.
    const porAnio = new Map<number, Balance>();
    for (const c of cabeceras) {
      const previa = porAnio.get(c.anio);
      if (!previa || c.formulario === FORMULARIO_IFRS) porAnio.set(c.anio, c);
    }
    const usadas = [...porAnio.values()].sort((a, b) => a.anio - b.anio);
    const anios = usadas.map((c) => c.anio);

    const valores = await this.repo.query(
      `SELECT anio, formulario, codigo_cuenta, valor
         FROM balance_cuenta
        WHERE expediente = $1 AND codigo_cuenta = ANY($2::text[])`,
      [expediente, todosLosCodigosClave()],
    );

    // La resolución código -> concepto depende del formulario de CADA año: el
    // activo es la cuenta `1` en el IFRS y la `499` en el fiscal, y el `3`
    // significa cosas distintas en cada uno.
    const claves = new Map<number, Map<string, string>>();
    for (const f of new Set(usadas.map((c) => c.formulario))) {
      claves.set(f, clavePorCodigo(f));
    }

    const valorPorAnioYClave = new Map<number, Record<string, number>>();
    for (const v of valores) {
      const anio = Number(v.anio);
      const formulario = Number(v.formulario);
      if (porAnio.get(anio)?.formulario !== formulario) continue; // el año usa el otro plan
      const clave = claves.get(formulario)?.get(v.codigo_cuenta);
      if (!clave) continue;
      if (!valorPorAnioYClave.has(anio)) valorPorAnioYClave.set(anio, {});
      valorPorAnioYClave.get(anio)![clave] = Number(v.valor);
    }

    const ultima = usadas[usadas.length - 1];

    return {
      expediente,
      ruc: ultima.ruc,
      nombre: ultima.nombre,
      ramaActividad: ultima.ramaActividad,
      descripcionRama: ultima.descripcionRama,
      ciiu: ultima.ciiu,
      anios,
      /** Qué plan de cuentas se usó cada año; el front lo señala. */
      formularios: usadas.map((c) => c.formulario),
      // Una fila por concepto y un valor por año. La ausencia de fila en
      // `balance_cuenta` significa cero, así que aquí se materializa como 0.
      conceptos: CONCEPTOS.map((c) => ({
        clave: c.clave,
        etiqueta: c.etiqueta,
        bloque: c.bloque,
        valores: anios.map((a) => valorPorAnioYClave.get(a)?.[c.clave] ?? 0),
      })),
    };
  }

  /**
   * Estados financieros COMPLETOS de una compañía, un año por columna.
   *
   * A diferencia del comparativo de conceptos, aquí van las 622 cuentas (o las
   * 925 del fiscal) con su jerarquía, no sólo las magnitudes grandes.
   *
   * Se acota a UN formulario, y eso es una limitación real, no una omisión: los
   * planes de cuentas no tienen equivalencia cuenta a cuenta. Poner en la misma
   * fila la cuenta `1010101` del IFRS y la del fiscal sería juntar dos cosas
   * distintas. Entre formularios sólo son comparables los conceptos, que es
   * justo lo que hace `comparativo()`.
   */
  async statements(expediente: string, formularioPedido?: number) {
    const cabeceras = await this.repo.find({
      where: { expediente },
      order: { anio: 'ASC' },
    });
    if (cabeceras.length === 0) {
      throw new NotFoundException(
        `No hay balances del expediente ${expediente}`,
      );
    }

    const disponibles = [...new Set(cabeceras.map((c) => c.formulario))].sort();
    const formulario =
      formularioPedido && disponibles.includes(formularioPedido)
        ? formularioPedido
        : disponibles.includes(FORMULARIO_IFRS)
          ? FORMULARIO_IFRS
          : disponibles[0];

    const anios = cabeceras
      .filter((c) => c.formulario === formulario)
      .map((c) => c.anio);
    const ultima = cabeceras[cabeceras.length - 1];

    // Todas las cuentas del plan que tengan valor en ALGÚN año, con su nombre y
    // su nivel. El LEFT JOIN va del catálogo al detalle para conservar el orden
    // y la jerarquía aunque una cuenta falte en un año concreto.
    const filas = await this.repo.query(
      `SELECT cc.codigo, cc.nombre, cc.nivel, cc.es_hoja, bc.anio, bc.valor
         FROM balance_cuenta bc
         JOIN categoria_cuenta cc
           ON cc.codigo = bc.codigo_cuenta AND cc.formulario = bc.formulario
        WHERE bc.expediente = $1 AND bc.formulario = $2
        ORDER BY cc.codigo`,
      [expediente, formulario],
    );

    const cuentas = new Map<
      string,
      {
        codigo: string;
        nombre: string;
        nivel: number;
        esHoja: boolean;
        valores: Record<number, number>;
      }
    >();
    for (const f of filas) {
      if (!cuentas.has(f.codigo)) {
        cuentas.set(f.codigo, {
          codigo: f.codigo,
          nombre: f.nombre,
          nivel: Number(f.nivel),
          esHoja: f.es_hoja === true,
          valores: {},
        });
      }
      cuentas.get(f.codigo)!.valores[Number(f.anio)] = Number(f.valor);
    }

    return {
      expediente,
      ruc: ultima.ruc,
      nombre: ultima.nombre,
      formulario,
      formulariosDisponibles: disponibles,
      anios,
      // Un cero explícito donde no hay fila: en `balance_cuenta` la ausencia de
      // fila ES el cero, y la tabla necesita la celda.
      cuentas: [...cuentas.values()].sort(porOrdenContable).map((c) => ({
        codigo: c.codigo,
        nombre: c.nombre,
        nivel: c.nivel,
        esHoja: c.esHoja,
        valores: anios.map((a) => c.valores[a] ?? 0),
      })),
    };
  }

  /**
   * Indicadores financieros por año.
   *
   * Se calculan sobre los CONCEPTOS, así que cubren todos los ejercicios venga
   * cada uno del formulario que venga. Los que necesitan cuentas que el fiscal
   * no desglosa —prueba ácida, cobertura de intereses— salen `null` en esos
   * años en vez de aproximarse.
   */
  async indicators(expediente: string) {
    const comp = await this.comparative(expediente);

    const porClave = new Map(comp.conceptos.map((c) => [c.clave, c.valores]));
    const magnitudesDe = (i: number): Magnitudes => {
      const m: Magnitudes = {};
      for (const c of CONCEPTOS) {
        // Un concepto sin código en el formulario de ese año no es cero: es
        // desconocido, y tiene que llegar como `undefined` para que el
        // indicador salga `null`.
        const tieneCodigo = c.codigos[comp.formularios[i]] != null;
        if (tieneCodigo) m[c.clave] = porClave.get(c.clave)?.[i] ?? 0;
      }
      return m;
    };

    const porAnio = comp.anios.map((_, i) =>
      calcularIndicadores(magnitudesDe(i)),
    );

    return {
      expediente: comp.expediente,
      ruc: comp.ruc,
      nombre: comp.nombre,
      ramaActividad: comp.ramaActividad,
      descripcionRama: comp.descripcionRama,
      anios: comp.anios,
      formularios: comp.formularios,
      grupos: GRUPOS_INDICADOR,
      indicadores: INDICADORES.map((def) => ({
        clave: def.clave,
        etiqueta: def.etiqueta,
        grupo: def.grupo,
        formato: def.formato,
        valores: porAnio.map((r) => r[def.clave]),
      })),
    };
  }

  /** Balance completo de una compañía en un ejercicio, con nombre de cuenta. */
  async detail(expediente: string, anio: number, formularioPedido?: number) {
    // El formulario no se asume: en 2021 la mayoría de balances no son IFRS.
    // Si el año tiene los dos, gana el IFRS.
    const candidatas = await this.repo.find({ where: { expediente, anio } });
    const cabecera =
      candidatas.find(
        (c) => c.formulario === (formularioPedido ?? FORMULARIO_IFRS),
      ) ?? candidatas[0];
    if (!cabecera) {
      throw new NotFoundException(
        `No hay balance de ${expediente} para ${anio}`,
      );
    }
    const formulario = cabecera.formulario;

    const cuentas = await this.repo.query(
      `SELECT bc.codigo_cuenta, cc.nombre, cc.nivel, cc.es_hoja, bc.valor
         FROM balance_cuenta bc
         JOIN categoria_cuenta cc
           ON cc.codigo = bc.codigo_cuenta AND cc.formulario = bc.formulario
        WHERE bc.expediente = $1 AND bc.anio = $2 AND bc.formulario = $3
        -- Orden contable: como TEXTO, para que cada cuenta salga encima de sus
        -- hijas. El COLLATE de bytes lo hace independiente de la configuracion
        -- regional del servidor.
        ORDER BY bc.codigo_cuenta COLLATE "C"`,
      [expediente, anio, formulario],
    );

    return {
      cabecera,
      formulario,
      cuentas: cuentas.map((c: Record<string, string>) => ({
        codigo: c.codigo_cuenta,
        nombre: c.nombre,
        nivel: Number(c.nivel),
        esHoja: c.es_hoja as unknown as boolean,
        valor: Number(c.valor),
      })),
    };
  }
}
