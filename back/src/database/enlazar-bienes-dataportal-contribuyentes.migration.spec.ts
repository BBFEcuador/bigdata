import { QueryRunner } from 'typeorm';
import { EnlazarBienesDataportalContribuyentes1700000027000 } from './migrations/1700000027000-EnlazarBienesDataportalContribuyentes';

describe('EnlazarBienesDataportalContribuyentes1700000027000', () => {
  it('crea FK obligatorias, unicidad por contribuyente e índices de RUC', async () => {
    const query = jest.fn<Promise<void>, [string]>(async () => undefined);
    await new EnlazarBienesDataportalContribuyentes1700000027000().up({
      query,
    } as unknown as QueryRunner);
    const sql = query.mock.calls.map(([sentencia]) => sentencia).join('\n');
    expect(sql).toMatch(/contribuyente_id uuid NOT NULL/g);
    expect(sql).toContain('PRIMARY KEY (contribuyente_id, cedula_catastral)');
    expect(sql).toContain('PRIMARY KEY (contribuyente_id, placa)');
    expect(sql.match(/REFERENCES contribuyentes\(id\)/g)).toHaveLength(2);
    expect(sql).toContain('idx_dataportal_propiedad_ruc');
    expect(sql).toContain('idx_dataportal_vehiculo_ruc');
  });
});
