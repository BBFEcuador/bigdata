import {
  clasificarContacto,
  fecha,
  fechaHoraLocal,
  parsearRespuestas,
} from './dataportal.parser';

/**
 * Las respuestas son las REALES de la API para el RUC 1790013731001
 * (ACEITES TROPICALES), capturadas del navegador. Nada inventado.
 */
const CRUDAS = {
  ruc: {
    ruc: '1790013731001 ',
    razonSocial: 'ACEITES TROPICALES S. A. ATSA',
    nombreComercial: '',
    nombreComercial2: '',
    estadoContribuyente: 'ACTIVO',
    fechaInicioActividades: '1975-03-17 00:00:00',
    fechaSupencionDefinitiva: '',
    actividadEconomica: 'CULTIVO DE PALMAS DE ACEITE (PALMA AFRICANA).',
    provincia: 'SANTO DOMINGO DE LOS TSACHILAS',
    direccion: 'VIA A ESMERALDAS S/N',
    telefono: '022762426',
  },
  contacto: [
    { contacto: '0999473756', tipo: '8' },
    { contacto: 'aceitestropicales.sa@gmail.com', tipo: '3' },
  ],
  nomina: [
    {
      dni: '1714924469 ',
      nombre: 'TUBAY CARREÃ‘O EMILIO GREGORIO',
      sueldo: '482',
      fechaIngreso: '01/11/2005',
      ocupacion: 'TRABAJADOR DEL AGRO: CORTE Y RECOLECCIÃ“N DE RACIMOS',
    },
    {
      dni: '1713472866 ',
      nombre: 'ACOSTA LLERENA JUAN CARLOS',
      sueldo: '1000',
      fechaIngreso: '01/07/2013',
      ocupacion: 'GERENTE / AFINES',
    },
  ],
  carro: {
    vehicle: [
      {
        carRegistration: 'JBA0833',
        brand: 'CHEVROLET',
        model: 'FVR 32P 7.1 2P 4X2 TM DIESEL',
        cylinderCapacity: '7127',
        vehicleType: 'VEHICULO ESPECIAL',
        dateOfLastCarRegistration: '30/4/2026',
        yearofPayment: '2025',
        appraisalValue: '6367',
        subClassName: 'aceitestropicales.sa@gmail.com',
        year: '2008',
        city: 'SANTO DOMINGO',
      },
    ],
  },
  propiedades: {
    propiedades: [
      {
        cedulaCatastral: ' CAT-001 ',
        parroquia: 'CENTRO',
        codigoCalle: 'C01',
        callePrincipal: 'AV. UNO',
        numero: '10',
        barrioSector: 'NORTE',
        zona: 'URBANA',
        telefono: '02222',
      },
    ],
  },
};

const RUC = '1790013731001';

