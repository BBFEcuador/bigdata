import { assertRequiredColumns, resolveHeader } from './header-map';
import { BUSINESS_COLUMNS } from '../imports.constants';

/** Cabecera real del archivo de la Superintendencia (índice 1-based como ExcelJS). */
const CABECERA_REAL = [
  undefined,
  'EXPEDIENTE', 'RUC', 'NOMBRE', 'SITUACIÓN LEGAL', 'FECHA_CONSTITUCION', 'TIPO',
  'PAÍS', 'REGIÓN', 'PROVINCIA', 'CANTÓN', 'CIUDAD', 'CALLE', 'NÚMERO',
  'INTERSECCIÓN', 'BARRIO', 'TELÉFONO', 'REPRESENTANTE', 'CARGO',
  'CAPITAL SUSCRITO', 'CIIU NIVEL 1', 'CIIU NIVEL 6', 'ÚLTIMO BALANCE',
  'PRESENTÓ BALANCE INICIAL', 'FECHA PRESENTACIÓN BALANCE INICIAL',
];

describe('resolveHeader', () => {
  it('reconoce las 24 columnas de la cabecera real', () => {
    const r = resolveHeader(CABECERA_REAL);
    expect(r.missingColumns).toEqual([]);
    expect(Object.keys(r.indexByColumn)).toHaveLength(BUSINESS_COLUMNS.length);
  });

  it('mantiene la posición correcta de cada columna', () => {
    const r = resolveHeader(CABECERA_REAL);
    expect(r.indexByColumn.expediente).toBe(1);
    expect(r.indexByColumn.ruc).toBe(2);
    expect(r.indexByColumn.fecha_presentacion_balance_inicial).toBe(24);
  });

  it('tolera tildes ausentes, minúsculas, espacios dobles y NBSP', () => {
    const sucia = [...CABECERA_REAL];
    sucia[4] = `situacion${String.fromCharCode(160)}legal`;
    sucia[9] = 'PROVINCIA  ';
    sucia[7] = 'pais';
    const r = resolveHeader(sucia);
    expect(r.missingColumns).toEqual([]);
  });

  it('no depende del orden de las columnas', () => {
    const invertida = [undefined, ...CABECERA_REAL.slice(1).reverse()];
    const r = resolveHeader(invertida);
    expect(r.missingColumns).toEqual([]);
    expect(r.indexByColumn.expediente).toBe(24);
  });

  it('registra las cabeceras desconocidas sin fallar', () => {
    const r = resolveHeader([...CABECERA_REAL, 'COLUMNA_INVENTADA']);
    expect(r.unknownHeaders).toContain('COLUMNA_INVENTADA');
    expect(r.missingColumns).toEqual([]);
  });
});

describe('assertRequiredColumns', () => {
  it('pasa con la cabecera real', () => {
    expect(() => assertRequiredColumns(resolveHeader(CABECERA_REAL), [])).not.toThrow();
  });

  it('falla de inmediato si falta una columna obligatoria', () => {
    // Mejor abortar en el segundo 1 que cargar un millón de filas de NULLs.
    const sinNombre = CABECERA_REAL.map((h) => (h === 'NOMBRE' ? 'OTRA_COSA' : h));
    expect(() => assertRequiredColumns(resolveHeader(sinNombre), ['...'])).toThrow(/nombre/);
  });
});
