import { aFormatoSupercias, construirJerarquiaCiiu, nivelPorLongitud } from './jerarquia-ciiu';
import { ActividadCruda } from './ciiu-file.parser';

/** Helper: `a('A011', 3)` = código A011 con el nombre en la columna de nivel 3. */
const a = (codigo: string, nivelColumna: number, nombre = `N-${codigo}`): ActividadCruda => ({
  codigo,
  nombre,
  nivelColumna,
  aplicacion: 'Aplica a todos los segmentos',
  fila: 1,
});

/** Extracto fiel del archivo real, con las 4 anomalías incluidas. */
const MUESTRA: ActividadCruda[] = [
  a('A', 1, 'AGRICULTURA, GANADERÍA, SILVICULTURA Y PESCA'),
  a('A01', 2),
  a('A011', 3),
  a('A0111', 4),
  a('A01111', 5),
  a('A011111', 6, 'Cultivo de trigo.'),
  a('G', 1),
  a('G46', 2),
  a('G466', 3),
  a('G4669', 4),
  // Anomalía real: código de 6 caracteres (Subclase) con el nombre puesto en la
  // columna de Actividad Económica.
  a('G46694', 6, 'Venta al por mayor de otros productos metálicos elaborados.'),
  a('G466940', 6),
  a('N', 1, 'ACTIVIDADES DE SERVICIOS ADMINISTRATIVOS Y DE APOYO.'),
  a('E', 1, 'DISTRIBUCIÓN DE AGUA; ALCANTARILLADO.'),
  // Categorías especiales del final del archivo: código largo, columna Sección.
  a('N000000', 1, 'CONSUMO - NO PRODUCTIVO'),
  a('V000000', 1, 'VIVIENDA - NO PRODUCTIVO'),
  a('E000000', 1, 'EDUCATIVO - NO PRODUCTIVO'),
];

describe('nivelPorLongitud', () => {
  it('sigue la definición oficial CIIU', () => {
    expect(nivelPorLongitud(1)).toBe(1); // A       Sección
    expect(nivelPorLongitud(3)).toBe(2); // A01     División
    expect(nivelPorLongitud(4)).toBe(3); // A011    Grupo
    expect(nivelPorLongitud(5)).toBe(4); // A0111   Clase
    expect(nivelPorLongitud(6)).toBe(5); // A01111  Subclase
    expect(nivelPorLongitud(7)).toBe(6); // A011111 Actividad
  });
});

describe('aFormatoSupercias', () => {
  it('inserta el punto sólo en los códigos de último nivel', () => {
    expect(aFormatoSupercias('A011111')).toBe('A0111.11');
    expect(aFormatoSupercias('H492301')).toBe('H4923.01');
  });

  it('devuelve null en los niveles superiores', () => {
    ['A', 'A01', 'A011', 'A0111', 'A01111'].forEach((c) =>
      expect(aFormatoSupercias(c)).toBeNull(),
    );
  });
});

describe('construirJerarquiaCiiu', () => {
  const { actividades, discrepancias } = construirJerarquiaCiiu(MUESTRA);
  const por = Object.fromEntries(actividades.map((x) => [x.codigo, x]));

  it('encadena la jerarquía normal', () => {
    expect(por['A01'].codigoPadre).toBe('A');
    expect(por['A011'].codigoPadre).toBe('A01');
    expect(por['A011111'].codigoPadre).toBe('A01111');
    expect(por['A011111'].nivel).toBe(6);
    expect(por['A011111'].nivelNombre).toBe('Actividad Económica');
  });

  it('NO cuelga las categorías especiales de la sección con su misma letra', () => {
    // Ésta es la prueba que justifica toda la lógica de esta clase: sin la
    // restricción de nivel, CONSUMO - NO PRODUCTIVO colgaría de "Actividades de
    // servicios administrativos" y EDUCATIVO de "Distribución de agua".
    expect(por['N000000'].codigoPadre).toBeNull();
    expect(por['E000000'].codigoPadre).toBeNull();
    expect(por['V000000'].codigoPadre).toBeNull();
  });

  it('trata las categorías especiales como nivel 1 pese a su código largo', () => {
    expect(por['N000000'].nivel).toBe(1);
    expect(por['N000000'].nivelNombre).toBe('Sección');
    expect(por['N000000'].longitud).toBe(7);
  });

  it('corrige el nivel de G46694 usando la longitud, no la columna', () => {
    expect(por['G46694'].nivel).toBe(5); // Subclase, no Actividad
    expect(por['G46694'].codigoPadre).toBe('G4669');
  });

  it('deja que G466940 cuelgue de su padre inmediato tras la corrección', () => {
    expect(por['G466940'].nivel).toBe(6);
    expect(por['G466940'].codigoPadre).toBe('G46694');
  });

  it('no deja ningún salto de nivel', () => {
    const saltos = actividades.filter(
      (x) => x.codigoPadre && por[x.codigoPadre].nivel !== x.nivel - 1,
    );
    expect(saltos).toEqual([]);
  });

  it('reporta exactamente las 4 discrepancias sembradas', () => {
    expect(discrepancias.map((d) => d.codigo).sort()).toEqual(
      ['E000000', 'G46694', 'N000000', 'V000000'].sort(),
    );
  });

  it('marca como hoja sólo lo que no tiene hijos', () => {
    expect(por['A011111'].esHoja).toBe(true);
    expect(por['N000000'].esHoja).toBe(true);
    expect(por['A'].esHoja).toBe(false);
    expect(por['G46694'].esHoja).toBe(false);
  });

  it('calcula codigo_supercias sólo en el último nivel', () => {
    expect(por['A011111'].codigoSupercias).toBe('A0111.11');
    expect(por['A0111'].codigoSupercias).toBeNull();
  });

  it('cuenta las raíces correctamente', () => {
    const raices = actividades.filter((x) => x.codigoPadre === null);
    // A, G, N, E (secciones) + N000000, V000000, E000000 (especiales)
    expect(raices).toHaveLength(7);
  });

  it('cambia el hash si cambia la posición en la jerarquía', () => {
    const base = construirJerarquiaCiiu([a('A', 1), a('A01', 2)]).actividades;
    const suelta = construirJerarquiaCiiu([a('Z', 1), a('A01', 2)]).actividades;
    const x = base.find((i) => i.codigo === 'A01')!;
    const y = suelta.find((i) => i.codigo === 'A01')!;
    expect(x.codigoPadre).toBe('A');
    expect(y.codigoPadre).toBeNull();
    expect(x.rowHash).not.toBe(y.rowHash);
  });
});
