import { ConfigService } from '@nestjs/config';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { ErrorPermanente } from '../../ejecutores/scraper.interface';
import { PlaywrightDataportalNavigator } from './playwright-dataportal.navigator';

type Modo =
  | 'ok'
  | 'credenciales'
  | 'login-cambiado'
  | 'ruc-cambiado'
  | 'formulario-ruc-cambiado'
  | 'lento';

describe('PlaywrightDataportalNavigator', () => {
  let server: Server;
  let baseUrl: string;
  let modo: Modo;
  let ultimoRuc: string | null;
  const navegadores: PlaywrightDataportalNavigator[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      let cuerpo = '';
      req.setEncoding('utf8');
      req.on('data', (fragmento) => (cuerpo += fragmento));
      req.on('end', () => {
        const responder = () => {
          if (req.url === '/wp-login.php' && req.method === 'GET') {
            res.setHeader('content-type', 'text/html');
            res.end(
              modo === 'login-cambiado'
                ? '<form><input id="otro"></form>'
                : '<html><body><form method="post"><input id="user_login" name="log"><input id="user_pass" name="pwd" type="password"><input type="submit" id="wp-submit" value="Entrar"></form></body></html>',
            );
            return;
          }
          if (req.url === '/wp-login.php' && req.method === 'POST') {
            if (modo === 'credenciales') {
              res.setHeader('content-type', 'text/html');
              res.end('<div id="login_error">Error</div>');
            } else {
              res.statusCode = 302;
              res.setHeader('location', '/wp-admin/');
              res.end();
            }
            return;
          }
          if (req.url === '/wp-admin/') {
            res.setHeader('content-type', 'text/html');
            res.end('<nav><ul id="adminmenu"><li>Inicio</li></ul></nav>');
            return;
          }
          if (
            req.url === '/wp-admin/admin.php?page=shearch_ruc' &&
            req.method === 'POST'
          ) {
            ultimoRuc = new URLSearchParams(cuerpo).get('dni');
            res.setHeader('content-type', 'text/html');
            res.end('<h1>Resultado de consulta</h1>');
            return;
          }
          if (req.url === '/wp-admin/admin.php?page=shearch_ruc') {
            res.setHeader('content-type', 'text/html');
            res.end(
              modo === 'ruc-cambiado'
                ? '<h1>Otra página</h1>'
                : modo === 'formulario-ruc-cambiado'
                  ? '<h1>Buscar por Ruc</h1><input id="dni_busqueda">'
                  : '<h1>Buscar por Ruc</h1><form method="post"><input id="dni_busqueda" name="dni"><input type="submit" id="submit_data"></form>',
            );
            return;
          }
          res.statusCode = 404;
          res.end('not found');
        };
        if (modo === 'lento') setTimeout(responder, 200);
        else responder();
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    ultimoRuc = null;
    await Promise.all(navegadores.splice(0).map((n) => n.onModuleDestroy()));
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  function navegador(
    timeoutMs = 3_000,
    debugEsperaMs = 0,
  ): PlaywrightDataportalNavigator {
    const n = new PlaywrightDataportalNavigator(
      new ConfigService({
        SCRAPING_DATAPORTAL_BASE_URL: baseUrl,
        SCRAPING_DATAPORTAL_USERNAME: 'usuario-prueba',
        SCRAPING_DATAPORTAL_PASSWORD: 'clave-prueba',
        SCRAPING_DATAPORTAL_TIMEOUT_MS: String(timeoutMs),
        SCRAPING_DATAPORTAL_HEADLESS: 'true',
        SCRAPING_DATAPORTAL_DEBUG_ESPERA_MS: String(debugEsperaMs),
      }),
    );
    navegadores.push(n);
    return n;
  }

  it('inicia sesión, navega, escribe el RUC y envía el formulario', async () => {
    modo = 'ok';
    const sesion = await navegador().iniciarSesion(
      new AbortController().signal,
    );
    await expect(sesion.navegarABusquedaRuc()).resolves.toEqual({
      navegacionMs: expect.any(Number),
    });
    await expect(sesion.consultarRuc('0999999999001')).resolves.toEqual({
      consultaMs: expect.any(Number),
    });
    expect(ultimoRuc).toBe('0999999999001');
    await sesion.cerrar();
  });

  it('clasifica credenciales rechazadas como error permanente', async () => {
    modo = 'credenciales';
    await expect(
      navegador().iniciarSesion(new AbortController().signal),
    ).rejects.toBeInstanceOf(ErrorPermanente);
  });

  it('detecta un formulario de login incompatible', async () => {
    modo = 'login-cambiado';
    await expect(
      navegador().iniciarSesion(new AbortController().signal),
    ).rejects.toThrow(/formulario de acceso/);
  });

  it('detecta una página de RUC incompatible y permite cerrar el contexto', async () => {
    modo = 'ruc-cambiado';
    const sesion = await navegador().iniciarSesion(
      new AbortController().signal,
    );
    await expect(sesion.navegarABusquedaRuc()).rejects.toBeInstanceOf(
      ErrorPermanente,
    );
    await expect(sesion.cerrar()).resolves.toBeUndefined();
  });

  it('detecta un formulario de consulta incompatible', async () => {
    modo = 'formulario-ruc-cambiado';
    const sesion = await navegador().iniciarSesion(
      new AbortController().signal,
    );
    await sesion.navegarABusquedaRuc();

    await expect(sesion.consultarRuc('0999999999001')).rejects.toBeInstanceOf(
      ErrorPermanente,
    );
  });

  it('trata un timeout como transitorio y cierra el contexto', async () => {
    modo = 'lento';
    await expect(
      navegador(30).iniciarSesion(new AbortController().signal),
    ).rejects.not.toBeInstanceOf(ErrorPermanente);
  });

  it('el aborto cierra inmediatamente el contexto en vuelo', async () => {
    modo = 'lento';
    const aborto = new AbortController();
    const promesa = navegador().iniciarSesion(aborto.signal);
    setTimeout(() => aborto.abort(), 20);
    await expect(promesa).rejects.toThrow();
  });

  it('mantiene visible la página RUC durante la espera configurada', async () => {
    modo = 'ok';
    const sesion = await navegador(3_000, 40).iniciarSesion(
      new AbortController().signal,
    );
    const inicio = Date.now();

    await sesion.navegarABusquedaRuc();
    await sesion.consultarRuc('0999999999001');

    expect(Date.now() - inicio).toBeGreaterThanOrEqual(35);
    await sesion.cerrar();
  });

  it('interrumpe la espera visible al cancelar', async () => {
    modo = 'ok';
    const aborto = new AbortController();
    const sesion = await navegador(3_000, 1_000).iniciarSesion(aborto.signal);
    await sesion.navegarABusquedaRuc();
    const consulta = sesion.consultarRuc('0999999999001');
    setTimeout(() => aborto.abort(), 30);

    await expect(consulta).rejects.toThrow(/interrumpida|closed/i);
    await expect(sesion.cerrar()).resolves.toBeUndefined();
  });
});
