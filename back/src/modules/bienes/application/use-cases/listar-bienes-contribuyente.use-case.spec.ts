import { NotFoundException } from '@nestjs/common';
import { BienesReadRepository } from '../ports/bienes-read.repository';
import { ListarBienesContribuyenteUseCase } from './listar-bienes-contribuyente.use-case';

const ID = '11111111-1111-4111-8111-111111111111';
const propiedad = (cedulaCatastral: string) => ({
  cedulaCatastral,
  parroquia: null,
  codigoCalle: null,
  callePrincipal: null,
  numero: null,
  barrioSector: null,
  zona: null,
  telefono: null,
});
const vehiculo = (placa: string) => ({
  placa,
  tipo: null,
  modelo: null,
  marca: null,
  anio: null,
  lugar: null,
  fechaVencimiento: null,
});

function repositorio(existe = true): BienesReadRepository {
  return {
    contribuyenteExiste: jest.fn(async () => existe),
    listarPropiedades: jest.fn(async () => [
      propiedad('CAT-1'),
      propiedad('CAT-2'),
      propiedad('CAT-3'),
    ]),
    listarVehiculos: jest.fn(async () => [vehiculo('AAA1'), vehiculo('BBB2')]),
  };
}

describe('ListarBienesContribuyenteUseCase', () => {
  it('pagina propiedades y vehículos con cursores independientes', async () => {
    const repo = repositorio();
    const resultado = await new ListarBienesContribuyenteUseCase(repo).execute({
      contribuyenteId: ID,
      limitPropiedades: 2,
      cursorPropiedades: 'CAT-0',
      limitVehiculos: 1,
      cursorVehiculos: 'AAA0',
    });

    expect(resultado).toEqual({
      propiedades: {
        datos: [propiedad('CAT-1'), propiedad('CAT-2')],
        siguiente: 'CAT-2',
      },
      vehiculos: { datos: [vehiculo('AAA1')], siguiente: 'AAA1' },
    });
    expect(repo.listarPropiedades).toHaveBeenCalledWith(ID, 'CAT-0', 3);
    expect(repo.listarVehiculos).toHaveBeenCalledWith(ID, 'AAA0', 2);
  });

  it('devuelve ambas listas vacías para un contribuyente sin bienes', async () => {
    const repo = repositorio();
    (repo.listarPropiedades as jest.Mock).mockResolvedValue([]);
    (repo.listarVehiculos as jest.Mock).mockResolvedValue([]);
    await expect(
      new ListarBienesContribuyenteUseCase(repo).execute({
        contribuyenteId: ID,
      }),
    ).resolves.toEqual({
      propiedades: { datos: [], siguiente: null },
      vehiculos: { datos: [], siguiente: null },
    });
  });

  it('responde 404 y no consulta bienes si el contribuyente no existe', async () => {
    const repo = repositorio(false);
    await expect(
      new ListarBienesContribuyenteUseCase(repo).execute({
        contribuyenteId: ID,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.listarPropiedades).not.toHaveBeenCalled();
  });
});
