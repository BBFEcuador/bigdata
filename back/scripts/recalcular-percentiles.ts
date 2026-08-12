import 'reflect-metadata';
import { AppDataSource } from '../src/data-source';
import { PercentilesService } from '../src/modules/balances/percentiles.service';

/**
 * Recalcula los percentiles sectoriales sin levantar la API.
 *
 *     npm run percentiles
 *
 * Existe porque el recálculo tarda minutos y, lanzado contra `start:dev`,
 * cualquier guardado en `src/` reinicia Nest y se lleva por delante la
 * transacción a medias. Aquí corre en su propio proceso y no depende de eso.
 *
 * Es el mismo servicio que usa el endpoint `POST /balances/percentiles/recalcular`,
 * no una segunda implementación.
 */
async function main() {
  await AppDataSource.initialize();
  try {
    const servicio = new PercentilesService(AppDataSource);
    const r = await servicio.recalcular();
    console.log(
      `Listo: ${r.balances} balances, ${r.cortes} cortes de sector, ` +
        `${r.empresas} empresas posicionadas en ${(r.ms / 1000).toFixed(1)}s`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
