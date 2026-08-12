/* eslint-disable no-console */
import * as ExcelJS from 'exceljs';
import { join } from 'node:path';

/**
 * Genera un .xlsx de prueba con la cabecera real de la Superintendencia.
 *
 * Usa el WRITER en streaming de ExcelJS: es la única forma de producir un
 * archivo de un millón de filas sin agotar la memoria, igual que el reader es
 * la única forma de leerlo.
 *
 * Uso:
 *   npm run fixture -- --filas 1000000 --salida ./storage/fixture-1m.xlsx --shared
 *
 * `--shared` activa la tabla de cadenas compartidas, que es como vienen los
 * archivos reales. Conviene probar AMBAS variantes: sin ella no se ejercita el
 * camino de `sharedStrings: 'cache'`, que es el mayor riesgo de memoria.
 */

const HEADERS = [
  'EXPEDIENTE', 'RUC', 'NOMBRE', 'SITUACIÓN LEGAL', 'FECHA_CONSTITUCION', 'TIPO',
  'PAÍS', 'REGIÓN', 'PROVINCIA', 'CANTÓN', 'CIUDAD', 'CALLE', 'NÚMERO',
  'INTERSECCIÓN', 'BARRIO', 'TELÉFONO', 'REPRESENTANTE', 'CARGO',
  'CAPITAL SUSCRITO', 'CIIU NIVEL 1', 'CIIU NIVEL 6', 'ÚLTIMO BALANCE',
  'PRESENTÓ BALANCE INICIAL', 'FECHA PRESENTACIÓN BALANCE INICIAL',
];

const PROVINCIAS = ['PICHINCHA', 'GUAYAS', 'AZUAY', 'MANABÍ', 'TUNGURAHUA', 'LOJA', 'EL ORO'];
const SITUACIONES = ['ACTIVA', 'DISOLUCIÓN LIQUIDACIÓN', 'INACTIVA', 'CANCELADA'];
const TIPOS = ['ANÓNIMA', 'RESPONSABILIDAD LIMITADA', 'SUCURSAL EXTRANJERA', 'S.A.S.'];
const CIIU1 = ['A', 'B', 'C', 'G', 'J', 'K', 'M'];

/** PRNG determinista: el fixture debe ser reproducible entre ejecuciones. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function arg(nombre: string, porDefecto: string): string {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
}

async function main() {
  const filas = parseInt(arg('filas', '1000000'), 10);
  const salida = arg('salida', join(process.cwd(), 'storage', `fixture-${filas}.xlsx`));
  const usarShared = process.argv.includes('--shared');
  const rnd = mulberry32(20260811);

  console.log(`Generando ${filas.toLocaleString('es-EC')} filas -> ${salida}`);
  console.log(`sharedStrings: ${usarShared ? 'sí (como el archivo real)' : 'no (más rápido)'}`);

  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename: salida,
    useStyles: false,
    useSharedStrings: usarShared,
  });
  const ws = wb.addWorksheet('Companias');

  // Cabecera con un NBSP y un espacio final a propósito: el mapeo debe aguantarlo.
  const cabecera = [...HEADERS];
  cabecera[3] = `SITUACIÓN${String.fromCharCode(160)}LEGAL`;
  cabecera[8] = 'PROVINCIA ';
  ws.addRow(cabecera).commit();

  const t0 = Date.now();
  for (let i = 0; i < filas; i++) {
    const r = rnd();
    // 0,3% de expedientes duplicados: obliga al DISTINCT ON del merge.
    const expediente = r < 0.003 && i > 0 ? `EXP-${String(i - 1).padStart(9, '0')}` : `EXP-${String(i).padStart(9, '0')}`;

    // Provincia 01..24 delante -> muchos RUC empiezan por cero.
    // 2 (provincia) + 8 (secuencial) + 3 (sufijo) = 13 dígitos exactos.
    const prov = String(1 + Math.floor(rnd() * 24)).padStart(2, '0');
    const rucTexto = `${prov}${String(i % 100_000_000).padStart(8, '0')}001`;
    // Uno de cada cinco se emite como NÚMERO: así se pierde el cero inicial y se
    // comprueba que el importador lo recupera.
    const ruc: string | number = rnd() < 0.2 ? Number(rucTexto) : rucTexto;

    // Fechas en tres formatos distintos + una imposible.
    let fecha: string | Date | number;
    const fr = rnd();
    if (fr < 0.02) fecha = '31/02/1998';                     // inválida a propósito
    else if (fr < 0.35) fecha = '03/04/1998';                // día primero
    else if (fr < 0.7) fecha = new Date(Date.UTC(1990 + (i % 30), i % 12, 1 + (i % 28)));
    else fecha = 30000 + (i % 15000);                         // serial de Excel

    // Capital con separadores mezclados.
    const cr = rnd();
    const capital =
      cr < 0.25 ? '1.234.567,89' :
      cr < 0.5 ? '1234567.89' :
      cr < 0.6 ? '1.234' :
      cr < 0.65 ? 'N/A' :
      cr < 0.7 ? '' :
      Math.round(rnd() * 5_000_000) / 100;

    const br = rnd();
    const presento = br < 0.35 ? 'SI' : br < 0.5 ? 'Sí' : br < 0.85 ? 'NO' : br < 0.93 ? '' : 'X';

    // Nombres con caracteres que el formato COPY tiene que escapar.
    let nombre = `COMPAÑÍA ${i} S.A.`;
    const nr = rnd();
    if (nr < 0.01) nombre = `ACME\tTAB ${i} S.A.`;
    else if (nr < 0.02) nombre = `ACME\nSALTO ${i} S.A.`;
    else if (nr < 0.03) nombre = `ACME\\BARRA ${i} S.A.`;
    else if (nr < 0.04) nombre = `ACME \\N LITERAL ${i}`;
    else if (nr < 0.045) nombre = `ACME${String.fromCharCode(0)}NULO ${i}`;

    ws.addRow([
      expediente,
      ruc,
      nombre,
      SITUACIONES[i % SITUACIONES.length],
      fecha,
      TIPOS[i % TIPOS.length],
      'ECUADOR',
      rnd() < 0.5 ? 'SIERRA' : 'COSTA',
      PROVINCIAS[i % PROVINCIAS.length],
      `CANTÓN ${i % 120}`,
      `CIUDAD ${i % 200}`,
      rnd() < 0.05 ? 'S/N' : `AV. PRINCIPAL ${i % 900}`,
      rnd() < 0.1 ? '' : `N${i % 500}`,
      `CALLE SECUNDARIA ${i % 300}`,
      `BARRIO ${i % 80}`,
      `02${String(2000000 + (i % 900000))}`,
      `REPRESENTANTE ${i}`,
      rnd() < 0.5 ? 'GERENTE GENERAL' : 'PRESIDENTE',
      capital,
      CIIU1[i % CIIU1.length],
      `${CIIU1[i % CIIU1.length]}${String(1000 + (i % 8000))}.${String(i % 100).padStart(2, '0')}`,
      rnd() < 0.03 ? 999999 : 2000 + (i % 25),   // un año imposible de vez en cuando
      presento,
      rnd() < 0.3 ? '' : '15/06/2015',
    ]).commit();

    if ((i + 1) % 100_000 === 0) {
      const s = (Date.now() - t0) / 1000;
      console.log(`  ${(i + 1).toLocaleString('es-EC')} filas  (${Math.round((i + 1) / s).toLocaleString('es-EC')} filas/s)`);
    }
  }

  await ws.commit();
  await wb.commit();
  console.log(`Listo en ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${salida}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
