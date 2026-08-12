import {
  cellToRaw,
  coerceBoolean,
  coerceDate,
  coerceNumeric,
  coerceRuc,
  coerceText,
  coerceYear,
} from './coercions';

describe('cellToRaw', () => {
  it('desenvuelve texto enriquecido en vez de dejar [object Object]', () => {
    expect(cellToRaw({ richText: [{ text: 'ACME ' }, { text: 'S.A.' }] })).toBe('ACME S.A.');
  });

  it('desenvuelve el resultado de una fórmula', () => {
    expect(cellToRaw({ formula: 'A1&B1', result: 'CALCULADO' })).toBe('CALCULADO');
  });

  it('desenvuelve un hipervínculo', () => {
    expect(cellToRaw({ text: 'ver ficha', hyperlink: 'http://x' })).toBe('ver ficha');
  });

  it('convierte una celda de error en null', () => {
    expect(cellToRaw({ error: '#N/A' })).toBeNull();
  });
});

describe('coerceText', () => {
  it('normaliza los marcadores de vacío a null', () => {
    for (const v of ['', '  ', '-', 'N/A', 'SIN DATO', 'S/N']) {
      expect(coerceText(v).value).toBeNull();
    }
  });

  it('conserva tildes y mayúsculas originales', () => {
    expect(coerceText('  Compañía   Andina  ').value).toBe('Compañía Andina');
  });

  it('convierte el byte nulo en espacio en vez de arrastrarlo a Postgres', () => {
    const r = coerceText(`ACME${String.fromCharCode(0)}S.A.`);
    expect(r.value).toBe('ACME S.A.');
    expect(r.value).not.toContain(String.fromCharCode(0));
  });
});

describe('coerceRuc', () => {
  it('recupera el cero inicial cuando Excel lo entregó como número', () => {
    expect(coerceRuc(190123456001).value).toBe('0190123456001');
  });

  it('conserva el cero inicial cuando ya viene como texto', () => {
    expect(coerceRuc('0190123456001').value).toBe('0190123456001');
  });

  it('quita guiones y espacios', () => {
    expect(coerceRuc(' 0190123456-001 ').value).toBe('0190123456001');
  });

  it('avisa si el código de provincia no existe, pero conserva el valor', () => {
    const r = coerceRuc('9990123456001');
    expect(r.value).toBe('9990123456001');
    expect(r.error).toMatch(/provincia/);
  });
});

describe('coerceDate', () => {
  it('interpreta DD/MM/YYYY con el día primero', () => {
    // 3 de abril, NO 4 de marzo. Es la convención ecuatoriana.
    expect(coerceDate('03/04/1998').value).toBe('1998-04-03');
  });

  it('acepta el formato ISO sin ambigüedad', () => {
    expect(coerceDate('1998-04-03').value).toBe('1998-04-03');
  });

  it('acepta meses abreviados en español', () => {
    expect(coerceDate('03-ABR-1998').value).toBe('1998-04-03');
  });

  it('rechaza una fecha que no existe en vez de rodarla al mes siguiente', () => {
    const r = coerceDate('31/02/1998');
    expect(r.value).toBeNull();
    expect(r.error).toMatch(/fecha_invalida/);
  });

  it('lee un Date en UTC y no desplaza el día por la zona horaria', () => {
    expect(coerceDate(new Date(Date.UTC(1998, 3, 3))).value).toBe('1998-04-03');
  });

  it('convierte un serial de Excel', () => {
    // 25569 es 1970-01-01 con la época 1899-12-30.
    expect(coerceDate(25569).value).toBe('1970-01-01');
  });

  it('descarta el 29-feb-1900 inexistente (serial 60)', () => {
    expect(coerceDate(60).value).toBeNull();
  });
});

describe('coerceNumeric', () => {
  it('interpreta el formato con punto de miles y coma decimal', () => {
    expect(coerceNumeric('1.234.567,89').value).toBe('1234567.89');
  });

  it('interpreta el formato con coma de miles y punto decimal', () => {
    expect(coerceNumeric('1,234,567.89').value).toBe('1234567.89');
  });

  it('interpreta el punto decimal simple', () => {
    expect(coerceNumeric('1234567.89').value).toBe('1234567.89');
  });

  it('trata "1.234" como miles, que es lo habitual en importes', () => {
    expect(coerceNumeric('1.234').value).toBe('1234.00');
  });

  it('trata "1234,5" como decimal', () => {
    expect(coerceNumeric('1234,5').value).toBe('1234.50');
  });

  it('ignora el símbolo de moneda', () => {
    expect(coerceNumeric('$ 1.000,00').value).toBe('1000.00');
  });

  it('devuelve null ante un vacío', () => {
    expect(coerceNumeric('N/A').value).toBeNull();
  });
});

describe('coerceBoolean', () => {
  it('acepta las variantes afirmativas, con y sin tilde', () => {
    for (const v of ['SI', 'Sí', 's', '1', 'X', 'TRUE']) {
      expect(coerceBoolean(v).value).toBe('t');
    }
  });

  it('acepta las variantes negativas', () => {
    for (const v of ['NO', 'n', '0', 'FALSE']) {
      expect(coerceBoolean(v).value).toBe('f');
    }
  });

  it('deja NULL lo desconocido en vez de asumir false', () => {
    // "no sabemos" y "no" son hechos distintos: colapsarlos falsea los conteos.
    expect(coerceBoolean('').value).toBeNull();
    expect(coerceBoolean('QUIZÁ').value).toBeNull();
  });
});

describe('coerceYear', () => {
  it('extrae el año de un texto', () => {
    expect(coerceYear('2023').value).toBe('2023');
  });

  it('extrae el año de una fecha completa', () => {
    expect(coerceYear('31/12/2023').value).toBe('2023');
  });

  it('descarta un importe colado en la columna del año', () => {
    // Sin este filtro, un valor así desbordaría el smallint y abortaría el COPY.
    const r = coerceYear(999999);
    expect(r.value).toBeNull();
    expect(r.error).toBeDefined();
  });
});
