import { Logger } from '@nestjs/common';
import { promises as dns } from 'node:dns';

/**
 * Cliente para comprobar dominios candidatos.
 *
 * Aquí no se busca nada en ningún buscador: se resuelve un dominio, se pide su
 * portada y se lee. Todo está pensado para un recorrido largo contra miles de
 * servidores ajenos, así que el ritmo, los tiempos de espera y el tamaño máximo
 * de descarga son parte del contrato, no detalles.
 */

/** Peticiones HTTP por segundo, en total (no por dominio). */
const RITMO_POR_SEGUNDO = Number(process.env.WEB_RPS ?? 8);

/**
 * Cuánto se lee como máximo de una página.
 *
 * Sin este tope, un único dominio sirviendo un vídeo con `Content-Type:
 * text/html` se lleva la memoria del proceso por delante. Con 512 KB sobra: el
 * `<head>` y el pie —que es donde están el título y los enlaces sociales— están
 * mucho antes.
 */
const MAX_BYTES = 512 * 1024;

const TIMEOUT_MS = Number(process.env.WEB_TIMEOUT_MS ?? 10_000);

/**
 * Quién dice ser este proceso.
 *
 * Identificarse no es cortesía: un administrador que ve tráfico raro en sus
 * logs tiene que poder saber qué es y a quién escribir, y si no puede, lo que
 * hace es bloquear el rango entero.
 */
const USER_AGENT =
  process.env.WEB_USER_AGENT ??
  'FRIDAY-webcheck/1.0 (verificacion de presencia digital de empresas; contacto: WEB_USER_AGENT en back/.env)';

export type MotivoFallo =
  | 'sin_dns'
  | 'robots'
  | 'timeout'
  | 'error_red'
  | 'http_error'
  | 'no_html'
  | 'vacio';

export interface Descarga {
  ok: boolean;
  motivo?: MotivoFallo;
  status?: number;
  urlFinal?: string;
  html?: string;
  resuelveDns: boolean;
}

export class WebClient {
  private readonly logger = new Logger(WebClient.name);
  private siguienteHueco = 0;

  constructor(private readonly opciones: { rps?: number; timeoutMs?: number } = {}) {}

  /**
   * Reparte las peticiones en el tiempo.
   *
   * El ritmo se aplica a CADA petición HTTP, incluida la de `robots.txt`. Es el
   * mismo detalle que costó caro en el enriquecimiento por API: pausar una vez
   * por dominio deja salir las peticiones a pares y el ritmo real acaba siendo
   * el doble del configurado.
   */
  private async esperarTurno(): Promise<void> {
    const rps = this.opciones.rps ?? RITMO_POR_SEGUNDO;
    const intervalo = 1000 / rps;
    const ahora = Date.now();
    const espera = Math.max(0, this.siguienteHueco - ahora);
    this.siguienteHueco = Math.max(ahora, this.siguienteHueco) + intervalo;
    if (espera > 0) await dormir(espera);
  }

  /**
   * ¿Existe el dominio?
   *
   * Se pregunta al DNS antes que nada porque es lo que descarta la inmensa
   * mayoría de los candidatos, y cuesta milisegundos frente a los segundos de
   * una petición HTTP que va a acabar en timeout. De ~8 candidatos por
   * compañía, lo normal es que resuelvan uno o ninguno.
   *
   * **Va por `lookup` y no por `resolve4`, y la diferencia no es cosmética.**
   * `resolve4` habla directamente con los servidores DNS configurados; `lookup`
   * usa el resolvedor del sistema operativo. En cuanto hay un stub local —un
   * VPN, un antivirus, un `systemd-resolved`, Docker Desktop— `getServers()`
   * devuelve `127.0.0.1` y `resolve4` falla con ECONNREFUSED en una máquina con
   * internet perfectamente funcional. Pasó en la primera prueba real: todos los
   * candidatos salían 'sin_dns' mientras `fetch` bajaba páginas sin problema.
   *
   * Además es lo coherente: `fetch` resuelve por `lookup`, así que comprobar la
   * existencia con otro resolvedor puede dar un "no existe" para un dominio al
   * que la petición siguiente habría llegado sin problemas.
   */
  async resuelve(dominio: string): Promise<boolean> {
    try {
      const direcciones = await dns.lookup(dominio, { all: true });
      return direcciones.length > 0;
    } catch {
      // ENOTFOUND / EAI_AGAIN: no existe o no se puede saber. Ninguna de las dos
      // justifica gastar una petición HTTP.
      return false;
    }
  }

