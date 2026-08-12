import { anioDeHoja, detectarTipo, parsearCatastros } from './catastros-file.parser';
import {
  CATASTRO_EXPORTADOR_BIENES_IR,
  CATASTRO_EXPORTADOR_BIENES_IVA,
  CATASTRO_EXPORTADOR_SERVICIOS_IVA,
  CATASTRO_SERVICIOS_DIGITALES,
} from './catastros.constants';
import { SourceSheet } from '../xlsx/xlsx-row-source';

/**
 * Los títulos, rótulos y filas de estos tests son literales de los cuatro
 * catastros que publica el SRI, con sus erratas incluidas.
 */

const fila = (rowNumber: number, valores: unknown[]) => ({
  rowNumber,
  cells: [undefined, ...valores],
});

const TITULO_IR =
  'CATASTRO DE EXPORTADORES HABITUALES DE BIENES\nPARA EFECTOS DE REBAJA DE TRES (3) PUNTOS ' +
  'PORCENTUALES EN LA TARIFA DE IMPUESTO A LA RENTA*\n(EJERCICIO FISCAL 2024**)';
const TITULO_BIENES_IVA =
  'CATASTRO DE EXPORTADORES HABITUALES DE BIENES\nPARA EFECTOS DE RETENCIONES DE IVA DE ' +
  'CONFORMIDAD A LO SEÑALADO EN LA RESOLUCIÓN No. NAC-DGERCGC20-00000061';
const TITULO_SERVICIOS =
  'CATASTRO DE EXPORTADORES HABITUALES DE SERVICIOS\nPARA EFECTOS DE RETENCIONES DE IVA';

/** El título viene en una celda combinada: el mismo texto en cada columna. */
const filaTitulo = (n: number, titulo: string, ancho: number) =>
  fila(n, Array(ancho).fill(titulo));

const hoja =(name: string, rows: ReturnType<typeof fila>[]): SourceSheet => ({ name, rows });

const HOJA_BIENES_IVA_2026 = hoja('LISTADO 2026', [
  fila(1, []),
  filaTitulo(2, TITULO_BIENES_IVA, 5),
  fila(3, []),
  fila(4, ['RUC', 'RAZÓN SOCIAL', 'JURISDICCIÓN', 'TIPO CONTRIBUYENTE', 'CLASE DE CONTRIBUYENTE']),
  fila(5, [
    '0100720622001',
    'BERNAL CAMPOVERDE HUGO RODRIGO',
    'AZUAY',
    'PERSONAS NATURALES',
    'OTROS',
  ]),
]);

describe('detectarTipo', () => {
  it('distingue la rebaja de renta del catastro de IVA aunque ambos digan "DE BIENES"', () => {
    const ir = hoja('2024', [filaTitulo(2, TITULO_IR, 4), fila(4, ['RUC', 'RAZÓN SOCIAL'])]);
    expect(detectarTipo([ir])).toBe(CATASTRO_EXPORTADOR_BIENES_IR);
    expect(detectarTipo([HOJA_BIENES_IVA_2026])).toBe(CATASTRO_EXPORTADOR_BIENES_IVA);
  });

  it('reconoce el catastro de servicios', () => {
    const s = hoja('Exp Serv 2026', [filaTitulo(2, TITULO_SERVICIOS, 8)]);
    expect(detectarTipo([s])).toBe(CATASTRO_EXPORTADOR_SERVICIOS_IVA);
  });

  it('reconoce el de servicios digitales por su cabecera, que no lleva título', () => {
    const d = hoja('SERVICIOS DIGITALES', [
      fila(1, ['PROVEEDOR', 'DESCRIPCIÓN', 'REFERENCIA']),
      fila(2, ['NETFLIX', 'Contenidos audiovisuales por streaming', '1']),
    ]);
    expect(detectarTipo([d])).toBe(CATASTRO_SERVICIOS_DIGITALES);
  });

  it('no adivina cuando no reconoce nada', () => {
    expect(detectarTipo([hoja('Hoja1', [fila(1, ['A', 'B'])])])).toBeNull();
  });
});

