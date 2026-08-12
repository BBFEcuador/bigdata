import { Module } from '@nestjs/common';
import { ScraperSimulado } from './ejecutores/scraper-simulado';
import { Scraper } from './ejecutores/scraper.interface';
import { ScraperRegistry } from './ejecutores/scraper.registry';
import { ScrapingController } from './scraping.controller';
import { ScrapingDispatcherService } from './scraping-dispatcher.service';
import { ScrapingJobsService } from './scraping-jobs.service';
import { ScrapingRecoveryService } from './scraping-recovery.service';

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
    {
      provide: ScraperRegistry,
      inject: [ScraperSimulado],
      useFactory: (...scrapers: Scraper[]) => new ScraperRegistry(scrapers),
    },
  ],
  exports: [ScrapingJobsService],
})
export class ScrapingModule {}
