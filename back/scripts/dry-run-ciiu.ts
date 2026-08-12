/* eslint-disable no-console */
import { SourceRow, readRows } from '../src/modules/imports/xlsx/xlsx-row-source';
import { parsearCiiu } from '../src/modules/imports/ciiu/ciiu-file.parser';
import { construirJerarquiaCiiu } from '../src/modules/imports/ciiu/jerarquia-ciiu';

/**
 * Ensayo en seco del importador CIIU: hace exactamente lo mismo que el import
 * real (leer, parsear, derivar jerarquía) pero NO toca la base de datos.
 *
 *   npx ts-node scripts/dry-run-ciiu.ts "ruta\al\CIIU.xlsx"
 */
const ruta = process.argv[2];
if (!ruta) {
  console.error('Uso: ts-node scripts/dry-run-ciiu.ts <archivo.xlsx>');
  process.exit(1);
}

async function main() {
  const filas: SourceRow[] = [];
  for await (const f of readRows(ruta)) filas.push(f);

  const { actividades, rechazos, duplicados } = parsearCiiu(filas);
  const { actividades: jerarquia, discrepancias } = construirJerarquiaCiiu(actividades);

  const por = Object.fromEntries(jerarquia.map((x) => [x.codigo, x]));
  const raices = jerarquia.filter((x) => x.codigoPadre === null);
  const saltos = jerarquia.filter(
    (x) => x.codigoPadre && por[x.codigoPadre].nivel !== x.nivel - 1,
  );

  console.log(`Archivo         : ${ruta}`);
  console.log(`Filas en la hoja: ${filas.length}`);
  console.log('');
  console.log(`Actividades     : ${actividades.length}`);
  console.log(`Rechazadas      : ${rechazos.length}`);
  console.log(`Duplicadas      : ${duplicados}`);
  console.log(`Raíces          : ${raices.length}`);
  console.log(`Hojas           : ${jerarquia.filter((x) => x.esHoja).length}`);
  console.log(`Saltos de nivel : ${saltos.length}`);
  console.log(`Con codigo_supercias: ${jerarquia.filter((x) => x.codigoSupercias).length}`);

  console.log('');
  console.log('Por nivel:');
  const porNivel = new Map<number, number>();
  jerarquia.forEach((x) => porNivel.set(x.nivel, (porNivel.get(x.nivel) ?? 0) + 1));
  [...porNivel.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([n, c]) => console.log(`  nivel ${n} (${por[jerarquia.find((x) => x.nivel === n)!.codigo].nivelNombre}): ${c}`));

  console.log('');
  console.log(`Discrepancias columna/longitud: ${discrepancias.length}`);
  discrepancias.forEach((d) =>
    console.log(`  fila ${d.fila}: ${d.codigo} columna=${d.nivelColumna} longitud=${d.nivelLongitud}`),
  );

  console.log('');
  console.log('Comprobaciones clave:');
  const check = (etiqueta: string, real: unknown, esperado: unknown) =>
    console.log(`  ${real === esperado ? 'OK  ' : 'MAL '} ${etiqueta}: ${real} (esperado ${esperado})`);
  check('padre de N000000', String(por['N000000']?.codigoPadre), 'null');
  check('padre de E000000', String(por['E000000']?.codigoPadre), 'null');
  check('nivel de N000000', por['N000000']?.nivel, 1);
  check('nivel de G46694', por['G46694']?.nivel, 5);
  check('padre de G466940', por['G466940']?.codigoPadre, 'G46694');
  check('codigo_supercias A011111', por['A011111']?.codigoSupercias, 'A0111.11');
  check('nombre A011111', por['A011111']?.nombre, 'Cultivo de trigo.');

  console.log('');
  console.log('Raíces encontradas:');
  raices.forEach((r) => console.log(`  ${r.codigo.padEnd(9)} ${r.nombre.slice(0, 62)}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
