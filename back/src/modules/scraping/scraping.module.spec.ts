import { MODULE_METADATA } from '@nestjs/common/constants';
import { CONTRIBUYENTES_SCRAPING_REPOSITORY } from './application/ports/contribuyentes-scraping.repository';
import { DATAPORTAL_NAVIGATOR } from './application/ports/dataportal-navigator';
import { DATAPORTAL_OBSERVACIONES_REPOSITORY } from './application/ports/dataportal-observaciones.repository';
import { ScraperDataportalWeb } from './ejecutores/scraper-dataportal-web';
import { ScraperRegistry } from './ejecutores/scraper.registry';
import { PlaywrightDataportalNavigator } from './infrastructure/navigation/playwright-dataportal.navigator';
import { PostgresContribuyentesScrapingRepository } from './infrastructure/persistence/postgres-contribuyentes-scraping.repository';
import { PostgresDataportalObservacionesRepository } from './infrastructure/persistence/postgres-dataportal-observaciones.repository';
import { ScrapingModule } from './scraping.module';

describe('ScrapingModule', () => {
  const providers: any[] = Reflect.getMetadata(
    MODULE_METADATA.PROVIDERS,
    ScrapingModule,
  );

  it('enlaza los puertos con los adaptadores reales', () => {
    expect(providers).toContain(PlaywrightDataportalNavigator);
    expect(providers).toContain(PostgresContribuyentesScrapingRepository);
    expect(providers).toContain(PostgresDataportalObservacionesRepository);
    expect(providers).toContainEqual({
      provide: DATAPORTAL_NAVIGATOR,
      useExisting: PlaywrightDataportalNavigator,
    });
    expect(providers).toContainEqual({
      provide: CONTRIBUYENTES_SCRAPING_REPOSITORY,
      useExisting: PostgresContribuyentesScrapingRepository,
    });
    expect(providers).toContainEqual({
      provide: DATAPORTAL_OBSERVACIONES_REPOSITORY,
      useExisting: PostgresDataportalObservacionesRepository,
    });
  });

  it('registra dataportal-web en la factoría del registro', () => {
    const registro = providers.find((p) => p.provide === ScraperRegistry);
    expect(registro.inject).toContain(ScraperDataportalWeb);
    const simulada = { fuente: 'simulada' };
    const dataportal = { fuente: 'dataportal-web' };
    expect(registro.useFactory(simulada, dataportal).fuentePorDefecto()).toBe(
      'dataportal-web',
    );
  });
});
