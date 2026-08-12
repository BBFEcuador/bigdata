import { deaccent } from '../../../common/text/normalize';

/**
 * Generación de dominios candidatos a partir de lo que ya sabemos de una
 * compañía. Funciones puras: se prueban sin red y sin base de datos.
 *
 * No busca en ningún sitio. Conjetura dominios, y de conjeturar a afirmar hay
 * un paso que da el verificador, no esto.
 */

export type OrigenCandidato = 'correo' | 'comercial' | 'razon_social';

export interface Candidato {
  dominio: string;
  origen: OrigenCandidato;
  /** Menor es antes. El orden importa: se para en la primera confirmación. */
  orden: number;
}

/**
 * TLD por los que se prueba un nombre, en orden.
 *
 * **`.com` no está, y es una decisión medida, no una precaución.** En la
 * calibración contra 100 compañías con web conocida, la combinación «nombre
 * comercial × `.com`» acertó 10 veces y se equivocó 59: dos tercios de todos
 * los falsos positivos del rastreo salían de ahí. `HOSTERIA LA PRIMAVERA`
 * aterrizaba en `oracle.com` y `ASERLACO` en `crepes.com`.
 *
 * El `.com` sigue valiendo cuando el dominio viene de un correo, que es otra
 * cosa: ahí no se adivina nada, lo escribió la empresa.
 */
const TLDS = ['com.ec', 'ec'] as const;

/**
 * Proveedores de correo gratuito.
 *
 * Es el filtro más importante del módulo. Sin él, `gmail.com` entraría como
 * "sitio web" de las miles de compañías cuyo correo de contacto es un Gmail, y
 * además lo haría con la prueba fuerte desactivada — quedaría un dato
 * catastrófico con toda la apariencia de estar verificado.
 */
const CORREO_GRATUITO = new Set([
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'hotmail.es',
  'outlook.com',
  'outlook.es',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.es',
  'ymail.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'zoho.com',
  'gmx.com',
  'mail.com',
  'andinanet.net', // el ISP histórico de Ecuador: correos personales, no dominios propios
  'yahoo.com.mx',
  'hotmail.com.ar',
]);

/**
 * Palabras que se quitan del nombre antes de formar el slug.
 *
 * Los sufijos societarios sobran siempre ("cia", "ltda", "sa"), y los artículos
 * y preposiciones no aparecen en los dominios reales.
 */
const RUIDO = new Set([
  'cia', 'compania', 'companialtda', 'ltda', 'limitada',
  'sa', 'sas', 'ca', 'sociedad', 'anonima', 'civil', 'mercantil',
  'del', 'de', 'la', 'las', 'el', 'los', 'y', 'e', 'and', 'the',
  's', 'a', 'c', 'l',
]);

/**
 * Palabras demasiado genéricas para formar un dominio ellas solas.
 *
 * "COMERCIAL ANDRADE CIA LTDA" no está en `comercial.com.ec`; ese dominio es de
 * otro. Estas palabras siguen valiendo dentro del slug completo, pero no como
 * candidato de una sola palabra.
 */
const GENERICAS = new Set([
  'comercial', 'comercializadora', 'servicios', 'servicio', 'importadora',
  'exportadora', 'distribuidora', 'constructora', 'construcciones', 'inmobiliaria',
  'consultora', 'consultores', 'asesores', 'asociados', 'hermanos', 'grupo',
  'corporacion', 'corporativo', 'empresa', 'negocios', 'inversiones', 'proyectos',
  'soluciones', 'sistemas', 'tecnologia', 'industrias', 'industrial', 'productos',
  'agricola', 'ganadera', 'transportes', 'transporte', 'turismo', 'ecuador',
  'internacional', 'nacional', 'global', 'general', 'centro', 'casa', 'hotel',
  'restaurante', 'farmacia', 'ferreteria', 'clinica', 'laboratorio', 'estudio',
]);

/** Cuántos dominios se prueban como mucho por compañía. */
const MAX_CANDIDATOS = 8;

/**
 * Parte el nombre en palabras útiles: sin tildes, sin puntuación, sin sufijos
 * societarios y sin artículos.
 */
