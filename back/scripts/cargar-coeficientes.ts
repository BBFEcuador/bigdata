import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import { AppDataSource } from '../src/data-source';

const HOJAS = [
  { hoja: 'Ingresos', base: 'ingresos' },
  { hoja: 'Costos y Gastos', base: 'costos_gastos' },
  { hoja: 'Activos', base: 'activos' },
] as const;

/** Fila 4 son las cabeceras; los datos empiezan en la 5. */
const FILA_CABECERA = 4;
const COL_CODIGO = 2;
const COL_PRIMER_ANIO = 4;

const texto = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    const o = v as { richText?: { text: string }[]; result?: unknown; text?: string };
    if (o.richText) return o.richText.map((t) => t.text).join('');
    if (o.result !== undefined) return String(o.result);
    if (o.text !== undefined) return String(o.text);
  }
  return String(v);
};

function coeficiente(v: ExcelJS.CellValue): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(texto(v).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function main() {
  const archivo = process.argv[2];
  if (!archivo) {
    console.error('Falta la ruta del Excel.\n  npm run coeficientes -- "<archivo.xlsx>"');
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(archivo);

  // ---------------------------------------------------------- por actividad
  const especificos: { anio: number; grupo: string; base: string; coef: number }[] = [];
  const anios = new Set<number>();
  let vacias = 0;

  for (const { hoja, base } of HOJAS) {
    const ws = wb.getWorksheet(hoja);
    if (!ws) throw new Error(`El archivo no trae la hoja "${hoja}".`);

    const cabecera = ws.getRow(FILA_CABECERA);
    const columnas: { col: number; anio: number }[] = [];
    for (let c = COL_PRIMER_ANIO; c <= ws.columnCount; c++) {
      const anio = Number(texto(cabecera.getCell(c).value));
      // Las dos últimas columnas son variaciones calculadas, no ejercicios.
      if (Number.isInteger(anio) && anio >= 2000 && anio <= 2100) columnas.push({ col: c, anio });
    }
    if (columnas.length === 0) throw new Error(`No encontré columnas de año en "${hoja}".`);

    for (let f = FILA_CABECERA + 1; f <= ws.rowCount; f++) {
      const fila = ws.getRow(f);
      const grupo = texto(fila.getCell(COL_CODIGO).value).trim().toUpperCase();
      if (!/^[A-Z]\d{3}$/.test(grupo)) continue;

      for (const { col, anio } of columnas) {
        anios.add(anio);
        const coef = coeficiente(fila.getCell(col).value);
        if (coef === null) vacias++;
        else especificos.push({ anio, grupo, base, coef });
      }
    }
  }

  // ------------------------------------------------------------- generales
  const generales: { anio: number; concepto: string; base: string; coef: number }[] = [];
  const wsGen = wb.getWorksheet('Coef. generales');
  if (wsGen) {
    const cabecera = wsGen.getRow(3);
    const columnas: { col: number; anio: number }[] = [];
    for (let c = 3; c <= wsGen.columnCount; c++) {
      const anio = Number(texto(cabecera.getCell(c).value));
      if (Number.isInteger(anio) && anio >= 2000 && anio <= 2100) columnas.push({ col: c, anio });
    }

    for (let f = 4; f <= wsGen.rowCount; f++) {
      const fila = wsGen.getRow(f);
      const concepto = /mineral/i.test(texto(fila.getCell(1).value)) ? 'minerales' : 'general';
      const etiqueta = texto(fila.getCell(2).value).toLowerCase();
      if (!etiqueta) continue;
      const base = etiqueta.includes('ingreso')
        ? 'ingresos'
        : etiqueta.includes('costo')
          ? 'costos_gastos'
          : etiqueta.includes('activo')
            ? 'activos'
            : null;
      if (!base) continue;

      for (const { col, anio } of columnas) {
        const coef = coeficiente(fila.getCell(col).value);
        if (coef !== null) generales.push({ anio, concepto, base, coef });
      }
    }
  }

  const listaAnios = [...anios].sort();
  console.log(
    `Leído: ${especificos.length} coeficientes específicos y ${generales.length} generales, ` +
      `ejercicios ${listaAnios.join(', ')}. ${vacias} celdas en blanco (van al general del art. 3).`,
  );

  await AppDataSource.initialize();
  const qr = AppDataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    await qr.query(`DELETE FROM coeficiente_presuntivo WHERE anio = ANY($1)`, [listaAnios]);
    await qr.query(`DELETE FROM coeficiente_general WHERE anio = ANY($1)`, [listaAnios]);

    for (const e of especificos) {
      await qr.query(
        `INSERT INTO coeficiente_presuntivo (anio, grupo_ciiu, base, coeficiente)
         VALUES ($1, $2, $3::base_presuntiva, $4)`,
        [e.anio, e.grupo, e.base, e.coef],
      );
    }
    for (const g of generales) {
      await qr.query(
        `INSERT INTO coeficiente_general (anio, concepto, base, coeficiente)
         VALUES ($1, $2, $3::base_presuntiva, $4)`,
        [g.anio, g.concepto, g.base, g.coef],
      );
    }

    const [{ huerfanos }] = await qr.query(
      `SELECT count(*)::int AS huerfanos
         FROM (SELECT DISTINCT anio FROM coeficiente_presuntivo WHERE anio = ANY($1)) a
        WHERE NOT EXISTS (
          SELECT 1 FROM coeficiente_general g
           WHERE g.anio = a.anio AND g.concepto = 'general' AND g.base = 'ingresos')`,
      [listaAnios],
    );
    if (Number(huerfanos) > 0) {
      throw new Error(`${huerfanos} ejercicio(s) sin coeficiente general del art. 3.`);
    }

    await qr.commitTransaction();
  } catch (err) {
    await qr.rollbackTransaction();
    throw err;
  } finally {
    await qr.release();
  }

  // El orden importa: las dos de arriba se derivan de la primera. Refrescarlas
  // al revés deja el perfil calculado sobre los coeficientes viejos, y no falla
  // nada.
  await AppDataSource.query(`REFRESH MATERIALIZED VIEW riesgo_tributario`);
  await AppDataSource.query(`REFRESH MATERIALIZED VIEW riesgo_tributario_anio`);
  await AppDataSource.query(`REFRESH MATERIALIZED VIEW perfil_riesgo_tributario`);

  const [r] = await AppDataSource.query(
    `SELECT count(*)::int AS filas,
            count(*) FILTER (WHERE NOT coef_especifico)::int AS por_general
       FROM riesgo_tributario`,
  );
  const [p] = await AppDataSource.query(
    `SELECT count(*)::int AS empresas,
            count(*) FILTER (WHERE anios_decil_alto >= 3)::int AS persistentes
       FROM perfil_riesgo_tributario`,
  );
  console.log(
    `Cargado. riesgo_tributario: ${r.filas} balances, ${r.por_general} con el coeficiente general.\n` +
      `perfil_riesgo_tributario: ${p.empresas} compañías, ${p.persistentes} en el decil alto 3+ ejercicios.`,
  );

  await AppDataSource.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
