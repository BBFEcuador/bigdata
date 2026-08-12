/* eslint-disable no-console */
import * as ExcelJS from 'exceljs';

/**
 * Audita las columnas de un archivo Excel sin cargarlo en memoria.
 *
 * Existe para responder a una pregunta concreta y recurrente: "¿estamos
 * migrando el 100 % de los datos de este archivo?". Lista las columnas reales
 * del origen para poder contrastarlas contra el esquema, en vez de suponerlo.
 *
 *   npx ts-node scripts/auditar-fuentes.ts "ruta\al\archivo.xlsx"
 */
async function main(): Promise<void> {
  const ruta = process.argv[2];
  if (!ruta) {
    console.error('Uso: ts-node scripts/auditar-fuentes.ts <archivo.xlsx>');
    process.exit(1);
  }

  const reader = new ExcelJS.stream.xlsx.WorkbookReader(ruta, {
    sharedStrings: 'cache',
    worksheets: 'emit',
  });

  let hojas = 0;
  for await (const hoja of reader) {
    hojas++;
    console.log(`\n=== Hoja ${hojas}: ${(hoja as any).name ?? '(sin nombre)'} ===`);
    let n = 0;
    for await (const fila of hoja) {
      n++;
      const valores = (fila.values as unknown[]).slice(1);
      if (n === 1) {
        console.log(`Columnas (${valores.length}):`);
        valores.forEach((v, i) => console.log(`  ${String(i + 1).padStart(3)}  ${texto(v)}`));
      } else {
        console.log('\nPrimera fila de datos:');
        valores.slice(0, 30).forEach((v, i) => console.log(`  ${String(i + 1).padStart(3)}  ${texto(v)}`));
        break;
      }
    }
    if (hojas >= 3) break; // con tres hojas basta para auditar
  }
}

function texto(v: unknown): string {
  if (v === null || v === undefined) return '(vacío)';
  if (typeof v === 'object' && v !== null && 'text' in (v as any)) return String((v as any).text);
  if (typeof v === 'object' && v !== null && 'result' in (v as any)) return String((v as any).result);
  return String(v).slice(0, 90);
}

void main();
