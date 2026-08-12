import { deaccent } from '../../../common/text/normalize';

/**
 * Lectura del HTML de una página: título, descripción, enlaces a redes y unos
 * pocos indicios para quien luego revise.
 *
 * Funciones puras sobre una cadena: se prueban sin red.
 *
 * **Esto no decide nada.** No hay aquí ninguna regla que acepte o rechace un
 * sitio: lo que sale de aquí se guarda como propuesta y la valida una persona.
 * Lo único que se filtra es lo que no es una web de empresa en absoluto — un
 * dominio en venta —, porque colar eso en la cola de revisión es hacerle perder
 * el tiempo al revisor, no ayudarle.
 */

export type Red =
  | 'facebook'
  | 'instagram'
  | 'linkedin'
  | 'tiktok'
  | 'x'
  | 'youtube'
  | 'whatsapp'
  | 'telegram';

export interface EnlaceSocial {
  red: Red;
  url: string;
  handle: string | null;
}

export interface Lectura {
  titulo: string | null;
  descripcion: string | null;
  sociales: EnlaceSocial[];
  /** El nombre de la compañía aparece en el texto de la página. */
  nombreEnPagina: boolean;
  /** La página es un aparcamiento de dominio, no un sitio real. */
  aparcado: boolean;
}

/** Textos que delatan un dominio aparcado o en venta. */
const APARCADO = [
  'this domain is for sale',
  'domain is for sale',
  'dominio en venta',
  'buy this domain',
  'comprar este dominio',
  'parked free, courtesy of',
  'sedoparking',
  'domain parking',
  'godaddy.com/domainsearch',
  'the domain you are looking for',
  'sitio en construccion',
  'under construction',
  'default web page',
  'apache2 ubuntu default page',
  'welcome to nginx',
  'index of /',
];

/**
 * Cómo se reconoce cada red y cómo se saca el nombre de la cuenta.
 *
 * Las rutas excluidas son la parte que importa: casi todas las webs llevan
 * botones de "compartir en Facebook", y `facebook.com/sharer.php?u=…` NO es la
 * página de la empresa — sin este filtro, la mitad de las compañías acabaría
 * con el mismo Facebook falso.
 */
