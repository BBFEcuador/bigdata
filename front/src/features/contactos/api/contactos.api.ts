import { httpClient } from '../../../shared/api/http-client';
import { compactQuery } from '../../../shared/api/query-params';
import type { ResultadoContactos } from './contactos.types';

type QueryContactos = Record<string, string | number | undefined> & {
  limit?: number;
  cursor?: string;
};

export async function listarContactos(
  contribuyenteId: string,
  query: QueryContactos = {}
): Promise<ResultadoContactos> {
  const response = await httpClient.get<ResultadoContactos>(
    `/contactos/contribuyente/${encodeURIComponent(contribuyenteId)}`,
    { params: compactQuery(query) }
  );
  return response.data;
}
