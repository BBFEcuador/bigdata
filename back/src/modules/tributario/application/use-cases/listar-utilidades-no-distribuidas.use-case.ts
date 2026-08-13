import { Inject, Injectable } from '@nestjs/common';
import {
  ConsultaUtilidades,
  TRIBUTARIO_READ_REPOSITORY,
  TributarioReadRepository,
} from '../ports/tributario-read.repository';

@Injectable()
export class ListarUtilidadesNoDistribuidasUseCase {
  constructor(
    @Inject(TRIBUTARIO_READ_REPOSITORY)
    private readonly repository: TributarioReadRepository,
  ) {}

  async execute(query: Partial<ConsultaUtilidades>) {
    const consulta: ConsultaUtilidades = {
      ...query,
      rama: query.rama?.toUpperCase(),
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    };
    const ultimoAnio = await this.repository.getUltimoAnioUtilidades();
    const ejercicio = consulta.anio ?? ultimoAnio;
    const resultado = await this.repository.listarUtilidades(
      consulta,
      ejercicio,
    );
    const total = resultado.total;

    return {
      anio: ejercicio,
      datos: resultado.datos,
      total: total.filas,
      financieras: total.financieras,
      sumaBase: total.suma_base,
      sumaAnticipo: total.suma_anticipo,
      sumaNiif: total.suma_niif,
      tarifa: {
        tramos: resultado.tarifa,
        completa: resultado.tarifa.length > 1,
      },
      movimiento: resultado.movimiento,
      limit: consulta.limit,
      offset: consulta.offset,
      resolucion: {
        numero: 'NAC-DGERCGC26-00000026',
        suscrita: '2026-07-14',
        corte: `31 de julio de ${(ejercicio ?? 0) + 1}`,
        codigos: { unaCuota: '1077', tresCuotas: '1078' },
      },
    };
  }
}