describe('anioDeHoja', () => {
  it('saca el año del nombre de la hoja en sus tres formatos', () => {
    expect(anioDeHoja('LISTADO 2026')).toBe(2026);
    expect(anioDeHoja('Exp Serv 2025')).toBe(2025);
    expect(anioDeHoja('2021')).toBe(2021);
    expect(anioDeHoja('LISTADO 2021 ')).toBe(2021);
    expect(anioDeHoja('Resumen')).toBeNull();
  });
});

describe('parsearCatastros — exportadores', () => {
  it('carga una hoja y le pone el año de su nombre', () => {
    const res = parsearCatastros([HOJA_BIENES_IVA_2026]);
    expect(res.tipo).toBe(CATASTRO_EXPORTADOR_BIENES_IVA);
    expect(res.anios).toEqual([2026]);
    expect(res.exportadores).toHaveLength(1);
    expect(res.exportadores[0]).toMatchObject({
      anio: 2026,
      ruc: '0100720622001',
      razonSocial: 'BERNAL CAMPOVERDE HUGO RODRIGO',
      jurisdiccion: 'AZUAY',
      tipoContribuyente: 'PERSONAS NATURALES',
      claseContribuyente: 'OTROS',
    });
  });

  it('carga las hojas de todos los ejercicios, no sólo la primera', () => {
    const h2025 = hoja('LISTADO 2025', [
      filaTitulo(2, TITULO_BIENES_IVA, 5),
      fila(4, ['RUC', 'RAZÓN SOCIAL', 'JURISDICCIÓN', 'TIPO CONTRIBUYENTE', 'CLASE']),
      fila(5, ['0100720622001', 'BERNAL CAMPOVERDE HUGO RODRIGO', 'AZUAY', 'PERSONAS NATURALES', 'OTROS']),
    ]);
    const res = parsearCatastros([HOJA_BIENES_IVA_2026, h2025]);
    expect(res.anios).toEqual([2025, 2026]);
    expect(res.exportadores).toHaveLength(2);
  });

  it('recupera el cero inicial de los RUC que el .xls guardó como número', () => {
    // 751 filas de la hoja "Exp Serv 2024" llegan así.
    const h = hoja('Exp Serv 2024', [
      filaTitulo(2, TITULO_SERVICIOS, 8),
      fila(4, [
        'Año fiscal analizado',
        'Año de aplicación fiscal',
        'RUC',
        'RAZÓN SOCIAL',
        'JURISDICCIÓN',
        'PROVINCIA',
        'TIPO CONTRIBUYENTE',
        'OBLIGADO A LLEVAR CONTABILIDAD',
      ]),
      fila(5, ['2023', '2024', 101384501001, 'VEGA VILLA MANUEL GUILLERMO', 'ZONA 6', 'AZUAY', 'OTROS', 'N']),
    ]);
    const res = parsearCatastros([h]);
    expect(res.exportadores[0].ruc).toBe('0101384501001');
    expect(res.exportadores[0].obligadoContabilidad).toBe(false);
    expect(res.exportadores[0].anioFiscalAnalizado).toBe(2023);
  });

  it('el año de la columna manda sobre el nombre de la hoja', () => {
    // La hoja "Exp Serv 2024" trae siete filas cuyo año de aplicación es otro.
    const h = hoja('Exp Serv 2024', [
      filaTitulo(2, TITULO_SERVICIOS, 3),
      fila(4, ['Año fiscal analizado', 'Año de aplicación fiscal', 'RUC']),
      fila(5, ['2023', '2024', '0101384501001']),
      fila(6, ['2024', '2025', '0101398949001']),
    ]);
    const res = parsearCatastros([h]);
    expect(res.exportadores.map((x) => x.anio)).toEqual([2024, 2025]);
    expect(res.anios).toEqual([2024, 2025]);
  });

  it('acepta los rótulos viejos del catastro de servicios de 2023', () => {
    const h = hoja('Exp Serv 2023', [
      filaTitulo(2, 'CATASTROS DE HABITUALIDAD EN LA EXPORTACIÓN DE SERVICIOS', 7),
      fila(4, [
        'Año fiscal analizado',
        'Año de aplicación fiscal',
        'Numero Identificacion',
        'Razon Social',
        'Descripcion Zonal',
        'Descripcion Provincia EO',
        'Mar obligado contabilidad',
      ]),
      fila(5, ['2022', '2023', '0400984779001', 'ORTIZ QUIROZ GUIDO NEISER', 'ZONA 1', 'CARCHI', 'N']),
    ]);
    const res = parsearCatastros([h]);
    expect(res.tipo).toBe(CATASTRO_EXPORTADOR_SERVICIOS_IVA);
    expect(res.exportadores[0]).toMatchObject({
      ruc: '0400984779001',
      jurisdiccion: 'ZONA 1',
      provincia: 'CARCHI',
      obligadoContabilidad: false,
    });
  });

  it('descarta el pie de página sin contarlo como rechazo', () => {
    const h = hoja('LISTADO 2026', [
      ...HOJA_BIENES_IVA_2026.rows,
      fila(6, ['** Listado sujeto a actualización periódica']),
      fila(7, ['Listado referencial']),
    ]);
    const res = parsearCatastros([h]);
    expect(res.exportadores).toHaveLength(1);
    expect(res.rechazos).toHaveLength(0);
    expect(res.notas.length).toBe(2);
  });

  it('deduplica (año, RUC) repetidos: la hoja de 2024 trae 354 filas repetidas', () => {
    const h = hoja('LISTADO 2024', [
      filaTitulo(2, TITULO_BIENES_IVA, 3),
      fila(4, ['RUC', 'RAZÓN SOCIAL', 'JURISDICCIÓN']),
      fila(5, ['1791151348001', 'ROSAS DE PERUGACHI ROSASPE S.A', 'IMBABURA']),
      fila(6, ['1791151348001', 'ROSAS DE PERUGACHI ROSASPE S.A', 'IMBABURA']),
    ]);
    const res = parsearCatastros([h]);
    expect(res.exportadores).toHaveLength(1);
    expect(res.duplicados).toBe(1);
  });

  it('ignora la hoja sin columna de RUC en vez de tumbar el archivo', () => {
    const notas = hoja('Notas', [fila(1, ['Metodología']), fila(2, ['Bla bla'])]);
    const res = parsearCatastros([HOJA_BIENES_IVA_2026, notas]);
    expect(res.exportadores).toHaveLength(1);
    expect(res.avisos.some((a) => /hoja_sin_columna_ruc/.test(a.motivo))).toBe(true);
  });
});

