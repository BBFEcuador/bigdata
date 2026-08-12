import {
  BALANCE_COLUMNS,
  CABECERAS_IDENTIDAD,
  COPY_COLUMNS_BALANCE,
  COPY_COLUMNS_CUENTA,
  STAGING_TYPES_BALANCE,
  STAGING_TYPES_CUENTA,
} from './balances.constants';
import { FORMULARIO_POR_NUM_CUENTAS } from '../formularios';
import { CONCEPTOS, codigosEcuacion } from '../../../common/finanzas/conceptos';

/**
 * Estos tests no prueban lógica: fijan la correspondencia entre las cuatro
 * listas que tienen que coincidir (DDL del staging, columnas del COPY, orden de
 * serialización y merge).
 *
 * Existen porque su desajuste ya rompió una carga real: `formulario` estaba en
 * los tipos del staging pero no en las columnas del COPY, y Postgres abortó con
 * "extra data after last expected column" después de leer el archivo entero.
 * Un desajuste al revés es peor todavía: no falla, mete los datos corridos de
 * columna.
 */
describe('constantes del import de balances', () => {
  it('cada columna del COPY de cabeceras tiene tipo declarado', () => {
    for (const col of COPY_COLUMNS_BALANCE) {
      expect(STAGING_TYPES_BALANCE[col]).toBeDefined();
    }
  });

  it('no sobra ningún tipo sin columna en el COPY de cabeceras', () => {
    expect(Object.keys(STAGING_TYPES_BALANCE).sort()).toEqual([...COPY_COLUMNS_BALANCE].sort());
  });

  it('cada columna del COPY de detalle tiene tipo declarado', () => {
    for (const col of COPY_COLUMNS_CUENTA) {
      expect(STAGING_TYPES_CUENTA[col]).toBeDefined();
    }
  });

  it('no sobra ningún tipo sin columna en el COPY de detalle', () => {
    expect(Object.keys(STAGING_TYPES_CUENTA).sort()).toEqual([...COPY_COLUMNS_CUENTA].sort());
  });

  it('las columnas de identidad del archivo están todas en el COPY', () => {
    for (const col of BALANCE_COLUMNS) {
      expect(COPY_COLUMNS_BALANCE).toContain(col);
    }
  });

  it('`formulario` NO es una columna del archivo pero SÍ del staging', () => {
    // Se detecta una vez, del encabezado; no viene en cada fila.
    expect(BALANCE_COLUMNS as readonly string[]).not.toContain('formulario');
    expect(CABECERAS_IDENTIDAD as Record<string, string>).not.toHaveProperty('formulario');
    expect(COPY_COLUMNS_BALANCE).toContain('formulario');
    expect(COPY_COLUMNS_CUENTA).toContain('formulario');
  });

  it('cada columna de identidad tiene su cabecera esperada', () => {
    for (const col of BALANCE_COLUMNS) {
      expect(CABECERAS_IDENTIDAD[col]).toMatch(/^[A-Z0-9_]+$/);
    }
  });

  it('los tres planes de cuentas conocidos tienen formularios distintos', () => {
    const formularios = Object.values(FORMULARIO_POR_NUM_CUENTAS);
    expect(new Set(formularios).size).toBe(formularios.length);
    expect(FORMULARIO_POR_NUM_CUENTAS[622]).toBe(1);
    expect(FORMULARIO_POR_NUM_CUENTAS[925]).toBe(3);
  });
});

/**
 * El mapeo entre formularios es el punto donde un error no daría ningún fallo:
 * mostraría el activo de una empresa en la fila del pasivo, o dejaría 2021
 * fuera de la serie sin avisar.
 */
describe('conceptos financieros', () => {
  it('cada concepto tiene código en los dos formularios cargados', () => {
    for (const c of CONCEPTOS) {
      expect(typeof c.codigos[1]).toBe('string');
      expect(typeof c.codigos[3]).toBe('string');
    }
  });

  it('no repite un código dentro del mismo formulario', () => {
    for (const formulario of [1, 3]) {
      const codigos = CONCEPTOS.map((c) => c.codigos[formulario]);
      expect(new Set(codigos).size).toBe(codigos.length);
    }
  });

  it('no repite una clave de concepto', () => {
    const claves = CONCEPTOS.map((c) => c.clave);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it('los códigos de la ecuación contable son los del catálogo real', () => {
    // IFRS: raíces 1, 2 y 3. Fiscal: TOTAL ACTIVO / PASIVOS / PATRIMONIO NETO.
    expect(codigosEcuacion(1)).toEqual({ activo: '1', pasivo: '2', patrimonio: '3' });
    expect(codigosEcuacion(3)).toEqual({ activo: '499', pasivo: '599', patrimonio: '698' });
  });

  it('no mezcla los códigos de un formulario con los del otro', () => {
    // El `3` es patrimonio en el IFRS y una cuenta de activo en el fiscal:
    // usarlo como patrimonio del formulario 3 sería el error clásico.
    expect(codigosEcuacion(3)!.patrimonio).not.toBe(codigosEcuacion(1)!.patrimonio);
  });

  it('devuelve null para un formulario sin mapeo', () => {
    expect(codigosEcuacion(2)).toBeNull();
  });
});
