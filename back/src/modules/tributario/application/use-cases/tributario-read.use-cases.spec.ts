import { ListarCreditoTributarioUseCase } from './listar-credito-tributario.use-case';
import { ListarRiesgoTributarioUseCase } from './listar-riesgo-tributario.use-case';
import { ListarUtilidadesNoDistribuidasUseCase } from './listar-utilidades-no-distribuidas.use-case';
import { ObtenerFichaTributariaUseCase } from './obtener-ficha-tributaria.use-case';
import { TributarioReadRepository } from '../ports/tributario-read.repository';

describe('casos de uso de lecturas tributarias', () => {
  it('aplica los defaults, el orden y normaliza la rama del ranking', async () => {
    const repository = {
      listarRiesgo: jest.fn().mockResolvedValue({ datos: [], total: 3 }),
    } as unknown as TributarioReadRepository;

    await expect(
      new ListarRiesgoTributarioUseCase(repository).execute({ rama: 'h522' }),
    ).resolves.toEqual({ datos: [], total: 3, limit: 50, offset: 0 });
    expect(repository.listarRiesgo).toHaveBeenCalledWith({
      rama: 'H522',
      poblacion: 'comparable',
      orden: 'percentil',
      limit: 50,
      offset: 0,
    });
  });

  it('compone el aviso de utilidades con el último ejercicio', async () => {
    const repository = {
      getUltimoAnioUtilidades: jest.fn().mockResolvedValue(2025),
      listarUtilidades: jest.fn().mockResolvedValue({
        datos: [{ expediente: '1' }],
        total: {
          filas: 1,
          financieras: 0,
          suma_base: '10',
          suma_anticipo: '1',
          suma_niif: '0',
        },
        movimiento: { bajaron: 0 },
        tarifa: [{ tramo: 1 }],
      }),
    } as unknown as TributarioReadRepository;

    const result = await new ListarUtilidadesNoDistribuidasUseCase(
      repository,
    ).execute({ rama: 'c' });
    expect(repository.listarUtilidades).toHaveBeenCalledWith(
      expect.objectContaining({ rama: 'C', limit: 50, offset: 0 }),
      2025,
    );
    expect(result).toMatchObject({
      anio: 2025,
      total: 1,
      sumaBase: '10',
      tarifa: { completa: false },
    });
    expect(result.resolucion.corte).toBe('31 de julio de 2026');
  });

  it('mantiene comparables por defecto en el crédito tributario', async () => {
    const repository = {
      getMetadatosCredito: jest
        .fn()
        .mockResolvedValue({ anios: [2024], ultimo: 2024 }),
      listarCredito: jest
        .fn()
        .mockResolvedValue({ datos: [], totales: { companias: 0 } }),
    } as unknown as TributarioReadRepository;

    await new ListarCreditoTributarioUseCase(repository).execute({
      soloComparables: false,
      rama: 'a',
    });
    expect(repository.listarCredito).toHaveBeenCalledWith(
      expect.objectContaining({
        soloComparables: false,
        rama: 'A',
        limit: 50,
        offset: 0,
      }),
      2024,
    );
  });

  it('propaga la inexistencia de una ficha para que presentación responda 404', async () => {
    const repository = {
      getFicha: jest.fn().mockResolvedValue(null),
    } as unknown as TributarioReadRepository;
    await expect(
      new ObtenerFichaTributariaUseCase(repository).execute('sin-datos'),
    ).resolves.toBeNull();
  });
});
