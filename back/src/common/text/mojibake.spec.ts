import { pareceMojibake, repararCampos, repararMojibake } from './mojibake';

/**
 * Los casos vienen del JSON REAL que devuelve la API de DataPortal, no de
 * ejemplos inventados: `contacto_nomina/1790013731001` trae
 * "TUBAY CARREÃ‘O EMILIO GREGORIO" y "RECOLECCIÃ“N DE RACIMOS".
 *
 * Esta reparación NO se usa para los nombres de compañía —esos ya los tenemos
 * limpios de la Superintendencia y del SRI, y el portal sólo enriquece— sino
 * para lo que únicamente existe aquí: nombres de empleados y sus ocupaciones.
 */
describe('repararMojibake', () => {
  it('repara la eñe, que es el caso más frecuente en nombres', () => {
    expect(repararMojibake('TUBAY CARREÃ‘O EMILIO GREGORIO')).toBe(
      'TUBAY CARREÑO EMILIO GREGORIO',
    );
    expect(repararMojibake('MERO QUIÃ‘ONEZ DARIO FELIBERTO')).toBe(
      'MERO QUIÑONEZ DARIO FELIBERTO',
    );
  });

  it('repara las vocales acentuadas recuperables', () => {
    expect(repararMojibake('RECOLECCIÃ“N DE RACIMOS')).toBe('RECOLECCIÓN DE RACIMOS');
    expect(repararMojibake('GESTIÃ“N')).toBe('GESTIÓN');
    expect(repararMojibake('CRÃ‰DITO')).toBe('CRÉDITO');
  });

  it('repara varias secuencias en la misma cadena', () => {
    expect(repararMojibake('PRODUCCIÃ“N Y RECOLECCIÃ“N DE RACIMOS')).toBe(
      'PRODUCCIÓN Y RECOLECCIÓN DE RACIMOS',
    );
  });

  /**
   * Límite real de la reparación, y conviene tenerlo escrito.
   *
   * `Á` es UTF-8 `C3 81` e `Í` es `C3 8D`. Los bytes 0x81 y 0x8D **no existen
   * en Windows-1252**, así que cuando el origen hizo la doble codificación esos
   * bytes se perdieron: ya no están en la cadena y no hay nada que revertir.
   *
   * Importa porque el portal devuelve los nombres en MAYÚSCULAS, que es justo
   * donde caen `Á` e `Í`: "GARCÍA" y "ÁLVAREZ" llegan mutilados de origen. La
   * función devuelve el texto tal cual en vez de repararlo a medias.
   */
  it('no puede recuperar Á ni Í mayúsculas: sus bytes no existen en cp1252', () => {
    const garcia = 'GARCÃA'; // GARCÍA con la Í ya perdida en el origen
    expect(repararMojibake(garcia)).toBe(garcia);
  });

  /**
   * Éste es el test que evita el daño colateral: un texto que YA está bien no
   * puede tocarse. Corromper un nombre correcto sería peor que dejar uno malo,
   * porque nadie lo encontraría después.
   */
  it('no toca el texto que ya está correcto', () => {
    const buenos = [
      'CARREÑO',
      'RECOLECCIÓN DE RACIMOS',
      'AGRICULTURA, GANADERÍA, SILVICULTURA Y PESCA.',
      'ACOSTA LLERENA JUAN CARLOS',
      'GERENTE / AFINES',
      'COMPAÑÍA ANÓNIMA',
    ];
    for (const t of buenos) expect(repararMojibake(t)).toBe(t);
  });

  it('deja intacto el ASCII puro', () => {
    expect(repararMojibake('VELEZ MARQUEZ ANTHONY VICENTE')).toBe(
      'VELEZ MARQUEZ ANTHONY VICENTE',
    );
    expect(repararMojibake('')).toBe('');
    expect(repararMojibake('1790013731001')).toBe('1790013731001');
  });

  it('conserva el original cuando el carácter ya se perdió', () => {
    // El `?` de "QUÃ?M" es un byte irrecuperable del origen: no se puede
    // reconstruir, y el texto se devuelve entero en vez de a medias.
    const roto = 'CORONA QUÃ?M';
    expect(repararMojibake(roto)).toBe(roto);
  });

  it('detecta la firma del mojibake sin falsos positivos', () => {
    expect(pareceMojibake('CARREÃ‘O')).toBe(true);
    expect(pareceMojibake('RECOLECCIÃ“N')).toBe(true);
    expect(pareceMojibake('CARREÑO')).toBe(false);
    expect(pareceMojibake('SANTO DOMINGO')).toBe(false);
  });

  it('es idempotente: reparar dos veces da lo mismo', () => {
    const una = repararMojibake('TUBAY CARREÃ‘O');
    expect(repararMojibake(una)).toBe(una);
  });
});

describe('repararCampos', () => {
  it('repara todos los strings del objeto y respeta el resto', () => {
    const fila = {
      dni: '1714924469 ',
      nombre: 'TUBAY CARREÃ‘O EMILIO GREGORIO',
      sueldo: '482',
      ocupacion: 'RECOLECCIÃ“N DE RACIMOS',
      activo: true,
      empleados: 4,
      vacio: null,
    };
    expect(repararCampos(fila)).toEqual({
      dni: '1714924469 ',
      nombre: 'TUBAY CARREÑO EMILIO GREGORIO',
      sueldo: '482',
      ocupacion: 'RECOLECCIÓN DE RACIMOS',
      activo: true,
      empleados: 4,
      vacio: null,
    });
  });
});
