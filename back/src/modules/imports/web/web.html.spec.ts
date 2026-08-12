import { extraerDescripcion, extraerSociales, extraerTitulo, leer } from './web.html';

const PAGINA = `
<html><head>
  <title>  Ferremax — Ferretería en Guayaquil  </title>
  <meta property="og:description" content="Todo para la construcción desde 1998." />
</head><body>
  <p>FERRETERIA GONZALEZ CIA. LTDA. · RUC 0992345678001</p>
  <a href="https://www.facebook.com/sharer.php?u=https://ferremax.com.ec">Compartir</a>
  <a href="https://www.facebook.com/ferremaxec">Facebook</a>
  <a href="https://instagram.com/ferremax.ec/">Instagram</a>
  <a href="https://www.linkedin.com/company/ferremax-ecuador">LinkedIn</a>
  <a href="https://www.tiktok.com/@ferremaxec">TikTok</a>
  <a href="https://twitter.com/intent/tweet?text=hola">Tuitear</a>
  <a href="https://x.com/ferremaxec">X</a>
  <a href="https://wa.me/593999123456">WhatsApp</a>
  <a href="https://www.youtube.com/@ferremaxec">YouTube</a>
  <a href="https://facebook.com/ferremaxec">Facebook otra vez</a>
</body></html>`;

describe('extraerTitulo', () => {
  it('recorta espacios', () => {
    expect(extraerTitulo(PAGINA)).toBe('Ferremax — Ferretería en Guayaquil');
  });

  it('devuelve null si no hay título', () => {
    expect(extraerTitulo('<html><body>hola</body></html>')).toBeNull();
  });
});

describe('extraerDescripcion', () => {
  it('prefiere la de Open Graph', () => {
    expect(extraerDescripcion(PAGINA)).toBe('Todo para la construcción desde 1998.');
  });
});

describe('extraerSociales', () => {
  const s = extraerSociales(PAGINA);
  const red = (r: string) => s.filter((x) => x.red === r);

  // El caso que hunde a un extractor ingenuo: casi toda web lleva un botón de
  // "compartir en Facebook", y sharer.php NO es la página de la empresa.
  it('ignora los botones de compartir', () => {
    expect(red('facebook').map((x) => x.url)).toEqual(['https://facebook.com/ferremaxec']);
    expect(red('x').map((x) => x.url)).toEqual(['https://x.com/ferremaxec']);
  });

  it('deduplica el mismo perfil enlazado varias veces', () => {
    expect(red('facebook')).toHaveLength(1);
  });

  it('saca el handle de cada red', () => {
    expect(red('instagram')[0]).toMatchObject({ handle: 'ferremax.ec' });
    expect(red('linkedin')[0]).toMatchObject({ handle: 'ferremax-ecuador' });
    expect(red('tiktok')[0]).toMatchObject({ handle: 'ferremaxec' });
    expect(red('youtube')[0]).toMatchObject({ handle: '@ferremaxec' });
  });

  // El enlace más valioso de la página: un móvil que no está en ningún registro.
  it('saca el número del enlace de WhatsApp', () => {
    expect(red('whatsapp')[0]).toMatchObject({ handle: '593999123456' });
  });

  it('ignora el enlace a la portada de la red', () => {
    expect(extraerSociales('<a href="https://facebook.com/">fb</a>')).toEqual([]);
  });

  it('no revienta con un href malformado', () => {
    expect(() => extraerSociales('<a href="http://[[[">x</a>')).not.toThrow();
  });
});

describe('leer', () => {
  it('detecta que el nombre de la compañía aparece en la página', () => {
    expect(leer(PAGINA, ['FERRETERIA GONZALEZ']).nombreEnPagina).toBe(true);
    expect(leer(PAGINA, ['PANADERIA SANTA MARIA']).nombreEnPagina).toBe(false);
  });

  it('ignora el texto de los scripts al buscar el nombre', () => {
    const html = '<html><script>var x = "PANADERIA SANTA MARIA";</script><body>otra cosa</body></html>';
    expect(leer(html, ['PANADERIA SANTA MARIA']).nombreEnPagina).toBe(false);
  });

  // Un dominio en venta no es una web de empresa. Filtrarlo evita llenar de
  // ruido la cola de quien revisa a mano.
  it('reconoce un dominio aparcado', () => {
    expect(leer('<html><body>This domain is for sale</body></html>', []).aparcado).toBe(true);
    expect(leer('<html><body>Welcome to nginx!</body></html>', []).aparcado).toBe(true);
    expect(leer(PAGINA, []).aparcado).toBe(false);
  });
});
