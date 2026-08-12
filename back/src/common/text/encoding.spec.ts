import { decodificarTexto } from './encoding';

describe('decodificarTexto', () => {
  it('detecta UTF-8 en texto ASCII puro', () => {
    const { texto, encoding } = decodificarTexto(Buffer.from('1\tACTIVO', 'utf8'));
    expect(texto).toBe('1\tACTIVO');
    expect(encoding).toBe('utf-8');
  });

  it('detecta y conserva UTF-8 con acentos', () => {
    const { texto, encoding } = decodificarTexto(Buffer.from('PÚBLICAS COMPAÑÍA', 'utf8'));
    expect(texto).toBe('PÚBLICAS COMPAÑÍA');
    expect(encoding).toBe('utf-8');
  });

  it('retira el BOM', () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('1\tACTIVO', 'utf8')]);
    const { texto, encoding } = decodificarTexto(buf);
    expect(texto).toBe('1\tACTIVO');
    expect(encoding).toBe('utf-8-bom');
    expect(texto.charCodeAt(0)).toBe('1'.charCodeAt(0)); // sin U+FEFF delante
  });

  it('cae a Latin-1 cuando el buffer no es UTF-8 válido', () => {
    // Así viene el archivo real de la Superintendencia: 0xDA = Ú en Latin-1,
    // que como UTF-8 es una secuencia inválida.
    const buf = Buffer.from([0x50, 0xda, 0x42, 0x4c, 0x49, 0x43, 0x41, 0x53]); // PÚBLICAS
    const { texto, encoding } = decodificarTexto(buf);
    expect(encoding).toBe('latin1');
    expect(texto).toBe('PÚBLICAS');
  });

  it('decodifica todas las mayúsculas acentuadas del español', () => {
    // 0xC1 0xC9 0xCD 0xD1 0xD3 0xDA son los únicos bytes altos del archivo real.
    const buf = Buffer.from([0xc1, 0xc9, 0xcd, 0xd1, 0xd3, 0xda]);
    expect(decodificarTexto(buf).texto).toBe('ÁÉÍÑÓÚ');
  });

  it('no deja el carácter de reemplazo al leer Latin-1', () => {
    const buf = Buffer.from([0x43, 0x4f, 0x4d, 0x50, 0x41, 0xd1, 0xcd, 0x41, 0x53]); // COMPAÑÍAS
    const { texto } = decodificarTexto(buf);
    expect(texto).toBe('COMPAÑÍAS');
    expect(texto).not.toContain('�');
  });
});
