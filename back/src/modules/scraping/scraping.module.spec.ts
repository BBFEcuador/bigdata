import { MODULE_METADATA } from '@nestjs/common/constants';
import { COMPANIAS_SCRAPING_REPOSITORY } from './application/ports/companias-scraping.repository';
import { DATAPORTAL_NAVIGATOR } from './application/ports/dataportal-navigator';
import { ScraperDataportalWeb } from './ejecutores/scraper-dataportal-web';
import { ScraperRegistry } from './ejecutores/scraper.registry';
import { PlaywrightDataportalNavigator } from './infrastructure/navigation/playwright-dataportal.navigator';
import { PostgresCompaniasScrapingRepository } from './infrastructure/persistence/postgres-companias-scraping.repository';
import { ScrapingModule } from './scraping.module';

describe('ScrapingModule', () => {
  const providers: any[] = Reflect.getMetadata(
    MODULE_METADATA.PROVIDERS,
    ScrapingModule,
  );

  it('enlaza los puertos con los adaptadores reales', () => {
    expect(providers).toContain(PlaywrightDataportalNavigator);
    expect(providers).toContain(PostgresCompaniasScrapingRepository);
    expect(providers).toContainEqual({
      provide: DATAPORTAL_NAVIGATOR,
      useExisting: PlaywrightDataportalNavigator,
    });
    expect(providers).toContainEqual({
      provide: COMPANIAS_SCRAPING_REPOSITORY,
      useExisting: PostgresCompaniasScrapingRepository,
    });
  });

  it('registra dataportal-web en la factoría del registro', () => {
    const registro = providers.find(p => p.provide === ScraperRegistry);
    expect(registro.inject).toContain(ScraperDataportalWeb);
    const simulada = { fuente: 'simulada' };
    const dataportal = { fuente: 'dataportal-web' };
    expect(registro.useFactory(simulada, dataportal).fuentePorDefecto()).toBe(
      'dataportal-web',
    );
  });
});
