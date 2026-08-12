import * as ExcelJS from 'exceljs';

export interface SourceRow {
  rowNumber: number;
  /** Valores de la fila con índice 1-based, tal como los entrega ExcelJS. */
  cells: unknown[];
}

/**
 * Lee un .xlsx fila a fila sin materializar el libro.
 *
 * `WorkbookReader` es un parser SAX sobre las entradas del ZIP: descomprime
 * `sheet1.xml` de forma incremental y va emitiendo filas. La memoria se mantiene
 * prácticamente constante respecto al número de filas, que es la única forma de
 * procesar un archivo de un millón de registros.
 *
 * Las dos opciones marcadas abajo no son cosméticas:
 *
 * - `sharedStrings: 'cache'`: XLSX guarda casi todas las cadenas en una tabla
 *   compartida. Con un millón de razones sociales y direcciones distintas esa
 *   tabla ronda los cientos de MB y, por defecto, ExcelJS la mantiene en
 *   memoria. Con 'cache' la vuelca a disco en el directorio temporal. Es la
 *   causa más probable de un OOM después de la contrapresión.
 *
 * - `styles: 'cache'`: en XLSX, que una celda numérica sea una fecha está
 *   codificado en el ESTILO. Con 'ignore' se reciben seriales crudos en lugar de
 *   fechas. Los estilos son pocos KB, así que cachearlos no cuesta nada.
 */
export async function* readRows(filePath: string): AsyncGenerator<SourceRow> {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, OPCIONES);

  let hojaProcesada = false;

  for await (const worksheet of reader as any) {
    // Sólo la primera hoja con datos; las demás (glosarios, notas) se ignoran.
    if (hojaProcesada) continue;
    hojaProcesada = true;

    for await (const row of worksheet) {
      // `row.values` es 1-based: la posición 0 siempre viene vacía.
      yield { rowNumber: row.number as number, cells: row.values as unknown[] };
    }
  }
}

const OPCIONES = {
  worksheets: 'emit',
  sharedStrings: 'cache',
  styles: 'cache',
  hyperlinks: 'ignore',
  entries: 'emit',
} as const;

export interface SourceSheet {
  name: string;
  rows: SourceRow[];
}

/**
 * Lee TODAS las hojas, cada una con sus filas.
 *
 * Los catastros del SRI reparten un año fiscal por hoja ("LISTADO 2024",
 * "Exp Serv 2026"), así que quedarse con la primera —lo que hace `readRows`—
 * perdería en silencio todos los ejercicios anteriores.
 *
 * A diferencia de `readRows`, aquí las filas SÍ se materializan: son ficheros de
 * unos pocos miles de filas por hoja y hay que agruparlas por hoja de todas
 * formas. No se debe usar esto con el Excel de compañías.
 */
export async function readSheets(filePath: string): Promise<SourceSheet[]> {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, OPCIONES);
  const hojas: SourceSheet[] = [];

  for await (const worksheet of reader as any) {
    const rows: SourceRow[] = [];
    for await (const row of worksheet) {
      rows.push({ rowNumber: row.number as number, cells: row.values as unknown[] });
    }
    // El nombre es el año en estos archivos; sin él no se puede saber a qué
    // ejercicio pertenece la hoja.
    hojas.push({ name: String(worksheet.name ?? `Hoja${hojas.length + 1}`), rows });
  }

  return hojas;
}
