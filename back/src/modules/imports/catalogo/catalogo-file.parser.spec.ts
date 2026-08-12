import { parsearCatalogo } from './catalogo-file.parser';

describe('parsearCatalogo', () => {
  it('separa código y nombre por el primer TAB', () => {
    const { cuentas } = parsearCatalogo('1\tACTIVO\n101\tACTIVO CORRIENTE');
    expect(cuentas).toEqual([
      { codigo: '1', nombre: 'ACTIVO', linea: 1 },
      { codigo: '101', nombre: 'ACTIVO CORRIENTE', linea: 2 },
    ]);
  });

  it('conserva el nombre completo aunque tenga espacios', () => {
    const { cuentas } = parsearCatalogo('10101\tEFECTIVO Y EQUIVALENTES DE EFECTIVO');
    expect(cuentas[0].nombre).toBe('EFECTIVO Y EQUIVALENTES DE EFECTIVO');
  });

  it('acepta separación por espacios como respaldo', () => {
    const { cuentas, rechazos } = parsearCatalogo('1010101   CAJA CHICA');
    expect(rechazos).toHaveLength(0);
    expect(cuentas[0]).toMatchObject({ codigo: '1010101', nombre: 'CAJA CHICA' });
  });

  it('ignora las líneas en blanco, incluida la final', () => {
    const { cuentas, rechazos } = parsearCatalogo('1\tACTIVO\n\n   \n2\tPASIVO\n');
    expect(cuentas).toHaveLength(2);
    expect(rechazos).toHaveLength(0);
  });

  it('colapsa los espacios dobles del nombre', () => {
    const { cuentas } = parsearCatalogo('1\tVALORES DE  TITULARIZACIÓN');
    expect(cuentas[0].nombre).toBe('VALORES DE TITULARIZACIÓN');
  });

  it('conserva las tildes del nombre', () => {
    const { cuentas } = parsearCatalogo('1010102\tINSTITUCIONES FINANCIERAS PÚBLICAS');
    expect(cuentas[0].nombre).toBe('INSTITUCIONES FINANCIERAS PÚBLICAS');
  });

  it('elimina el byte nulo, que Postgres no puede almacenar', () => {
    const { cuentas } = parsearCatalogo(`1\tACTIVO${String.fromCharCode(0)}X`);
    expect(cuentas[0].nombre).not.toContain(String.fromCharCode(0));
  });

  it('rechaza un código no numérico indicando la línea', () => {
    const { cuentas, rechazos } = parsearCatalogo('1\tACTIVO\nABC\tRARO');
    expect(cuentas).toHaveLength(1);
    expect(rechazos[0]).toMatchObject({ linea: 2 });
    expect(rechazos[0].motivo).toMatch(/codigo_no_numerico/);
  });

  it('rechaza una línea sin nombre', () => {
    const { cuentas, rechazos } = parsearCatalogo('1\t   ');
    expect(cuentas).toHaveLength(0);
    expect(rechazos[0].motivo).toBe('nombre_vacio');
  });

  it('rechaza una línea sin separador reconocible', () => {
    const { rechazos } = parsearCatalogo('SOLOTEXTO');
    expect(rechazos[0].motivo).toMatch(/formato_no_reconocido/);
  });

  it('ante un código duplicado gana la última aparición y lo cuenta', () => {
    // Igual que el DISTINCT ON del importador de compañías: sin esto, un código
    // repetido rompería el ON CONFLICT del upsert.
    const { cuentas, duplicados } = parsearCatalogo('1\tPRIMERO\n2\tOTRO\n1\tSEGUNDO');
    expect(duplicados).toBe(1);
    expect(cuentas).toHaveLength(2);
    expect(cuentas.find((c) => c.codigo === '1')?.nombre).toBe('SEGUNDO');
  });

  it('admite finales de línea de Windows', () => {
    const { cuentas } = parsearCatalogo('1\tACTIVO\r\n2\tPASIVO\r\n');
    expect(cuentas).toHaveLength(2);
    expect(cuentas[1].nombre).toBe('PASIVO');
  });
});
