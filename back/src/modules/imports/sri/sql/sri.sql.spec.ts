import {
  estadisticasSql,
  mergeEstablecimientosSql,
  mergePersonasSql,
} from './sri.sql';

describe('SQL del padrón provincial', () => {
  it('clasifica personas por obligado_contabilidad y conserva la provincia', () => {
    const sql = mergePersonasSql('stg_sri_demo', 'AZUAY');

    expect(sql).toContain("THEN 'natural_contable' ELSE 'natural_no_contable'");
    expect(sql).toContain('upper(trim(s.provincia)) = upper(trim($2))');
    expect(sql).toContain('provincia = EXCLUDED.provincia');
    expect(sql).not.toContain('catastro');
  });

  it('limita los establecimientos de la carga exclusiva de personas a su provincia', () => {
    const sql = mergeEstablecimientosSql('stg_sri_demo', true, 'AZUAY');

    expect(sql).toContain("s.tipo_contribuyente = 'PERSONA NATURAL'");
    expect(sql).toContain('upper(trim(s.provincia)) = upper(trim($2))');
  });

  it('permite calcular estadísticas sólo para personas de la provincia cargada', () => {
    const sql = estadisticasSql('stg_sri_demo', true, 'AZUAY');

    expect(sql).toContain("WHERE s.tipo_contribuyente = 'PERSONA NATURAL'");
    expect(sql).toContain('upper(trim(s.provincia)) = upper(trim($1))');
  });
});
