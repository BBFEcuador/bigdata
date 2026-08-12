import { parsearCiiu } from './ciiu-file.parser';
import { SourceRow } from '../xlsx/xlsx-row-source';

/**
 * `cells` es 1-based como lo entrega ExcelJS: la posición 0 va vacía.
 * Aquí se construyen filas con la disposición real del archivo.
 */
const fila = (rowNumber: number, cols: Record<number, unknown>): SourceRow => {
  const cells: unknown[] = new Array(13).fill(undefined);
  for (const [i, v] of Object.entries(cols)) cells[Number(i)] = v;
  return { rowNumber, cells };
};

const TITULO = fila(1, { 3: 'TABLA 19 ACTIVIDAD ECONÓMICA RECEPTORA' });
const CABECERA = fila(2, {
  1: 'CÓDIGO CIIU 4',
  2: 'Sección',
  3: ' División',
  4: 'Grupo',
  5: 'Clase',
  6: 'Subclase',
  7: 'Actividad Económica',
  8: 'Aplicación',
});

describe('parsearCiiu', () => {
  it('descarta el título y la cabecera', () => {
    const { actividades } = parsearCiiu([
      TITULO,
      CABECERA,
      fila(3, { 1: 'A', 2: 'AGRICULTURA', 8: 'Aplica a todos' }),
    ]);
    expect(actividades).toHaveLength(1);
    expect(actividades[0].codigo).toBe('A');
  });

  it('detecta el nivel según en qué columna B-G está el nombre', () => {
    const { actividades } = parsearCiiu([
      CABECERA,
      fila(3, { 1: 'A', 2: 'SECCION' }),
      fila(4, { 1: 'A01', 3: 'DIVISION' }),
      fila(5, { 1: 'A011', 4: 'GRUPO' }),
      fila(6, { 1: 'A0111', 5: 'CLASE' }),
      fila(7, { 1: 'A01111', 6: 'SUBCLASE' }),
      fila(8, { 1: 'A011111', 7: 'ACTIVIDAD' }),
    ]);
    expect(actividades.map((x) => x.nivelColumna)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(actividades.map((x) => x.nombre)).toEqual([
      'SECCION', 'DIVISION', 'GRUPO', 'CLASE', 'SUBCLASE', 'ACTIVIDAD',
    ]);
  });

  it('IGNORA la leyenda de las columnas J-L', () => {
    // En el archivo real esa leyenda ocupa las mismas filas que los datos. Si se
    // leyera, "Sección"/"Nivel 1" entrarían como si fuesen nombres de nivel.
    const { actividades } = parsearCiiu([
      CABECERA,
      fila(3, { 1: 'A', 2: 'AGRICULTURA', 10: 1, 11: 'Sección', 12: 'Nivel 1' }),
    ]);
    expect(actividades).toHaveLength(1);
    expect(actividades[0].nombre).toBe('AGRICULTURA');
    expect(actividades[0].nivelColumna).toBe(1);
  });

  it('lee la columna de aplicación', () => {
    const { actividades } = parsearCiiu([
      CABECERA,
      fila(3, { 1: 'A011111', 7: 'Cultivo de trigo.', 8: 'Aplica Seg 1, 2 y 3, Cajas y CONAFIPS' }),
    ]);
    expect(actividades[0].aplicacion).toBe('Aplica Seg 1, 2 y 3, Cajas y CONAFIPS');
  });

  it('normaliza el código a mayúsculas y sin espacios', () => {
    const { actividades } = parsearCiiu([CABECERA, fila(3, { 1: ' a011111 ', 7: 'X' })]);
    expect(actividades[0].codigo).toBe('A011111');
  });

  it('rechaza un código que no sea letra + dígitos', () => {
    const { actividades, rechazos } = parsearCiiu([
      CABECERA,
      fila(3, { 1: 'A', 2: 'OK' }),
      fila(4, { 1: '1234', 3: 'SIN LETRA' }),
    ]);
    expect(actividades).toHaveLength(1);
    expect(rechazos[0].fila).toBe(4);
    expect(rechazos[0].motivo).toMatch(/codigo_invalido/);
  });

  it('rechaza una fila con código pero sin nombre en ninguna columna', () => {
    const { rechazos } = parsearCiiu([CABECERA, fila(3, { 1: 'A011', 8: 'Aplica' })]);
    expect(rechazos[0].motivo).toMatch(/sin_nombre/);
  });

  it('ignora las filas totalmente vacías del final de la hoja', () => {
    const { actividades, rechazos } = parsearCiiu([
      CABECERA,
      fila(3, { 1: 'A', 2: 'OK' }),
      fila(4, {}),
      fila(5, {}),
    ]);
    expect(actividades).toHaveLength(1);
    expect(rechazos).toHaveLength(0);
  });

  it('desenvuelve texto enriquecido y fórmulas', () => {
    const { actividades } = parsearCiiu([
      CABECERA,
      fila(3, { 1: 'A', 2: { richText: [{ text: 'AGRI' }, { text: 'CULTURA' }] } }),
      fila(4, { 1: 'A01', 3: { formula: 'X1', result: 'CALCULADO' } }),
    ]);
    expect(actividades[0].nombre).toBe('AGRICULTURA');
    expect(actividades[1].nombre).toBe('CALCULADO');
  });

  it('ante un código duplicado gana el último y lo cuenta', () => {
    const { actividades, duplicados } = parsearCiiu([
      CABECERA,
      fila(3, { 1: 'A', 2: 'PRIMERO' }),
      fila(4, { 1: 'A', 2: 'SEGUNDO' }),
    ]);
    expect(duplicados).toBe(1);
    expect(actividades).toHaveLength(1);
    expect(actividades[0].nombre).toBe('SEGUNDO');
  });
});
