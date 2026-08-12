import {
  IMPORTE_INVALIDO,
  parsearCabecera,
  parsearFila,
  parsearImporte,
} from './balances-file.parser';

/** Cabecera mínima con el mismo aspecto que la del archivo real. */
function cabeceraDe(...cuentas: string[]): string {
  return [
    'AÑO',
    'EXPEDIENTE',
    'RUC',
    'NOMBRE',
    'RAMA_ACTIVIDAD',
    'DESCRIPCION_RAMA',
    'CIIU',
    ...cuentas,
  ].join('\t');
}

/** El archivo real trae 622 columnas de cuenta; aquí basta con superar el mínimo. */
const CUENTAS = Array.from({ length: 60 }, (_, i) => `CUENTA_${100 + i}`);

const CABECERA = parsearCabecera(cabeceraDe(...CUENTAS)).cabecera!;

describe('parsearImporte', () => {
  it('trata el cero como ausencia de dato', () => {
    expect(parsearImporte('0')).toBeNull();
    expect(parsearImporte('0,00')).toBeNull();
    expect(parsearImporte('-0,00')).toBeNull();
    expect(parsearImporte('')).toBeNull();
  });

  it('convierte la coma decimal en punto', () => {
    expect(parsearImporte('1329498,87')).toBe('1329498.87');
    expect(parsearImporte('9638,32')).toBe('9638.32');
  });

  it('acepta un solo decimal', () => {
    expect(parsearImporte('12,5')).toBe('12.5');
  });

  it('completa el cero de las cantidades sin parte entera', () => {
    // El archivo real trae ",63" y "-,22" para importes menores que un dólar.
    expect(parsearImporte(',63')).toBe('0.63');
    expect(parsearImporte('-,22')).toBe('-0.22');
  });

  it('conserva los negativos', () => {
    expect(parsearImporte('-1500,40')).toBe('-1500.40');
  });

  it('NO pierde precisión en importes de 16 dígitos', () => {
    // Pasar por `Number` daría 9999999999999998.00: un double sólo garantiza
    // 15 dígitos significativos y numeric(18,2) admite 16 enteros.
    const grande = '9999999999999999,99';
    expect(parsearImporte(grande)).toBe('9999999999999999.99');
    expect(Number(parsearImporte(grande) as string).toFixed(2)).not.toBe('9999999999999999.99');
  });

  it('cae al respaldo con formatos que este archivo no usa', () => {
    expect(parsearImporte('1.234.567,89')).toBe('1234567.89');
    expect(parsearImporte('USD 500,00')).toBe('500.00');
  });

  it('trata los marcadores de "sin dato" como cero', () => {
    expect(parsearImporte('N/A')).toBeNull();
    expect(parsearImporte('   ')).toBeNull();
  });

  it('marca como inválido lo que dice algo pero no es un importe', () => {
    // Devolver null aquí convertiría un dato ilegible en un cero silencioso.
    expect(parsearImporte('abc')).toBe(IMPORTE_INVALIDO);
    expect(parsearImporte('N/D')).toBe(IMPORTE_INVALIDO);
  });
});

describe('parsearCabecera', () => {
  it('resuelve AÑO pese a la eñe', () => {
    expect(CABECERA.indices.anio).toBe(0);
    expect(CABECERA.indices.ciiu).toBe(6);
  });

  it('extrae el código de cada columna de cuenta', () => {
    expect(CABECERA.cuentas).toHaveLength(60);
    expect(CABECERA.cuentas[0]).toEqual({ indice: 7, codigo: '100' });
  });

  it('ignora el campo vacío que deja el tabulador final', () => {
    const { cabecera } = parsearCabecera(cabeceraDe(...CUENTAS) + '\t');
    expect(cabecera!.cuentas).toHaveLength(60);
  });

  it('resuelve por nombre y no por posición', () => {
    const revuelta = ['CIIU', 'EXPEDIENTE', 'AÑO', 'NOMBRE', 'RUC', 'RAMA_ACTIVIDAD', 'DESCRIPCION_RAMA', ...CUENTAS].join('\t');
    const { cabecera } = parsearCabecera(revuelta);
    expect(cabecera!.indices.expediente).toBe(1);
    expect(cabecera!.indices.anio).toBe(2);
  });

  it('rechaza la cabecera si falta una columna obligatoria', () => {
    const sinExpediente = ['AÑO', 'RUC', 'NOMBRE', 'RAMA_ACTIVIDAD', 'DESCRIPCION_RAMA', 'CIIU', ...CUENTAS].join('\t');
    const { cabecera, problemas } = parsearCabecera(sinExpediente);
    expect(cabecera).toBeNull();
    expect(problemas.map((p) => p.motivo)).toContain('falta_columna:EXPEDIENTE');
  });

  it('rechaza un archivo que no viene separado por tabuladores', () => {
    const { cabecera, problemas } = parsearCabecera('AÑO;EXPEDIENTE;RUC;CUENTA_1');
    expect(cabecera).toBeNull();
    expect(problemas.some((p) => p.motivo.startsWith('pocas_columnas_cuenta'))).toBe(true);
  });

  it('avisa de una cuenta duplicada en vez de dejar que una pise a la otra', () => {
    const { problemas } = parsearCabecera(cabeceraDe(...CUENTAS, 'CUENTA_100'));
    expect(problemas.map((p) => p.motivo)).toContain('columna_cuenta_duplicada:100');
  });
});

