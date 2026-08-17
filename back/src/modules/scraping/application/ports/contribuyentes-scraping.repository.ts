import { TipoSujeto } from '../../scraping.sujetos';

export const CONTRIBUYENTES_SCRAPING_REPOSITORY = Symbol(
  'CONTRIBUYENTES_SCRAPING_REPOSITORY',
);

export interface ContribuyenteParaScraping {
  id: string;
  ruc: string | null;
}

/** Resuelve el UUID y RUC según la identidad propia de cada tipo de sujeto. */
export interface ContribuyentesScrapingRepository {
  buscar(
    tipoSujeto: TipoSujeto,
    clave: string,
  ): Promise<ContribuyenteParaScraping | null>;
}
