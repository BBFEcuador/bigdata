/* eslint-disable no-console */
import { abrirLectorDeLineas } from '../src/common/text/lineas';
import {
  CabeceraBalances,
  parsearCabecera,
  parsearFila,
} from '../src/modules/imports/balances/balances-file.parser';
import { FORMULARIO_POR_NUM_CUENTAS } from '../src/modules/imports/balances/balances.constants';

/**
 * Ensayo en seco del importador de balances: recorre el archivo entero haciendo
 * exactamente lo mismo que el import real (detectar codificación, parsear la
 * cabecera, pivotar cada fila) pero NO toca la base de datos.
 *
 *   npx ts-node scripts/dry-run-balances.ts "ruta\al\balances_2025_1.txt"
 *
 * Sirve para validar un archivo nuevo antes de cargarlo: si aquí sale algo raro,
 * el import también lo vería, pero después de minutos de COPY.
 */
async function main(): Promise<void> {
  const ruta = process.argv[2];
  if (!ruta) {
    console.error('Uso: ts-node scripts/dry-run-balances.ts <balances_AAAA_N.txt>');
    process.exit(1);
  }

  const t0 = Date.now();
  const { encoding, lineas } = await abrirLectorDeLineas(ruta);

  let cabecera: CabeceraBalances | null = null;
  let numeroLinea = 0;
  let filas = 0;
  let rechazadas = 0;
  let celdas = 0;
  let celdasMalas = 0;
  const anios = new Map<number, number>();
  const motivos = new Map<string, number>();
  const ejemplos: string[] = [];
  let conAcento = 0;
  let descuadres = 0;
  let conEcuacion = 0;

  for await (const linea of lineas) {
    numeroLinea++;

    if (cabecera === null) {
      const r = parsearCabecera(linea);
      for (const p of r.problemas) motivos.set(p.motivo, (motivos.get(p.motivo) ?? 0) + 1);
      if (r.cabecera === null) {
        console.error('No se pudo interpretar la cabecera:');
        for (const p of r.problemas) console.error(`  - ${p.motivo}`);
        process.exit(1);
      }
      cabecera = r.cabecera;
      continue;
    }
    if (linea === '') continue;

    const { fila, cuentas, rechazos } = parsearFila(linea, cabecera);
    for (const r of rechazos) {
      motivos.set(r.motivo.split(':')[0], (motivos.get(r.motivo.split(':')[0]) ?? 0) + 1);
      if (ejemplos.length < 5) ejemplos.push(`línea ${numeroLinea}: ${r.columna} -> ${r.motivo}`);
      celdasMalas++;
    }

    if (fila === null) {
      rechazadas++;
      continue;
    }

    filas++;
    celdas += cuentas.length;
    anios.set(fila.anio, (anios.get(fila.anio) ?? 0) + 1);
    if (/[ÁÉÍÓÚÑáéíóúñ]/.test(fila.descripcion_rama ?? '')) conAcento++;

    // ACTIVO = PASIVO + PATRIMONIO, sólo tiene sentido en el formulario IFRS.
    const activo = cuentas.find((c) => c.codigo === '1');
    const pasivo = cuentas.find((c) => c.codigo === '2');
    const patrimonio = cuentas.find((c) => c.codigo === '3');
    if (activo || pasivo || patrimonio) {
      conEcuacion++;
      const a = Number(activo?.valor ?? 0);
      const p = Number(pasivo?.valor ?? 0);
      const q = Number(patrimonio?.valor ?? 0);
      if (Math.abs(a - (p + q)) > 0.05) descuadres++;
    }
  }

  const numCuentas = cabecera!.cuentas.length;
  const formulario = FORMULARIO_POR_NUM_CUENTAS[numCuentas];
  const total = filas * numCuentas;

  console.log(`Archivo      : ${ruta}`);
  console.log(`Codificación : ${encoding}`);
  console.log(`Formulario   : ${formulario ?? 'DESCONOCIDO'} (${numCuentas} cuentas)`);
  console.log(`Ejercicios   : ${[...anios].map(([a, n]) => `${a} (${n})`).join(', ')}`);
  console.log(`Balances     : ${filas}`);
  console.log(`Rechazados   : ${rechazadas}`);
  console.log(
    `Celdas       : ${celdas} con valor de ${total} ` +
      `(densidad ${total ? ((100 * celdas) / total).toFixed(2) : '0'} %)`,
  );
  console.log(`Celdas malas : ${celdasMalas}`);
  console.log(`Con acentos  : ${conAcento} descripciones (0 delataría una mala decodificación)`);
  console.log(`Descuadres   : ${descuadres} de ${conEcuacion} con A = P + PN`);

  if (motivos.size) {
    console.log('\nMotivos:');
    for (const [m, n] of [...motivos].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(8)}  ${m}`);
    }
  }
  if (ejemplos.length) {
    console.log('\nEjemplos:');
    for (const e of ejemplos) console.log(`  ${e}`);
  }

  console.log(`\nTiempo       : ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

void main();
