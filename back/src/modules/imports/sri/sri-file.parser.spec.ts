import {
  NUM_CAMPOS,
  parsearFilaSri,
  partirConComillas,
  validarCabecera,
} from './sri-file.parser';

const CABECERA =
  'NUMERO_RUC|RAZON_SOCIAL|CODIGO_JURISDICCION|ESTADO_CONTRIBUYENTE|CLASE_CONTRIBUYENTE|' +
  'FECHA_INICIO_ACTIVIDADES|FECHA_ACTUALIZACION|FECHA_SUSPENSION_DEFINITIVA|' +
  'FECHA_REINICIO_ACTIVIDADES|OBLIGADO|TIPO_CONTRIBUYENTE|NUMERO_ESTABLECIMIENTO|' +
  'NOMBRE_FANTASIA_COMERCIAL|ESTADO_ESTABLECIMIENTO|DESCRIPCION_PROVINCIA_EST|' +
  'DESCRIPCION_CANTON_EST|DESCRIPCION_PARROQUIA_EST|CODIGO_CIIU|ACTIVIDAD_ECONOMICA|' +
  'AGENTE_RETENCION|ESPECIAL';

/** Fila real del padrón de Galápagos. */
const FILA_OK =
  '0908867179001|CASTILLO GARCIA RICARDO|GALAPAGOS|ACTIVO|GEN|2001-05-28 00:00:00|' +
  '2024-08-29 12:38:55||2013-06-20 00:00:00|N|PERSONA NATURAL|1||ABI|GALAPAGOS|' +
  'SAN CRISTOBAL|PUERTO BAQUERIZO MORENO|A031101|ACTIVIDADES DE PESCA DE ALTURA.|N|N';

describe('validarCabecera', () => {
  it('acepta la cabecera real del padrón', () => {
    const { faltan, indices } = validarCabecera(CABECERA);
    expect(faltan).toEqual([]);
    expect(indices.NUMERO_RUC).toBe(0);
    expect(indices.ESPECIAL).toBe(20);
  });

  it('avisa de las columnas que faltan', () => {
    const { faltan } = validarCabecera('NUMERO_RUC|RAZON_SOCIAL');
    expect(faltan).toContain('TIPO_CONTRIBUYENTE');
  });
});

describe('partirConComillas', () => {
  it('respeta una barra dentro de un campo entrecomillado', () => {
    expect(partirConComillas('a|"b|c"|d')).toEqual(['a', 'b|c', 'd']);
  });

  it('maneja la comilla doble escapada', () => {
    expect(partirConComillas('a|"di ""hola"" tu"|b')).toEqual(['a', 'di "hola" tu', 'b']);
  });

  it('se comporta como un split cuando no hay comillas', () => {
    expect(partirConComillas('a|b|c')).toEqual(['a', 'b', 'c']);
  });
});