const REDES: Array<{
  red: Red;
  hosts: string[];
  excluir: RegExp;
  handle?: (ruta: string) => string | null;
}> = [
  {
    red: 'facebook',
    hosts: ['facebook.com', 'fb.com', 'fb.me', 'm.facebook.com', 'web.facebook.com'],
    excluir: /^\/(sharer|share|dialog|plugins|tr|login|help|policies|privacy)\b/i,
    handle: (r) => primerSegmento(r),
  },
  {
    red: 'instagram',
    hosts: ['instagram.com'],
    excluir: /^\/(p|reel|explore|accounts|share)\b/i,
    handle: (r) => primerSegmento(r),
  },
  {
    red: 'linkedin',
    hosts: ['linkedin.com'],
    // `shareArticle` es el botón de compartir; `/company/` y `/in/` sí valen.
    excluir: /^\/(shareArticle|sharing|share|feed|login|legal)\b/i,
    handle: (r) => {
      const m = /^\/(company|in|school)\/([^/?#]+)/i.exec(r);
      return m ? m[2] : primerSegmento(r);
    },
  },
  {
    red: 'tiktok',
    hosts: ['tiktok.com'],
    excluir: /^\/(share|embed|login|legal)\b/i,
    handle: (r) => {
      const m = /^\/@([^/?#]+)/.exec(r);
      return m ? m[1] : null;
    },
  },
  {
    red: 'x',
    hosts: ['twitter.com', 'x.com'],
    excluir: /^\/(intent|share|home|search|hashtag|i|privacy|tos)\b/i,
    handle: (r) => primerSegmento(r),
  },
  {
    red: 'youtube',
    hosts: ['youtube.com', 'youtu.be'],
    excluir: /^\/(watch|embed|results|feed|playlist|shorts)\b/i,
    handle: (r) => {
      const m = /^\/(@[^/?#]+)|^\/(?:channel|c|user)\/([^/?#]+)/.exec(r);
      return m ? (m[1] ?? m[2]) : null;
    },
  },
  {
    // Un `wa.me/593999999999` es un móvil que no está en ningún registro
    // público. Es, comercialmente, el enlace más valioso de la página.
    red: 'whatsapp',
    hosts: ['wa.me', 'api.whatsapp.com', 'web.whatsapp.com', 'chat.whatsapp.com'],
    excluir: /^\/(?!)/, // nada que excluir
    handle: (r) => {
      const m = /(\d{7,15})/.exec(r);
      return m ? m[1] : null;
    },
  },
  {
    red: 'telegram',
    hosts: ['t.me', 'telegram.me'],
    excluir: /^\/(share|joinchat)\b/i,
    handle: (r) => primerSegmento(r),
  },
];

function primerSegmento(ruta: string): string | null {
  const m = /^\/([^/?#]+)/.exec(ruta);
  if (!m) return null;
  return m[1].replace(/^@/, '') || null;
}

/** Título de la página, sin entidades ni espacios sobrantes. */
export function extraerTitulo(html: string): string | null {
  const m = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(html);
  return m ? limpiar(m[1]) : null;
}

/** Descripción: primero la de Open Graph, que suele estar mejor escrita. */
export function extraerDescripcion(html: string): string | null {
  const og = /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{0,500})["']/i.exec(html);
  if (og) return limpiar(og[1]);
  const meta = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,500})["']/i.exec(html);
  return meta ? limpiar(meta[1]) : null;
}

/**
 * Los perfiles de redes enlazados desde la página.
 *
 * Se recorren los `href` en vez de buscar el nombre de la red en el texto: un
 * "síguenos en Instagram" sin enlace no sirve de nada, y el enlace es
 * exactamente el dato que se quiere guardar.
 *
 * Se deduplica por (red, url) manteniendo el primero: el enlace del pie suele
 * repetirse en cada plantilla de la página.
 */
export function extraerSociales(html: string): EnlaceSocial[] {
  const vistos = new Set<string>();
  const salida: EnlaceSocial[] = [];

  for (const m of html.matchAll(/href\s*=\s*["']([^"']{5,300})["']/gi)) {
    const crudo = m[1].trim();
    if (!/^https?:\/\//i.test(crudo) && !crudo.startsWith('//')) continue;

    let url: URL;
    try {
      url = new URL(crudo.startsWith('//') ? `https:${crudo}` : crudo);
    } catch {
      continue;
    }

    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const def = REDES.find((r) => r.hosts.includes(host));
    if (!def) continue;

    const ruta = url.pathname;
    if (ruta === '/' || ruta === '') continue; // el enlace a la red, no a una cuenta
    if (def.excluir.test(ruta)) continue;

    // Sin query ni fragmento: `?fbclid=…` y `#top` convertirían el mismo perfil
    // en filas distintas cada vez que se rastree.
    const limpia =
      def.red === 'whatsapp'
        ? `https://${host}${ruta}${url.search}` // aquí el número puede ir en la query
        : `https://${host}${ruta.replace(/\/+$/, '')}`;

    const handle = def.handle ? def.handle(`${ruta}${url.search}`) : null;
    const clave = `${def.red}|${limpia.toLowerCase()}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push({ red: def.red, url: limpia, handle });
  }

  return salida;
}

/** Todo lo que se saca de una página, de una pasada. */
export function leer(html: string, nombres: string[]): Lectura {
  const texto = aTextoPlano(html);
  const plano = deaccent(texto).toLowerCase();

  return {
    titulo: extraerTitulo(html),
    descripcion: extraerDescripcion(html),
    sociales: extraerSociales(html),
    nombreEnPagina: nombres.some((n) => {
      const norm = deaccent(n).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
      return norm.length >= 6 && plano.includes(norm);
    }),
    aparcado: APARCADO.some((marca) => plano.includes(marca)),
  };
}

/** Quita scripts, estilos y etiquetas. Basta para buscar texto dentro. */
function aTextoPlano(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ');
}

function limpiar(valor: string): string | null {
  const t = valor
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > 0 ? t.slice(0, 300) : null;
}