export function palabrasUtiles(nombre: string): string[] {
  return deaccent(nombre)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((p) => p.length > 0 && !RUIDO.has(p));
}

/**
 * Dominio de un correo, si es un dominio propio.
 *
 * Devuelve `null` para los proveedores gratuitos: `ventas@gmail.com` no dice
 * nada del sitio de la empresa, mientras que `ventas@ferremax.com.ec` lo dice
 * casi todo.
 */
export function dominioDeCorreo(correo: string | null | undefined): string | null {
  if (!correo) return null;
  const arroba = correo.trim().toLowerCase().split('@');
  if (arroba.length !== 2) return null;
  const dominio = arroba[1].replace(/[^a-z0-9.-]/g, '');
  if (!dominio.includes('.') || dominio.length < 4) return null;
  if (CORREO_GRATUITO.has(dominio)) return null;
  return dominio;
}

/**
 * Los dominios que vale la pena probar para una compañía, en orden de
 * probabilidad.
 *
 * El orden no es cosmético: el bucle se detiene en la primera confirmación
 * fuerte, así que poner el dominio del correo delante ahorra la mayoría de las
 * peticiones de las compañías que sí tienen web.
 *
 * El nombre comercial del SRI va antes que la razón social por una razón que se
 * ve en los datos: "FERRETERÍA GONZÁLEZ CÍA. LTDA." no es dominio de nada, y su
 * nombre comercial "FERREMAX" sí. De las 226.191 compañías, 97.558 tienen un
 * nombre comercial distinto de la razón social.
 *
 * Y el orden importa mucho más de lo que parecía: en la calibración, el dominio
 * del correo acertó 32 de 40 veces (80 %) mientras que todo lo derivado del
 * nombre junto acertó 11 de 87. La razón social, ella sola, acertó **cero de
 * siete**. Por eso lo del nombre se propone bajo condición y lo del correo no
 * — ver `WebImportService.proponer`.
 */
export function candidatos(entrada: {
  nombre: string;
  nombreComercial?: string | null;
  correo?: string | null;
}): Candidato[] {
  const vistos = new Set<string>();
  const salida: Candidato[] = [];

  const anadir = (dominio: string, origen: OrigenCandidato) => {
    if (salida.length >= MAX_CANDIDATOS) return;
    if (!dominio || vistos.has(dominio)) return;
    vistos.add(dominio);
    salida.push({ dominio, origen, orden: salida.length });
  };

  const delCorreo = dominioDeCorreo(entrada.correo);
  if (delCorreo) anadir(delCorreo, 'correo');

  const fuentes: Array<[string | null | undefined, OrigenCandidato]> = [
    [entrada.nombreComercial, 'comercial'],
    [entrada.nombre, 'razon_social'],
  ];

  for (const [texto, origen] of fuentes) {
    if (!texto) continue;
    for (const etiqueta of etiquetas(texto)) {
      for (const tld of TLDS) anadir(`${etiqueta}.${tld}`, origen);
    }
  }

  return salida;
}

/**
 * Las etiquetas (la parte a la izquierda del punto) que se prueban para un
 * nombre.
 *
 * Dos reglas, medidas contra las 1.675 compañías cuya web ya conocemos por el
 * catastro de turismo: el slug completo acierta en el 32 % y una sola palabra
 * significativa en el 19 %; juntas, en el 40 %.
 */
export function etiquetas(nombre: string): string[] {
  const pal = palabrasUtiles(nombre);
  if (pal.length === 0) return [];

  const salida: string[] = [];
  const anadir = (e: string) => {
    if (e.length >= 4 && e.length <= 30 && !salida.includes(e)) salida.push(e);
  };

  // Todas las palabras juntas: "ferremaxecuador".
  anadir(pal.join(''));

  // Las dos primeras: los nombres largos suelen acortarse por delante.
  if (pal.length > 2) anadir(pal.slice(0, 2).join(''));

  // Una sola palabra, si es distintiva. El filtro de genéricas es lo que evita
  // que 3.000 compañías compartan el candidato "constructora.com.ec".
  for (const p of pal) {
    if (p.length >= 5 && !GENERICAS.has(p)) anadir(p);
  }

  return salida;
}
