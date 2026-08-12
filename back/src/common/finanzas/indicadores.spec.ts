import { INDICADORES, calcularIndicadores, sqlDeFormula } from './indicadores';
import { CONCEPTOS } from './conceptos';

/** Balance de juguete, con números que hacen los ratios fáciles de comprobar. */
const M = {
  activo: 1000,
  activoCorriente: 400,
  activoNoCorriente: 600,
  pasivo: 400,
  pasivoCorriente: 200,
  pasivoNoCorriente: 200,
  patrimonio: 600,
  inventarios: 100,
  ingresos: 2000,
  gananciaBruta: 500,
  costoVentas: 1500,
  gastos: 300,
  gastosFinancieros: 50,
  utilidadAntesImpuestos: 150,
  utilidadNeta: 120,
};

const ind = (m: Record<string, number | undefined>) => calcularIndicadores(m);

describe('indicadores financieros', () => {
  it('calcula los ratios de liquidez', () => {
    const r = ind(M);
    expect(r.liquidezCorriente).toBeCloseTo(2); // 400 / 200
    expect(r.pruebaAcida).toBeCloseTo(1.5); // (400 - 100) / 200
    expect(r.capitalTrabajo).toBe(200); // 400 - 200
  });

  it('calcula solvencia y endeudamiento', () => {
    const r = ind(M);
    expect(r.endeudamientoActivo).toBeCloseTo(0.4);
    expect(r.endeudamientoPatrimonial).toBeCloseTo(0.6667, 3);
    expect(r.apalancamiento).toBeCloseTo(1.6667, 3);
    expect(r.coberturaIntereses).toBeCloseTo(3); // 150 / 50
  });

  it('calcula rentabilidad', () => {
    const r = ind(M);
    expect(r.margenBruto).toBeCloseTo(0.25); // 500 / 2000
    expect(r.margenNeto).toBeCloseTo(0.06); // 120 / 2000
    expect(r.roa).toBeCloseTo(0.12); // 120 / 1000
    expect(r.roe).toBeCloseTo(0.2); // 120 / 600
  });

  /**
   * Éste es el test que de verdad importa. Con 578.000 empresas, el patrimonio
   * cero y los ingresos cero están garantizados; devolver 0 los mezclaría con
   * las empresas que legítimamente tienen un ratio de 0 y falsearía cualquier
   * promedio o percentil sectorial.
   */
  it('devuelve null y no cero cuando el denominador es cero', () => {
    const r = ind({ ...M, patrimonio: 0, ingresos: 0, activo: 0, pasivoCorriente: 0 });
    expect(r.roe).toBeNull();
    expect(r.endeudamientoPatrimonial).toBeNull();
    expect(r.margenNeto).toBeNull();
    expect(r.roa).toBeNull();
    expect(r.liquidezCorriente).toBeNull();
    // Y ninguno se cuela como 0, Infinity o NaN.
    for (const v of Object.values(r)) {
      expect(v === null || Number.isFinite(v)).toBe(true);
    }
  });

  it('devuelve null cuando falta un insumo, sin aproximar', () => {
    // Así llegan los años del formulario fiscal: sin inventarios ni gastos
    // financieros por separado.
    const sinIfrs = { ...M, inventarios: undefined, gastosFinancieros: undefined };
    const r = ind(sinIfrs);
    expect(r.pruebaAcida).toBeNull();
    expect(r.coberturaIntereses).toBeNull();
    expect(r.cargaFinanciera).toBeNull();
    // Los que no dependen de ellos se siguen calculando.
    expect(r.liquidezCorriente).toBeCloseTo(2);
    expect(r.roe).toBeCloseTo(0.2);
  });

  it('admite pérdidas sin romperse', () => {
    const r = ind({ ...M, utilidadNeta: -300, utilidadAntesImpuestos: -280 });
    expect(r.roe).toBeCloseTo(-0.5);
    expect(r.margenNeto).toBeCloseTo(-0.15);
    expect(r.coberturaIntereses).toBeCloseTo(-5.6);
  });

  it('admite patrimonio negativo, que existe y no es un error', () => {
    const r = ind({ ...M, patrimonio: -200 });
    expect(r.roe).toBeCloseTo(-0.6);
    expect(r.apalancamiento).toBeCloseTo(-5);
  });

  it('no repite claves de indicador', () => {
    const claves = INDICADORES.map((i) => i.clave);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it('calcula todos los indicadores declarados', () => {
    const r = ind(M);
    for (const i of INDICADORES) expect(r).toHaveProperty(i.clave);
  });
});

/**
 * La fórmula se declara una vez y de ahí salen dos implementaciones: la de
 * TypeScript, que calcula la ficha de una compañía, y la de SQL, que saca los
 * percentiles sectoriales de 670.000 balances de una pasada.
 *
 * Estos tests cuidan la costura entre las dos. No pueden ejecutar el SQL —eso
 * necesita la base—, pero sí comprueban lo que sí puede divergir en silencio:
 * que la fórmula nombre magnitudes que existen, y que el SQL generado use
 * exactamente esas y proteja el denominador.
 */
describe('fórmulas de indicador', () => {
  const conceptos = new Set(CONCEPTOS.map((c) => c.clave));

  it('sólo nombra magnitudes que el diccionario de conceptos produce', () => {
    for (const i of INDICADORES) {
      for (const clave of [...i.formula.num, ...(i.formula.menos ?? []), ...(i.formula.den ?? [])]) {
        expect(conceptos).toContain(clave);
      }
    }
  });

  it('genera SQL con las mismas magnitudes que la fórmula', () => {
    for (const i of INDICADORES) {
      const sql = sqlDeFormula(i.formula, 'm');
      const usadas = [...sql.matchAll(/->> '([a-zA-Z]+)'/g)].map((x) => x[1]);
      const esperadas = [
        ...i.formula.num,
        ...(i.formula.menos ?? []),
        ...(i.formula.den ?? []),
      ];
      expect(usadas.sort()).toEqual(esperadas.sort());
    }
  });

  it('protege el denominador en SQL, que es la regla del cero', () => {
    for (const i of INDICADORES) {
      const sql = sqlDeFormula(i.formula, 'm');
      // Sin denominador (capital de trabajo) no hay nada que proteger.
      expect(sql.includes('nullif')).toBe(Boolean(i.formula.den));
    }
  });

  it('rechaza una clave que no podría interpolarse sin riesgo', () => {
    expect(() => sqlDeFormula({ num: ["activo'; DROP TABLE balance --"] }, 'm')).toThrow();
  });

  it('todos los indicadores dicen hacia dónde es mejor estar', () => {
    for (const i of INDICADORES) {
      expect(['alto', 'bajo', 'neutro']).toContain(i.mejor);
    }
  });
});
