import { NotFoundException } from '@nestjs/common';
import { NominaReadRepository } from '../ports/nomina-read.repository';
import { ListarNominaContribuyenteUseCase } from './listar-nomina-contribuyente.use-case';

const ID = '11111111-1111-4111-8111-111111111111';
const persona = (cedula: string) => ({
  cedula,
  nombre: null,
  fechaIngreso: null,
  rol: null,
  posibleSalario: null,
});

function repositorio(
  existe = true,
  filas = [] as ReturnType<typeof persona>[],
): NominaReadRepository {
  return {
    contribuyenteExiste: jest.fn(async () => existe),
    listar: jest.fn(async () => filas),
  };
}

describe('ListarNominaContribuyenteUseCase', () => {
  it('devuelve vacío para un contribuyente existente', async () => {
    await expect(
      new ListarNominaContribuyenteUseCase(repositorio()).execute(ID),
    ).resolves.toEqual({ datos: [], siguiente: null });
  });

  it('pagina por cédula', async () => {
    const repo = repositorio(true, [
      persona('01'),
      persona('02'),
      persona('03'),
    ]);
    await expect(
      new ListarNominaContribuyenteUseCase(repo).execute(ID, 2, '00'),
    ).resolves.toEqual({
      datos: [persona('01'), persona('02')],
      siguiente: '02',
    });
    expect(repo.listar).toHaveBeenCalledWith(ID, '00', 3);
  });

  it('responde 404 si el contribuyente no existe', async () => {
    await expect(
      new ListarNominaContribuyenteUseCase(repositorio(false)).execute(ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
