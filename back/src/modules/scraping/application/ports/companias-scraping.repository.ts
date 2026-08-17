export const COMPANIAS_SCRAPING_REPOSITORY = Symbol(
  'COMPANIAS_SCRAPING_REPOSITORY',
);

export interface CompaniaParaScraping {
  id: string;
  expediente: string;
  ruc: string | null;
}

/** Proyección mínima que necesita un scraper de compañías. */
export interface CompaniasScrapingRepository {
  buscarPorExpediente(expediente: string): Promise<CompaniaParaScraping | null>;
}
