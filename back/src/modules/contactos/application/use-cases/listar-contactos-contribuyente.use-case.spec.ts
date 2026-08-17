import { NotFoundException } from '@nestjs/common';
import { ContactosReadRepository } from '../ports/contactos-read.repository';
import { ListarContactosContribuyenteUseCase } from './listar-contactos-contribuyente.use-case';

const ID = '11111111-1111-4111-8111-111111111111';

function repositorio(
  existe = true,
  filas: Awaited<ReturnType<ContactosReadRepository['listar']>> = [],
): ContactosReadRepository {
  return {
    contribuyenteExiste: jest.fn(async () => existe),
    listar: jest.fn(async () => filas),
  };
}

describe('ListarContactosContribuyenteUseCase', () => {
  it('devuelve una lista vacía para un contribuyente existente', async () => {
    await expect(
      new ListarContactosContribuyenteUseCase(repositorio()).execute(ID),
    ).resolves.toEqual({ datos: [], siguiente: null });
  });

  it('pagina por valor y pide una fila adicional', async () => {
    const repo = repositorio(true, [
      { valor: 'a', tipo: 'otro', tipoCodigo: null },
      { valor: 'b', tipo: 'email', tipoCodigo: '3' },
      { valor: 'c', tipo: 'telefono', tipoCodigo: '8' },
    ]);
    await expect(
      new ListarContactosContribuyenteUseCase(repo).execute(ID, 2, 'antes'),
    ).resolves.toEqual({
      datos: expect.arrayContaining([
        expect.objectContaining({ valor: 'a' }),
        expect.objectContaining({ valor: 'b' }),
      ]),
      siguiente: 'b',
    });
    expect(repo.listar).toHaveBeenCalledWith(ID, 'antes', 3);
  });

  it('responde 404 si el contribuyente no existe', async () => {
    await expect(
      new ListarContactosContribuyenteUseCase(repositorio(false)).execute(ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
