/* eslint-disable no-console */
import { readFileSync } from 'node:fs';
import { decodificarTexto } from '../src/common/text/encoding';
import { parsearCatalogo } from '../src/modules/imports/catalogo/catalogo-file.parser';
import { construirJerarquia } from '../src/modules/imports/catalogo/jerarquia';

/**
 * Ensayo en seco del importador de catálogo: hace exactamente lo mismo que el
 * import real (decodificar, parsear, derivar jerarquía) pero NO toca la base de
 * datos. Sirve para validar un archivo antes de cargarlo.
 *
 *   npx ts-node scripts/dry-run-catalogo.ts "ruta\al\catalogo.txt"
 */
const ruta = process.argv[2];
if (!ruta) {
  console.error('Uso: ts-node scripts/dry-run-catalogo.ts <archivo.txt>');
  process.exit(1);
}

const buffer = readFileSync(ruta);
const { texto, encoding } = decodificarTexto(buffer);
const { cuentas, rechazos, duplicados } = parsearCatalogo(texto);
const jerarquia = construirJerarquia(cuentas);

const raices = jerarquia.filter((c) => c.codigoPadre === null);
const hojas = jerarquia.filter((c) => c.esHoja);
const porNivel = new Map<number, number>();
for (const c of jerarquia) porNivel.set(c.nivel, (porNivel.get(c.nivel) ?? 0) + 1);

console.log(`Archivo    : ${ruta}`);
console.log(`Tamaño     : ${buffer.length.toLocaleString('es-EC')} bytes`);
console.log(`Codificación detectada: ${encoding}`);
console.log('');
console.log(`Cuentas válidas : ${cuentas.length}`);
console.log(`Rechazadas      : ${rechazos.length}`);
console.log(`Duplicadas      : ${duplicados}`);
console.log(`Raíces          : ${raices.length}`);
console.log(`Hojas           : ${hojas.length}`);
console.log('');
console.log('Por nivel:');
[...porNivel.entries()]
  .sort((a, b) => a[0] - b[0])
  .forEach(([n, c]) => console.log(`  nivel ${n}: ${c}`));

console.log('');
console.log('Primeras 8 cuentas:');
for (const c of jerarquia.slice(0, 8)) {
  console.log(
    `  ${c.codigo.padEnd(12)} niv=${c.nivel} padre=${(c.codigoPadre ?? '-').padEnd(10)} ${c.nombre}`,
  );
}

console.log('');
console.log('Comprobación de acentos (debe verse Ú, Ñ, Ó sin interrogantes):');
for (const cod of ['1010102', '10102010104', '1020401']) {
  const c = jerarquia.find((x) => x.codigo === cod);
  if (c) console.log(`  ${cod}: ${c.nombre}`);
}
const conReemplazo = jerarquia.filter((c) => c.nombre.includes('�'));
console.log(`  nombres con carácter de reemplazo: ${conReemplazo.length}`);

if (rechazos.length) {
  console.log('');
  console.log('Rechazos:');
  rechazos.slice(0, 10).forEach((r) => console.log(`  línea ${r.linea}: ${r.motivo}`));
}
