import {
  codigoDesdeNumeroRegistro,
  normalizarCategoria,
  normalizarCodigoEstablecimiento,
  normalizarCorreo,
  normalizarTipoParroquia,
  parsearTurismo,
} from './turismo-file.parser';
import { SourceRow } from '../xlsx/xlsx-row-source';

/**
 * Las filas de estos tests son literales del Catastro Nacional de Turismo de
 * julio de 2026, incluidas las que rompen las suposiciones fáciles.
 */

const CABECERA = [
  'RUC',
  'Código de Establecimiento RUC',
  'Nombre Comercial',
  'Número de Registro',
  'Fecha de Registro',
  'Actividad / Modalidad',
  'Clasificación',
  'Categoría',
  'Razón social (Propietario)',
  'Representante Legal',
  'Provincia',
  'Cantón',
  'Parroquia',
  'Tipo de Parroquia',
  'Dirección',
  'Referencia de Dirección',
  'Teléfono Principal',
  'Correo Electrónico',
  'Dirección Web',
  'Estado Registro del Establecimiento',
];

/** ExcelJS entrega `row.values` con la posición 0 vacía. */
const fila = (rowNumber: number, valores: unknown[]): SourceRow => ({
  rowNumber,
  cells: [undefined, ...valores],
});

const FILA_QUINTA_ELOISA: unknown[] = [
  '0100024025001',
  '1',
  'QUINTA ELOISA',
  '0100024025001.001.1013877',
  new Date(Date.UTC(2025, 2, 10)),
  'ORGANIZADORES DE EVENTOS, CONGRESOS Y CONVENCIONES',
  'SALA DE RECEPCIONES Y BANQUETES',
  'Categoría Dos',
  'BERMEO SAMANIEGO OLGA RAQUEL',
  '',
  'AZUAY',
  'CUENCA',
  'YANUNCAY',
  'urbana',
  'JOSE RAFAEL PEÑAHERRERA, FERNANDO DE ARAGON, S/N',
  'A TRES CUADRAS DEL COLEGIO TECNICO SALESIANO',
  '0995542992',
  'drraquel@live.com',
  '',
  'RATIFICADO',
];

const base = (extra: SourceRow[] = []): SourceRow[] => [fila(1, CABECERA), ...extra];

describe('normalización de celdas del catastro de turismo', () => {
  it('quita los ceros a la izquierda del código de establecimiento', () => {
    // El padrón del SRI guarda "1", no "001": sin esto el join fallaría en las
    // 18.146 filas que vienen con tres dígitos.
    expect(normalizarCodigoEstablecimiento('001')).toBe('1');
    expect(normalizarCodigoEstablecimiento('1')).toBe('1');
    expect(normalizarCodigoEstablecimiento('012')).toBe('12');
    expect(normalizarCodigoEstablecimiento('')).toBeNull();
    expect(normalizarCodigoEstablecimiento(null)).toBeNull();
  });

  it('saca el código del número de registro sólo si tiene las tres partes', () => {
    expect(codigoDesdeNumeroRegistro('0100024025001.001.1013877')).toBe('1');
    // Fila 19819 del archivo real: número de registro sin puntos.
    expect(codigoDesdeNumeroRegistro('2003501437')).toBeNull();
  });

  it('unifica las seis grafías de "Categoría Única"', () => {
    const variantes = [
      'Categoría Única',
      'Categoría única',
      'Categoria Unica',
      'CAtegoría Única',
      'Categoría ünica',
    ];
    const normalizadas = new Set(variantes.map(normalizarCategoria));
    expect([...normalizadas]).toEqual(['CATEGORIA UNICA']);
  });

  it('normaliza el tipo de parroquia y descarta lo que no reconoce', () => {
    expect(normalizarTipoParroquia('URBANA')).toBe('urbana');
    expect(normalizarTipoParroquia('Rural')).toBe('rural');
    expect(normalizarTipoParroquia('rural')).toBe('rural');
    expect(normalizarTipoParroquia('otra cosa')).toBeNull();
  });

  it('sólo acepta como correo lo que lo parece', () => {
    expect(normalizarCorreo('Info@HotelCordero.com')).toBe('info@hotelcordero.com');
    expect(normalizarCorreo('0995542992')).toBeNull();
    expect(normalizarCorreo('no tiene')).toBeNull();
  });
});

