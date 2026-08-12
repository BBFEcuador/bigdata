import { construirJerarquia } from './jerarquia';
import { CuentaCruda } from './catalogo-file.parser';

const c = (codigo: string, nombre = `N${codigo}`): CuentaCruda => ({ codigo, nombre, linea: 1 });

/** Extracto fiel del archivo real, con los casos que rompen las reglas ingenuas. */
const MUESTRA = [
  c('1', 'ACTIVO'),
  c('101', 'ACTIVO CORRIENTE'),
  c('10101', 'EFECTIVO Y EQUIVALENTES'),
  c('1010101', 'CAJA'),
  c('101020101', 'RENTA VARIABLE'),
  c('10102010101', 'ACCIONES Y PARTICIPACIONES'),
  c('3', 'PATRIMONIO NETO'),
  c('30', 'PATRIMONIO ATRIBUIBLE'),
  c('301', 'CAPITAL'),
  c('401', 'INGRESOS DE ACTIVIDADES ORDINARIAS'),
  c('40101', 'VENTA DE BIENES'),
];

describe('construirJerarquia', () => {
  const porCodigo = Object.fromEntries(
    construirJerarquia(MUESTRA).map((x) => [x.codigo, x]),
  );

  it('asigna como padre el prefijo más largo presente', () => {
    expect(porCodigo['10101'].codigoPadre).toBe('101');
    expect(porCodigo['1010101'].codigoPadre).toBe('10101');
  });

  it('salta los niveles que no existen en el archivo', () => {
    // Entre 1010101 y 101020101 no hay 10102 en esta muestra: el padre real es
    // el prefijo más largo que SÍ está, no el "nivel anterior" teórico.
    expect(porCodigo['101020101'].codigoPadre).toBe('101');
    expect(porCodigo['10102010101'].codigoPadre).toBe('101020101');
  });

  it('maneja los códigos de longitud 2, que rompen la regla 1+2k', () => {
    expect(porCodigo['30'].codigoPadre).toBe('3');
    expect(porCodigo['301'].codigoPadre).toBe('30');
    expect(porCodigo['301'].nivel).toBe(3);
  });

  it('deja como raíz un código cuyo ancestro no está en el archivo', () => {
    // No existe la fila "4", así que 401 es raíz legítima.
    expect(porCodigo['401'].codigoPadre).toBeNull();
    expect(porCodigo['401'].nivel).toBe(1);
    expect(porCodigo['40101'].codigoPadre).toBe('401');
    expect(porCodigo['40101'].nivel).toBe(2);
  });

  it('calcula el nivel como profundidad real, no como longitud', () => {
    expect(porCodigo['1'].nivel).toBe(1);
    expect(porCodigo['101'].nivel).toBe(2);
    expect(porCodigo['10101'].nivel).toBe(3);
    expect(porCodigo['1010101'].nivel).toBe(4);
  });

  it('marca como hoja sólo lo que no tiene hijos', () => {
    expect(porCodigo['1010101'].esHoja).toBe(true);
    expect(porCodigo['10102010101'].esHoja).toBe(true);
    expect(porCodigo['1'].esHoja).toBe(false);
    expect(porCodigo['101'].esHoja).toBe(false);
  });

  it('guarda la longitud del código', () => {
    expect(porCodigo['10102010101'].longitud).toBe(11);
    expect(porCodigo['30'].longitud).toBe(2);
  });

  it('produce el mismo hash ante la misma entrada', () => {
    const a = construirJerarquia(MUESTRA);
    const b = construirJerarquia(MUESTRA);
    expect(a.map((x) => x.rowHash)).toEqual(b.map((x) => x.rowHash));
  });

  it('cambia el hash si cambia el nombre', () => {
    const otra = construirJerarquia([c('1', 'ACTIVO'), c('101', 'OTRO NOMBRE')]);
    const base = construirJerarquia([c('1', 'ACTIVO'), c('101', 'ACTIVO CORRIENTE')]);
    expect(otra[1].rowHash).not.toBe(base[1].rowHash);
  });

  it('cambia el hash si sólo cambia la posición en la jerarquía', () => {
    // Si el hash sólo cubriera el nombre, una recolocación pasaría por
    // "sin cambios" y no llegaría a escribirse nunca.
    const conPadre = construirJerarquia([c('1', 'A'), c('12', 'X')]);
    const sinPadre = construirJerarquia([c('9', 'A'), c('12', 'X')]);
    const a = conPadre.find((x) => x.codigo === '12')!;
    const b = sinPadre.find((x) => x.codigo === '12')!;
    expect(a.codigoPadre).toBe('1');
    expect(b.codigoPadre).toBeNull();
    expect(a.rowHash).not.toBe(b.rowHash);
  });

  it('no entra en bucle: el padre siempre es más corto que el hijo', () => {
    const grande = Array.from({ length: 200 }, (_, i) => c(String(i + 1)));
    expect(() => construirJerarquia(grande)).not.toThrow();
  });
});