describe('parsearFilaSri', () => {
  it('lee una fila normal', () => {
    const { fila, reparada } = parsearFilaSri(FILA_OK);
    expect(reparada).toBe(false);
    expect(fila).toMatchObject({
      ruc: '0908867179001',
      razonSocial: 'CASTILLO GARCIA RICARDO',
      tipoContribuyente: 'PERSONA NATURAL',
      provincia: 'GALAPAGOS',
      canton: 'SAN CRISTOBAL',
      parroquia: 'PUERTO BAQUERIZO MORENO',
      codigoCiiu: 'A031101',
      numeroEstablecimiento: '1',
    });
  });

  it('recorta la hora de las fechas', () => {
    const { fila } = parsearFilaSri(FILA_OK);
    expect(fila!.fechaInicioActividades).toBe('2001-05-28');
    expect(fila!.fechaActualizacion).toBe('2024-08-29');
    expect(fila!.fechaSuspensionDefinitiva).toBeNull(); // venía vacía
  });

  it('convierte S/N en booleanos de COPY', () => {
    const { fila } = parsearFilaSri(FILA_OK.replace('|N|N', '|S|N'));
    expect(fila!.obligadoContabilidad).toBe('f');
    expect(fila!.agenteRetencion).toBe('t');
    expect(fila!.contribuyenteEspecial).toBe('f');
  });

  /**
   * El caso que justifica todo el parser de comillas. Es una fila REAL del
   * padrón de Azuay: la razón social lleva un `|` y viene entrecomillada, así
   * que un split a secas da 22 campos y corre todas las columnas una posición.
   */
  it('repara la fila con una barra dentro de la razón social', () => {
    const rota =
      '0101888055001|"VINTIMILLA VIVAR PEDRO JOSE|"|AZUAY|ACTIVO|GEN|1998-08-17 00:00:00|' +
      '2025-07-02 13:21:08||2019-04-09 00:00:00|N|PERSONA NATURAL|1||ABI|AZUAY|CUENCA|' +
      'TOTORACOCHA|N823000|ORGANIZACION DE CONVENCIONES.|N|N';

    expect(rota.split('|')).toHaveLength(NUM_CAMPOS + 1); // el split ingenuo falla
    const { fila, reparada, motivo } = parsearFilaSri(rota);

    expect(motivo).toBeUndefined();
    expect(reparada).toBe(true);
    // Lo importante: NADA queda corrido.
    expect(fila!.ruc).toBe('0101888055001');
    expect(fila!.razonSocial).toBe('VINTIMILLA VIVAR PEDRO JOSE|');
    expect(fila!.tipoContribuyente).toBe('PERSONA NATURAL'); // sin reparar sería "N"
    expect(fila!.provincia).toBe('AZUAY');
    expect(fila!.canton).toBe('CUENCA');
    expect(fila!.parroquia).toBe('TOTORACOCHA');
  });

  it('repara también la barra en mitad del nombre', () => {
    const rota =
      '0105644264001|"ORTIZ ALULIMA |SILVIA MARISOL"|AZUAY|SUSPENDIDO|GEN|2018-04-23 00:00:00|' +
      '|2018-04-23 00:00:00||N|PERSONA NATURAL|1||CER|AZUAY|CUENCA|HERMANO MIGUEL|G477205|' +
      'VENTA AL POR MENOR.|N|N';
    const { fila, reparada } = parsearFilaSri(rota);
    expect(reparada).toBe(true);
    expect(fila!.razonSocial).toBe('ORTIZ ALULIMA |SILVIA MARISOL');
    expect(fila!.estadoContribuyente).toBe('SUSPENDIDO');
  });

  it('rechaza la fila en vez de clasificarla mal si el tipo es desconocido', () => {
    const rara = FILA_OK.replace('|PERSONA NATURAL|', '|N|');
    const { fila, motivo } = parsearFilaSri(rara);
    expect(fila).toBeNull();
    expect(motivo).toContain('tipo_contribuyente_desconocido');
  });

  it('rechaza una fila sin RUC', () => {
    const { fila, motivo } = parsearFilaSri(FILA_OK.replace('0908867179001|', '|'));
    expect(fila).toBeNull();
    expect(motivo).toBe('ruc_vacio');
  });

  it('rechaza una fila irreparable', () => {
    const { fila, motivo } = parsearFilaSri('solo|tres|campos');
    expect(fila).toBeNull();
    expect(motivo).toContain('campos_inesperados');
  });

  it('distingue SOCIEDAD de PERSONA NATURAL', () => {
    const soc = FILA_OK.replace('|PERSONA NATURAL|', '|SOCIEDAD|');
    expect(parsearFilaSri(soc).fila!.tipoContribuyente).toBe('SOCIEDAD');
  });

  it('descarta una fecha imposible en vez de reventar el COPY', () => {
    const { fila } = parsearFilaSri(FILA_OK.replace('2001-05-28 00:00:00', '2024-02-31 00:00:00'));
    expect(fila!.fechaInicioActividades).toBeNull();
  });
});