describe('parsearCatastros — servicios digitales', () => {
  const HOJA_DIGITAL = hoja('SERVICIOS DIGITALES', [
    fila(1, [
      'PROVEEDOR',
      'DESCRIPCIÓN',
      'REFERENCIA',
      'MARCA SERVICIOS COMISIÓN',
      'DOMICILIADO O EP',
      'REGISTRADO SRI',
      'FECHA DE REGISTRO',
      'FECHA FIN DE REGISTRO',
    ]),
    fila(2, ['NETFLIX', 'Contenidos audiovisuales por streaming', '1']),
    fila(3, ['Netflix', 'Contenidos audiovisuales por streaming', '1']),
    fila(4, [
      'UBER',
      'Transporte',
      '8',
      'INGRESOS POR COMISIÓN',
      'SI',
      'SI',
      new Date(Date.UTC(2021, 1, 1)),
      '',
    ]),
    fila(5, ['FECHA DE PUBLICACIÓN:', '2026-07-15']),
  ]);

  it('conserva las variantes de grafía: cada una es un patrón de conciliación', () => {
    const res = parsearCatastros([HOJA_DIGITAL]);
    expect(res.tipo).toBe(CATASTRO_SERVICIOS_DIGITALES);
    expect(res.digitales.map((d) => d.proveedor)).toEqual(['NETFLIX', 'Netflix', 'UBER']);
  });

  it('lee las banderas y la fecha, y aparta el pie de página', () => {
    const res = parsearCatastros([HOJA_DIGITAL]);
    const uber = res.digitales.find((d) => d.proveedor === 'UBER');
    expect(uber).toMatchObject({
      referencia: '8',
      domiciliadoOEp: true,
      registradoSri: true,
      fechaRegistro: '2021-02-01',
      fechaFinRegistro: null,
    });
    expect(res.notas.some((n) => /FECHA DE PUBLICACIÓN/.test(n))).toBe(true);
  });
});