describe('parsearTurismo', () => {
  it('lee una fila completa', () => {
    const { registros, rechazos } = parsearTurismo(base([fila(2, FILA_QUINTA_ELOISA)]));
    expect(rechazos).toHaveLength(0);
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({
      numeroRegistro: '0100024025001.001.1013877',
      ruc: '0100024025001',
      codigoEstablecimiento: '1',
      nombreComercial: 'QUINTA ELOISA',
      fechaRegistro: '2025-03-10',
      actividad: 'ORGANIZADORES DE EVENTOS, CONGRESOS Y CONVENCIONES',
      categoriaNorm: 'CATEGORIA DOS',
      tipoParroquia: 'urbana',
      correo: 'drraquel@live.com',
      estadoRegistro: 'RATIFICADO',
    });
    // El representante legal viene vacío en esta fila y no debe inventarse.
    expect(registros[0].representanteLegal).toBeNull();
  });

  it('resuelve la cabecera por nombre, no por posición', () => {
    const invertida = [...CABECERA].reverse();
    const valores = [...FILA_QUINTA_ELOISA].reverse();
    const { registros } = parsearTurismo([fila(1, invertida), fila(2, valores)]);
    expect(registros[0].ruc).toBe('0100024025001');
    expect(registros[0].nombreComercial).toBe('QUINTA ELOISA');
  });

  it('aborta si el archivo no es el catastro', () => {
    expect(() => parsearTurismo([fila(1, ['CODIGO', 'NOMBRE']), fila(2, ['A', 'B'])])).toThrow(
      /Catastro Nacional de Turismo/,
    );
  });

  it('conserva la fila cuando la fecha trae dos fechas en la misma celda', () => {
    // Fila 23134 del archivo real. Perder la fecha no justifica perder el local.
    const f = [...FILA_QUINTA_ELOISA];
    f[4] = '6/07/2026; 28/07/2026';
    const { registros, avisos, rechazos } = parsearTurismo(base([fila(2, f)]));
    expect(rechazos).toHaveLength(0);
    expect(registros).toHaveLength(1);
    expect(registros[0].fechaRegistro).toBeNull();
    expect(registros[0].fechaRegistroRaw).toBe('6/07/2026; 28/07/2026');
    expect(avisos[0].columna).toBe('fecha_registro');
  });

  it('recupera el cero inicial de un RUC que vino como número', () => {
    const f = [...FILA_QUINTA_ELOISA];
    f[0] = 100024025001; // Excel guardó la columna como numérica
    const { registros } = parsearTurismo(base([fila(2, f)]));
    expect(registros[0].ruc).toBe('0100024025001');
  });

  it('rechaza la fila sin RUC pero no la fila sin representante', () => {
    const sinRuc = [...FILA_QUINTA_ELOISA];
    sinRuc[0] = '';
    const { registros, rechazos } = parsearTurismo(base([fila(2, sinRuc)]));
    expect(registros).toHaveLength(0);
    expect(rechazos[0].columna).toBe('ruc');
  });

  it('ignora las filas totalmente vacías del final de la hoja', () => {
    const { registros, rechazos } = parsearTurismo(
      base([fila(2, FILA_QUINTA_ELOISA), fila(3, ['', '', '']), fila(4, [])]),
    );
    expect(registros).toHaveLength(1);
    expect(rechazos).toHaveLength(0);
  });

  it('con dos filas del mismo registro gana la última y avisa si difieren', () => {
    // Caso real: 1716472772001.002.9022452 aparece dos veces con nombre
    // comercial distinto. Sin deduplicar, el ON CONFLICT del upsert reventaría.
    const a = [...FILA_QUINTA_ELOISA];
    const b = [...FILA_QUINTA_ELOISA];
    b[2] = 'LAS SUPER MENESTRAS';
    const { registros, avisos, duplicados } = parsearTurismo(base([fila(2, a), fila(3, b)]));
    expect(registros).toHaveLength(1);
    expect(registros[0].nombreComercial).toBe('LAS SUPER MENESTRAS');
    expect(duplicados).toBe(1);
    expect(avisos.some((x) => /duplicado_con_datos_distintos/.test(x.motivo))).toBe(true);
  });

  it('no avisa cuando las dos filas duplicadas son idénticas', () => {
    const { registros, avisos, duplicados } = parsearTurismo(
      base([fila(2, FILA_QUINTA_ELOISA), fila(3, [...FILA_QUINTA_ELOISA])]),
    );
    expect(registros).toHaveLength(1);
    expect(duplicados).toBe(1);
    expect(avisos).toHaveLength(0);
  });

  it('cambia el hash sólo cuando cambia algún dato', () => {
    const uno = parsearTurismo(base([fila(2, FILA_QUINTA_ELOISA)])).registros[0];
    const otro = parsearTurismo(base([fila(9, [...FILA_QUINTA_ELOISA])])).registros[0];
    expect(otro.rowHash).toBe(uno.rowHash);

    const cambiada = [...FILA_QUINTA_ELOISA];
    cambiada[16] = '0999999999';
    const tercero = parsearTurismo(base([fila(2, cambiada)])).registros[0];
    expect(tercero.rowHash).not.toBe(uno.rowHash);
  });
});