describe('parsearRespuestas', () => {
  const r = parsearRespuestas(RUC, CRUDAS);

  it('lee los datos principales de la empresa', () => {
    expect(r.empresa).toMatchObject({
      ruc: RUC,
      razon_social: 'ACEITES TROPICALES S. A. ATSA',
      estado_contribuyente: 'ACTIVO',
      fecha_inicio: '1975-03-17',
      provincia: 'SANTO DOMINGO DE LOS TSACHILAS',
      telefono: '022762426',
    });
  });

  it('deja en null los campos vacíos en vez de guardar cadenas vacías', () => {
    expect(r.empresa!.nombre_comercial).toBeNull();
    expect(r.empresa!.fecha_suspension).toBeNull();
  });

  it('deriva el número de empleados y la masa salarial de la nómina', () => {
    // La API no devuelve el conteo: sale de las filas de nómina.
    expect(r.empresa!.num_empleados).toBe(2);
    expect(r.empresa!.masa_salarial).toBe(1482);
  });

  it('clasifica los contactos por su contenido, no por el código de la API', () => {
    expect(r.contactos).toEqual([
      { ruc: RUC, valor: '0999473756', tipo: 'telefono', tipo_codigo: '8' },
      {
        ruc: RUC,
        valor: 'aceitestropicales.sa@gmail.com',
        tipo: 'email',
        tipo_codigo: '3',
      },
    ]);
  });

  it('repara el mojibake de los nombres y ocupaciones de la nómina', () => {
    expect(r.nomina[0].nombre).toBe('TUBAY CARREÑO EMILIO GREGORIO');
    expect(r.nomina[0].ocupacion).toBe(
      'TRABAJADOR DEL AGRO: CORTE Y RECOLECCIÓN DE RACIMOS',
    );
  });

  it('recorta el espacio final que la API deja en todas las cédulas', () => {
    expect(r.nomina.map((n) => n.cedula)).toEqual(['1714924469', '1713472866']);
  });

  it('encuentra al gerente en la nómina', () => {
    const gerente = r.nomina.find((n) => n.ocupacion?.startsWith('GERENTE'));
    expect(gerente).toMatchObject({
      cedula: '1713472866',
      nombre: 'ACOSTA LLERENA JUAN CARLOS',
      sueldo: 1000,
      fecha_ingreso: '2013-07-01',
    });
  });

  it('lee los vehículos y NO guarda el campo subClassName', () => {
    expect(r.vehiculos[0]).toEqual({
      ruc: RUC,
      placa: 'JBA0833',
      tipo: 'VEHICULO ESPECIAL',
      marca: 'CHEVROLET',
      modelo: 'FVR 32P 7.1 2P 4X2 TM DIESEL',
      anio: 2008,
      lugar: 'SANTO DOMINGO',
      fecha_vencimiento: '2026-04-30 00:00:00',
    });
    // El portal mete un correo en `subClassName`; guardarlo como "subclase"
    // sería propagar su error.
    expect(JSON.stringify(r.vehiculos[0])).not.toContain('@');
  });

  it('transforma propiedades tipadas y exige cédula catastral', () => {
    expect(r.propiedades).toEqual([
      {
        ruc: RUC,
        cedula_catastral: 'CAT-001',
        parroquia: 'CENTRO',
        codigo_calle: 'C01',
        calle_principal: 'AV. UNO',
        numero: '10',
        barrio_sector: 'NORTE',
        zona: 'URBANA',
        telefono: '02222',
      },
    ]);
    expect(
      parsearRespuestas(RUC, { propiedades: [{ parroquia: 'CENTRO' }] })
        .propiedades,
    ).toEqual([]);
  });

  it('no se rompe con una respuesta vacía o con un RUC desconocido', () => {
    const vacio = parsearRespuestas(RUC, {});
    expect(vacio.empresa).toBeNull();
    expect(vacio.contactos).toEqual([]);
    expect(vacio.nomina).toEqual([]);
    expect(vacio.vehiculos).toEqual([]);
  });

  it('tolera que un endpoint devuelva un error en vez de una lista', () => {
    const raro = parsearRespuestas(RUC, {
      ruc: CRUDAS.ruc,
      nomina: { code: 'rest_no_route', message: 'No existe' },
      carro: null,
      contacto: 'texto suelto',
    });
    expect(raro.empresa).not.toBeNull();
    expect(raro.nomina).toEqual([]);
    expect(raro.vehiculos).toEqual([]);
    expect(raro.contactos).toEqual([]);
  });

  it('descarta filas duplicadas, que romperían la clave primaria', () => {
    const dup = parsearRespuestas(RUC, {
      ...CRUDAS,
      nomina: [CRUDAS.nomina[0], CRUDAS.nomina[0]],
      contacto: [CRUDAS.contacto[0], CRUDAS.contacto[0]],
    });
    expect(dup.nomina).toHaveLength(1);
    expect(dup.contactos).toHaveLength(1);
  });
});

describe('fechaHoraLocal', () => {
  it('normaliza fecha y hora sin inventar zona horaria', () => {
    expect(fechaHoraLocal('2/8/2026 7:05:09')).toBe('2026-08-02 07:05:09');
    expect(fechaHoraLocal('31/02/2026 10:00:00')).toBeNull();
  });
});

describe('fecha', () => {
  it('admite los dos formatos que mezcla el portal', () => {
    expect(fecha('1975-03-17 00:00:00')).toBe('1975-03-17');
    expect(fecha('01/11/2005')).toBe('2005-11-01');
    expect(fecha('30/4/2026')).toBe('2026-04-30'); // sin ceros de relleno
  });

  it('rechaza fechas imposibles en vez de dejar que revienten el INSERT', () => {
    expect(fecha('31/02/2024')).toBeNull();
    expect(fecha('2024-02-31')).toBeNull();
    expect(fecha('')).toBeNull();
    expect(fecha(null)).toBeNull();
    expect(fecha('sin fecha')).toBeNull();
  });
});

describe('clasificarContacto', () => {
  it('distingue correo de teléfono', () => {
    expect(clasificarContacto('aceitestropicales.sa@gmail.com')).toBe('email');
    expect(clasificarContacto('0999473756')).toBe('telefono');
    expect(clasificarContacto('+593 99 947 3756')).toBe('telefono');
    expect(clasificarContacto('no-es-nada')).toBe('otro');
  });
});
