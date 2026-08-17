import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryBienesDto } from './query-bienes.dto';

describe('QueryBienesDto', () => {
  it('transforma y valida límites independientes', async () => {
    const dto = plainToInstance(QueryBienesDto, {
      limitPropiedades: '25',
      limitVehiculos: '10',
      cursorPropiedades: 'CAT-1',
      cursorVehiculos: 'ABC1',
    });
    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.limitPropiedades).toBe(25);
    expect(dto.limitVehiculos).toBe(10);
  });

  it.each([
    { limitPropiedades: 0 },
    { limitVehiculos: 101 },
    { cursorVehiculos: 'x'.repeat(101) },
  ])('rechaza parámetros fuera de contrato: %o', async (entrada) => {
    await expect(
      validate(plainToInstance(QueryBienesDto, entrada)),
    ).resolves.not.toHaveLength(0);
  });
});
