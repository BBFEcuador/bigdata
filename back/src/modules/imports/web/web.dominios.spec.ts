import { candidatos, dominioDeCorreo, etiquetas, palabrasUtiles } from './web.dominios';

describe('palabrasUtiles', () => {
  it('quita sufijos societarios y artículos', () => {
    expect(palabrasUtiles('FERRETERIA GONZALEZ CIA. LTDA.')).toEqual(['ferreteria', 'gonzalez']);
    expect(palabrasUtiles('INDUSTRIAS DE LA COSTA S.A.')).toEqual(['industrias', 'costa']);
  });

  it('quita tildes y eñes', () => {
    expect(palabrasUtiles('CARREÑO & ASOCIADOS')).toEqual(['carreno', 'asociados']);
  });
});

describe('dominioDeCorreo', () => {
  it('acepta un dominio propio', () => {
    expect(dominioDeCorreo('ventas@ferremax.com.ec')).toBe('ferremax.com.ec');
  });

  // El filtro más importante del módulo: sin él, gmail.com entraría como
  // "sitio web" de las miles de compañías que dan un Gmail de contacto.
  it('rechaza los proveedores de correo gratuito', () => {
    expect(dominioDeCorreo('acme.ecuador@gmail.com')).toBeNull();
    expect(dominioDeCorreo('info@hotmail.es')).toBeNull();
    expect(dominioDeCorreo('gerencia@andinanet.net')).toBeNull();
  });

  it('rechaza lo que no es un correo', () => {
    expect(dominioDeCorreo('no-es-un-correo')).toBeNull();
    expect(dominioDeCorreo('')).toBeNull();
    expect(dominioDeCorreo(null)).toBeNull();
  });
});

describe('etiquetas', () => {
  it('forma el slug completo y las palabras distintivas', () => {
    expect(etiquetas('FERREMAX ECUADOR CIA LTDA')).toContain('ferremaxecuador');
    expect(etiquetas('FERREMAX ECUADOR CIA LTDA')).toContain('ferremax');
  });

  // "COMERCIAL ANDRADE" no está en comercial.com.ec; ese dominio es de otro.
  // La palabra genérica sigue valiendo dentro del slug completo.
  it('no propone una palabra genérica ella sola', () => {
    const e = etiquetas('COMERCIAL ANDRADE CIA LTDA');
    expect(e).toContain('comercialandrade');
    expect(e).not.toContain('comercial');
    expect(e).toContain('andrade');
  });

  it('descarta etiquetas demasiado cortas', () => {
    expect(etiquetas('ABC S.A.')).toEqual([]);
  });
});

describe('candidatos', () => {
  it('pone el dominio del correo el primero', () => {
    const c = candidatos({
      nombre: 'FERRETERIA GONZALEZ CIA LTDA',
      nombreComercial: 'FERREMAX',
      correo: 'ventas@ferremax.com.ec',
    });
    expect(c[0]).toMatchObject({ dominio: 'ferremax.com.ec', origen: 'correo' });
  });

  // El nombre comercial va antes que la razón social porque es el que se parece
  // al dominio: 97.558 compañías tienen uno distinto del nombre legal.
  it('antepone el nombre comercial a la razón social', () => {
    const c = candidatos({ nombre: 'FERRETERIA GONZALEZ CIA LTDA', nombreComercial: 'FERREMAX' });
    const primeroComercial = c.findIndex((x) => x.origen === 'comercial');
    const primeroRazon = c.findIndex((x) => x.origen === 'razon_social');
    expect(primeroComercial).toBeLessThan(primeroRazon);
  });

  it('prueba .com.ec antes que .ec', () => {
    const c = candidatos({ nombre: 'FERREMAX CIA LTDA' });
    const comEc = c.findIndex((x) => x.dominio === 'ferremax.com.ec');
    const ec = c.findIndex((x) => x.dominio === 'ferremax.ec');
    expect(comEc).toBeGreaterThanOrEqual(0);
    expect(comEc).toBeLessThan(ec);
  });

  // Medido: «nombre comercial × .com» acertó 10 veces y falló 59 — dos tercios
  // de todos los falsos positivos. El .com de un nombre común es de otro.
  it('no conjetura .com a partir del nombre', () => {
    const c = candidatos({ nombre: 'FERREMAX CIA LTDA', nombreComercial: 'FERREMAX' });
    expect(c.every((x) => !x.dominio.endsWith('.com'))).toBe(true);
  });

  // Pero un .com que viene de un correo no es una conjetura: lo escribió la
  // empresa. Ahí acertó 19 de 26.
  it('sí acepta un .com si viene del correo', () => {
    const c = candidatos({ nombre: 'FERREMAX CIA LTDA', correo: 'ventas@ferremax.com' });
    expect(c[0]).toMatchObject({ dominio: 'ferremax.com', origen: 'correo' });
  });

  it('no repite dominios ni pasa del tope', () => {
    const c = candidatos({
      nombre: 'ALFA BETA GAMMA DELTA EPSILON ZETA CIA LTDA',
      nombreComercial: 'ALFA BETA GAMMA DELTA EPSILON ZETA',
    });
    expect(c.length).toBeLessThanOrEqual(8);
    expect(new Set(c.map((x) => x.dominio)).size).toBe(c.length);
  });

  it('no revienta con un nombre sin palabras útiles', () => {
    expect(candidatos({ nombre: 'S.A.' })).toEqual([]);
  });
});
