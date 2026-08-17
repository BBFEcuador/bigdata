import { Module } from '@nestjs/common';
import { ScraperSimulado } from './ejecutores/scraper-simulado';
import { Scraper } from './ejecutores/scraper.interface';
import { ScraperRegistry } from './ejecutores/scraper.registry';
import { ScrapingController } from './scraping.controller';
import { ScrapingDispatcherService } from './scraping-dispatcher.service';
import { ScrapingJobsService } from './scraping-jobs.service';
import { ScrapingRecoveryService } from './scraping-recovery.service';
import { ScraperDataportalWeb } from './ejecutores/scraper-dataportal-web';
import { COMPANIAS_SCRAPING_REPOSITORY } from './application/ports/companias-scraping.repository';
import { DATAPORTAL_NAVIGATOR } from './application/ports/dataportal-navigator';
import { PostgresCompaniasScrapingRepository } from './infrastructure/persistence/postgres-companias-scraping.repository';
import {
  DATAPORTAL_BROWSER_LAUNCHER,
  PlaywrightDataportalNavigator,
} from './infrastructure/navigation/playwright-dataportal.navigator';
import { chromium } from 'playwright';
import { DATAPORTAL_OBSERVACIONES_REPOSITORY } from './application/ports/dataportal-observaciones.repository';
import { PostgresDataportalObservacionesRepository } from './infrastructure/persistence/postgres-dataportal-observaciones.repository';

/**
 * Para añadir un scraper real:
 *
 * 1. Un archivo en `ejecutores/` que implemente `Scraper`.
 * 2. Su clase en `providers` y en el `inject` de la factoría de abajo.
 *
 * Eso es todo. Ni el despachador, ni el servicio, ni la migración, ni la
 * pantalla saben cuántos scrapers hay: la pantalla los descubre por
 * `GET /scraping/fuentes`.
 *
 * Nest no tiene multi-providers (eso es Angular), de ahí el `useFactory`.
 */
@Module({
  controllers: [ScrapingController],
  providers: [
    ScrapingJobsService,
    ScrapingRecoveryService,
    ScrapingDispatcherService,
    ScraperSimulado,
    ScraperDataportalWeb,
    PostgresCompaniasScrapingRepository,
    PostgresDataportalObservacionesRepository,
    PlaywrightDataportalNavigator,
    {
      provide: COMPANIAS_SCRAPING_REPOSITORY,
      useExisting: PostgresCompaniasScrapingRepository,
    },
    {
      provide: DATAPORTAL_NAVIGATOR,
      useExisting: PlaywrightDataportalNavigator,
    },
    {
      provide: DATAPORTAL_OBSERVACIONES_REPOSITORY,
      useExisting: PostgresDataportalObservacionesRepository,
    },
    {
      provide: DATAPORTAL_BROWSER_LAUNCHER,
      useValue: {
        launch: (headless: boolean) => chromium.launch({ headless }),
      },
    },
    {
      provide: ScraperRegistry,
      inject: [ScraperSimulado, ScraperDataportalWeb],
      useFactory: (...scrapers: Scraper[]) =>
        new ScraperRegistry(scrapers, 'dataportal-web'),
    },
  ],
  exports: [ScrapingJobsService],
})
export class ScrapingModule {}