describe('parsearFila', () => {
  /** Fila con valor sólo en las tres primeras cuentas. */
  function filaDe(ident: string[], valores: string[] = []): string {
    const celdas = [...ident, ...CUENTAS.map((_, i) => valores[i] ?? '0')];
    return celdas.join('\t');
  }

  const IDENT = [
    '2025',
    '1',
    '1790013731001',
    'ACEITES TROPICALES SOCIEDAD ANONIMA ATSA',
    'A',
    'AGRICULTURA, GANADERÍA,  SILVICULTURA Y PESCA.',
    'A0126.01',
  ];

  it('lee la cabecera de la fila', () => {
    const { fila } = parsearFila(filaDe(IDENT), CABECERA);
    expect(fila).toEqual({
      anio: 2025,
      expediente: '1',
      ruc: '1790013731001',
      nombre: 'ACEITES TROPICALES SOCIEDAD ANONIMA ATSA',
      rama_actividad: 'A',
      // `nullify` colapsa el doble espacio del archivo original.
      descripcion_rama: 'AGRICULTURA, GANADERÍA, SILVICULTURA Y PESCA.',
      ciiu: 'A0126.01',
    });
  });

  it('emite sólo las cuentas con valor', () => {
    const { cuentas } = parsearFila(filaDe(IDENT, ['1329498,87', '9638,32', '0']), CABECERA);
    expect(cuentas).toEqual([
      { codigo: '100', valor: '1329498.87' },
      { codigo: '101', valor: '9638.32' },
    ]);
  });

  it('no emite nada cuando el balance está entero a cero', () => {
    expect(parsearFila(filaDe(IDENT), CABECERA).cuentas).toEqual([]);
  });

  it('rechaza la fila entera si falta el expediente', () => {
    const { fila, rechazos } = parsearFila(filaDe(['2025', '', ...IDENT.slice(2)]), CABECERA);
    expect(fila).toBeNull();
    expect(rechazos).toEqual([{ columna: 'expediente', motivo: 'expediente_vacio' }]);
  });

  it('rechaza la fila si el año no es un año', () => {
    const { fila, rechazos } = parsearFila(filaDe(['1329498', '1', ...IDENT.slice(2)]), CABECERA);
    expect(fila).toBeNull();
    expect(rechazos[0].motivo).toBe('anio_invalido');
  });

  it('una celda ilegible NO tumba el balance entero', () => {
    const { fila, cuentas, rechazos } = parsearFila(
      filaDe(IDENT, ['1329498,87', 'basura', '55,10']),
      CABECERA,
    );
    expect(fila).not.toBeNull();
    expect(cuentas).toEqual([
      { codigo: '100', valor: '1329498.87' },
      { codigo: '102', valor: '55.10' },
    ]);
    expect(rechazos).toEqual([
      { columna: 'CUENTA_101', motivo: 'importe_no_numerico:basura' },
    ]);
  });

  it('tolera una línea con menos campos de los que anuncia la cabecera', () => {
    const { fila, cuentas } = parsearFila(IDENT.join('\t'), CABECERA);
    expect(fila!.expediente).toBe('1');
    expect(cuentas).toEqual([]);
  });
});