  /**
   * Baja la portada de un dominio: DNS, robots.txt y la página.
   *
   * Se prueba HTTPS y, si falla, HTTP: sigue habiendo webs de empresa pequeña
   * sin certificado, y descartarlas por eso dejaría fuera justo al segmento que
   * más interesa buscar.
   */
  async portada(dominio: string): Promise<Descarga> {
    if (!(await this.resuelve(dominio))) {
      return { ok: false, motivo: 'sin_dns', resuelveDns: false };
    }

    if (!(await this.permitidoPorRobots(dominio))) {
      return { ok: false, motivo: 'robots', resuelveDns: true };
    }

    let ultimo: Descarga = { ok: false, motivo: 'error_red', resuelveDns: true };
    for (const esquema of ['https', 'http']) {
      const r = await this.pedir(`${esquema}://${dominio}/`);
      if (r.ok) return r;
      ultimo = r;
      // Un error de protocolo justifica probar el otro esquema; un 404 del
      // servidor no: ahí el servidor existe y ya ha contestado.
      if (r.motivo === 'http_error' || r.motivo === 'no_html') return r;
    }
    return ultimo;
  }

  /**
   * Respeta `robots.txt`.
   *
   * Sólo se mira si la raíz está prohibida para nosotros o para `*`, que es lo
   * único que se pide aquí. No es un analizador completo del estándar y no
   * pretende serlo; ante la duda, permite — y ante un `robots.txt` que no se
   * puede leer, también, porque un dominio sin robots es la norma.
   */
  private async permitidoPorRobots(dominio: string): Promise<boolean> {
    const r = await this.pedir(`https://${dominio}/robots.txt`, 'text/plain');
    if (!r.ok || !r.html) return true;

    let aplica = false;
    for (const linea of r.html.split('\n').slice(0, 400)) {
      const l = linea.trim().toLowerCase();
      if (l.startsWith('#') || l === '') continue;
      if (l.startsWith('user-agent:')) {
        const ua = l.slice('user-agent:'.length).trim();
        aplica = ua === '*' || ua.includes('friday');
        continue;
      }
      if (aplica && l.startsWith('disallow:')) {
        const ruta = l.slice('disallow:'.length).trim();
        if (ruta === '/') return false;
      }
    }
    return true;
  }

  /**
   * Una petición, sin reintentos.
   *
   * Aquí NO se reintenta, al revés que contra una API propia: si un dominio
   * conjeturado no contesta, lo más probable es que no sea de nadie. Insistir
   * multiplicaría por tres un recorrido de cientos de miles de peticiones para
   * rescatar unos pocos casos.
   */
  private async pedir(url: string, acepta = 'text/html'): Promise<Descarga> {
    await this.esperarTurno();

    const control = new AbortController();
    const alarma = setTimeout(() => control.abort(), this.opciones.timeoutMs ?? TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: control.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: `${acepta},*/*;q=0.5`,
          'Accept-Language': 'es-EC,es;q=0.9',
        },
      });

      if (!res.ok) {
        return { ok: false, motivo: 'http_error', status: res.status, resuelveDns: true };
      }

      const tipo = (res.headers.get('content-type') ?? '').toLowerCase();
      if (acepta === 'text/html' && tipo && !tipo.includes('html') && !tipo.includes('xml')) {
        return { ok: false, motivo: 'no_html', status: res.status, resuelveDns: true };
      }

      const html = await leerConTope(res, MAX_BYTES);
      if (html.trim().length === 0) {
        return { ok: false, motivo: 'vacio', status: res.status, resuelveDns: true };
      }

      return { ok: true, status: res.status, urlFinal: res.url || url, html, resuelveDns: true };
    } catch (err) {
      const abortada = (err as Error)?.name === 'AbortError';
      return {
        ok: false,
        motivo: abortada ? 'timeout' : 'error_red',
        resuelveDns: true,
      };
    } finally {
      clearTimeout(alarma);
    }
  }
}

/**
 * Lee el cuerpo cortando en `tope` bytes.
 *
 * No vale `await res.text()` y recortar después: para entonces el megabyte ya
 * está en memoria, que es exactamente lo que se quiere evitar.
 */
async function leerConTope(res: Response, tope: number): Promise<string> {
  if (!res.body) return '';
  const lector = res.body.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      if (!value) continue;
      trozos.push(value);
      total += value.length;
      if (total >= tope) break;
    }
  } finally {
    await lector.cancel().catch(() => undefined);
  }
  return Buffer.concat(trozos.map((t) => Buffer.from(t)), Math.min(total, tope)).toString('utf8');
}

export const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
