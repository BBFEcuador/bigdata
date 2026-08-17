import { Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Browser,
  BrowserContext,
  Page,
  chromium,
  errors as playwrightErrors,
} from 'playwright';
import {
  ContactoDataportal,
  DataportalNavigator,
  PersonaNominaDataportal,
  PropiedadDataportal,
  ResultadoConsultaDataportal,
  ResultadoSeccionDataportal,
  SesionDataportal,
  VehiculoDataportal,
} from '../../application/ports/dataportal-navigator';
import { ErrorPermanente } from '../../ejecutores/scraper.interface';

export const DATAPORTAL_BROWSER_LAUNCHER = Symbol(
  'DATAPORTAL_BROWSER_LAUNCHER',
);

export interface DataportalBrowserLauncher {
  launch(headless: boolean): Promise<Browser>;
}

/**
 * Un Chromium por proceso y un contexto efímero por job. Nunca se reutiliza
 * almacenamiento autenticado entre compañías ni se registra contenido HTML.
 */
@Injectable()
export class PlaywrightDataportalNavigator
  implements DataportalNavigator, OnModuleDestroy
{
  private browser: Promise<Browser> | null = null;
  private readonly cupos: Cupos;

  constructor(
    private readonly config: ConfigService,
    @Optional()
    @Inject(DATAPORTAL_BROWSER_LAUNCHER)
    private readonly launcher: DataportalBrowserLauncher = {
      launch: (headless) => chromium.launch({ headless }),
    },
  ) {
    this.cupos = new Cupos(
      enteroPositivo(
        this.config.get<string>('SCRAPING_DATAPORTAL_CONCURRENCIA'),
        1,
      ),
    );
  }

  async iniciarSesion(signal: AbortSignal): Promise<SesionDataportal> {
    const liberarCupo = await this.cupos.adquirir(signal);
    let context: BrowserContext | null = null;

    try {
      const opciones = this.opciones();
      const browser = await this.obtenerBrowser(opciones.headless);
      if (signal.aborted) throw errorAbortado();
      context = await browser.newContext();
      const cerrarAlAbortar = () =>
        void context?.close().catch(() => undefined);
      signal.addEventListener('abort', cerrarAlAbortar, { once: true });
      if (signal.aborted) cerrarAlAbortar();

      const cerrar = unaVez(async () => {
        signal.removeEventListener('abort', cerrarAlAbortar);
        await context?.close().catch(() => undefined);
        liberarCupo();
      });

      try {
        const page = await context.newPage();
        page.setDefaultTimeout(opciones.timeoutMs);
        page.setDefaultNavigationTimeout(opciones.timeoutMs);
        const inicio = Date.now();
        await this.login(page, opciones);

        return {
          loginMs: Date.now() - inicio,
          navegarABusquedaRuc: async () => {
            try {
              const inicioNavegacion = Date.now();
              await this.navegarABusquedaRuc(page, opciones, signal);
              return { navegacionMs: Date.now() - inicioNavegacion };
            } catch (error) {
              await cerrar();
              throw clasificarError(error);
            }
          },
          consultarRuc: async (ruc: string) => {
            try {
              return await this.consultarRuc(page, ruc, opciones, signal);
            } catch (error) {
              await cerrar();
              throw clasificarError(error);
            }
          },
          cerrar,
        };
      } catch (error) {
        await cerrar();
        throw clasificarError(error);
      }
    } catch (error) {
      if (!context) liberarCupo();
      throw clasificarError(error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    if (browser) await browser.then((b) => b.close()).catch(() => undefined);
  }

  private async obtenerBrowser(headless: boolean): Promise<Browser> {
    if (!this.browser) {
      this.browser = this.launcher.launch(headless).catch((error) => {
        this.browser = null;
        throw error;
      });
    }
    return this.browser;
  }

  private opciones(): OpcionesDataportal {
    const baseUrlTexto =
      this.config.get<string>('SCRAPING_DATAPORTAL_BASE_URL') ??
      'https://dataportalsys.com';
    const username = this.config.get<string>('SCRAPING_DATAPORTAL_USERNAME');
    const password = this.config.get<string>('SCRAPING_DATAPORTAL_PASSWORD');
    if (!username?.trim() || !password) {
      throw new ErrorPermanente(
        'La configuración de credenciales de DataPortal está incompleta',
      );
    }

    let baseUrl: URL;
    try {
      baseUrl = new URL(baseUrlTexto);
      if (!['http:', 'https:'].includes(baseUrl.protocol)) throw new Error();
    } catch {
      throw new ErrorPermanente(
        'SCRAPING_DATAPORTAL_BASE_URL no es una URL HTTP válida',
      );
    }

    return {
      baseUrl,
      username,
      password,
      timeoutMs: enteroPositivo(
        this.config.get<string>('SCRAPING_DATAPORTAL_TIMEOUT_MS'),
        30_000,
      ),
      headless:
        this.config
          .get<string>('SCRAPING_DATAPORTAL_HEADLESS')
          ?.toLowerCase() !== 'false',
      debugEsperaMs: enteroNoNegativo(
        this.config.get<string>('SCRAPING_DATAPORTAL_DEBUG_ESPERA_MS'),
        0,
      ),
    };
  }

  private async login(page: Page, opciones: OpcionesDataportal): Promise<void> {
    const respuesta = await page.goto(
      new URL('/wp-login.php', opciones.baseUrl).toString(),
      { waitUntil: 'domcontentloaded' },
    );
    if (respuesta && respuesta.status() >= 500) {
      throw new Error(
        `DataPortal respondió HTTP ${respuesta.status()} al iniciar sesión`,
      );
    }

    for (const selector of ['#user_login', '#user_pass', '#wp-submit']) {
      if ((await page.locator(selector).count()) !== 1) {
        throw new ErrorPermanente(
          'El formulario de acceso de DataPortal cambió y ya no es compatible',
        );
      }
    }

    await page.locator('#user_login').fill(opciones.username);
    await page.locator('#user_pass').fill(opciones.password);
    await page.locator('#wp-submit').click();
    await page.waitForLoadState('domcontentloaded');

    if (
      await page
        .locator('#login_error')
        .isVisible()
        .catch(() => false)
    ) {
      throw new ErrorPermanente(
        'DataPortal rechazó las credenciales configuradas',
      );
    }

    const url = new URL(page.url());
    const autenticado = url.pathname.startsWith('/wp-admin/');
    const tieneMenu = await page
      .locator('#adminmenu')
      .isVisible()
      .catch(() => false);
    if (!autenticado || !tieneMenu) {
      throw new ErrorPermanente(
        'DataPortal no confirmó el acceso al panel autenticado',
      );
    }
  }

  private async navegarABusquedaRuc(
    page: Page,
    opciones: OpcionesDataportal,
    signal: AbortSignal,
  ): Promise<void> {
    const destino = new URL('/wp-admin/admin.php', opciones.baseUrl);
    destino.searchParams.set('page', 'shearch_ruc');
    const respuesta = await page.goto(destino.toString(), {
      waitUntil: 'domcontentloaded',
    });
    if (respuesta && respuesta.status() >= 500) {
      throw new Error(
        `DataPortal respondió HTTP ${respuesta.status()} en la búsqueda de RUC`,
      );
    }

    const url = new URL(page.url());
    const urlCanonica =
      url.pathname === '/wp-admin/admin.php' &&
      url.searchParams.get('page') === 'shearch_ruc';
    const titulo = await page
      .getByRole('heading', { name: 'Buscar por Ruc', exact: true })
      .isVisible()
      .catch(() => false);
    const campo = await page
      .locator('#dni_busqueda')
      .isVisible()
      .catch(() => false);
    if (!urlCanonica || !titulo || !campo) {
      throw new ErrorPermanente(
        'La página de búsqueda por RUC de DataPortal cambió y ya no es compatible',
      );
    }
  }

  private async consultarRuc(
    page: Page,
    ruc: string,
    opciones: OpcionesDataportal,
    signal: AbortSignal,
  ): Promise<ResultadoConsultaDataportal> {
    const campo = page.locator('#dni_busqueda');
    const submit = page.locator('#submit_data');
    if ((await campo.count()) !== 1 || (await submit.count()) !== 1) {
      throw new ErrorPermanente(
        'El formulario de búsqueda por RUC de DataPortal cambió y ya no es compatible',
      );
    }
    for (const selector of ['#consul-text-ruc']) {
      if ((await page.locator(selector).count()) !== 1) {
        throw new ErrorPermanente(
          'La estructura de resultados de DataPortal cambió y ya no es compatible',
        );
      }
    }

    const inicioConsulta = Date.now();
    await campo.fill(ruc);
    // El plugin intercepta el submit y actualiza la página de forma asíncrona;
    // no hay una navegación de documento que se pueda esperar aquí.
    await submit.click();

    await page.waitForFunction(
      (esperado) =>
        document.querySelector('#consul-text-ruc')?.textContent?.trim() ===
        esperado,
      ruc,
    );
    await page.waitForFunction(() =>
      [...document.querySelectorAll<HTMLElement>('#cargando, .cargando')].every(
        (elemento) => {
          const estilo = getComputedStyle(elemento);
          return (
            estilo.display === 'none' ||
            estilo.visibility === 'hidden' ||
            elemento.hidden
          );
        },
      ),
    );
    const consultaMs = Date.now() - inicioConsulta;

    const inicioExtraccion = Date.now();
    const crudo = await page.evaluate(() => {
      const texto = (valor: string | null | undefined) =>
        (valor ?? '').replace(/\s+/g, ' ').trim();
      const tablaNomina = document.querySelector('#nomina')?.closest('table');
      const encabezados = [
        ...(tablaNomina?.querySelectorAll('thead th') ?? []),
      ].map((th) => texto(th.textContent).toLocaleLowerCase('es'));
      return {
        existeContactos: document.querySelectorAll('#midirrecion').length === 1,
        contactos: [...document.querySelectorAll('#midirrecion tr')].map(
          (fila) => ({
            celdas: [...fila.querySelectorAll('td')].map((td) =>
              texto(td.textContent),
            ),
            tipoCodigo:
              fila.getAttribute('data-tipo-codigo') ??
              fila
                .querySelector('[data-tipo-codigo]')
                ?.getAttribute('data-tipo-codigo'),
          }),
        ),
        encabezados,
        existeNomina: document.querySelectorAll('#nomina').length === 1,
        nomina: [...document.querySelectorAll('#nomina tr')].map((fila) =>
          [...fila.querySelectorAll('td')].map((td) => texto(td.textContent)),
        ),
        propiedades: extraerTarjetas('#text-data-casas'),
        vehiculos: extraerTarjetas('#text-data-carros'),
      };

      function extraerTarjetas(selector: string) {
        const coincidencias = document.querySelectorAll(selector);
        if (coincidencias.length !== 1)
          return { existe: false, texto: '', tarjetas: [] };
        const contenedor = coincidencias[0];
        const textoContenedor = texto(contenedor.textContent);
        const tarjetas = [...contenedor.querySelectorAll(':scope > div')].map(
          (tarjeta) => {
            const elementos = [...tarjeta.querySelectorAll('p, li')]
              .map((linea) => texto(linea.textContent))
              .filter(Boolean);
            const porSaltos = tarjeta.innerHTML
              .split(/<br\s*\/?\s*>/gi)
              .map((fragmento) => {
                const temporal = document.createElement('div');
                temporal.innerHTML = fragmento;
                return texto(temporal.textContent);
              })
              .filter(Boolean);
            return {
              texto: texto(tarjeta.textContent),
              lineas: elementos.length ? elementos : porSaltos,
            };
          },
        );
        return { existe: true, texto: textoContenedor, tarjetas };
      }
    });

    const indice = (nombre: string) =>
      crudo.encabezados.findIndex((encabezado) =>
        sinAcentos(encabezado).includes(nombre),
      );
    const contactos = seccionSegura('contactos', () => {
      if (!crudo.existeContactos)
        throw new Error('no existe un contenedor único #midirrecion');
      return normalizarContactos(crudo.contactos);
    });
    const nomina = seccionSegura('nómina', () => {
      if (!crudo.existeNomina)
        throw new Error('no existe un contenedor único #nomina');
      const requeridos = ['consultar', 'cedula', 'nombre', 'ingreso', 'rol'];
      if (
        !requeridos.every((nombre) =>
          crudo.encabezados.some((encabezado) =>
            sinAcentos(encabezado).includes(nombre),
          ),
        ) ||
        !crudo.encabezados.some((encabezado) =>
          sinAcentos(encabezado).includes('salario'),
        )
      )
        throw new Error('las columnas esperadas no están presentes');
      return normalizarNomina(crudo.nomina, {
        cedula: indice('cedula'),
        nombre: indice('nombre'),
        ingreso: indice('ingreso'),
        rol: indice('rol'),
        salario: indice('salario'),
      });
    });
    const propiedades = seccionSegura('propiedades', () =>
      normalizarPropiedades(crudo.propiedades),
    );
    const vehiculos = seccionSegura('vehículos', () =>
      normalizarVehiculos(crudo.vehiculos),
    );
    const extraccionMs = Date.now() - inicioExtraccion;

    await esperarInterrumpible(opciones.debugEsperaMs, signal);
    return {
      contactos,
      nomina,
      propiedades,
      vehiculos,
      consultaMs,
      extraccionMs,
    };
  }
}

function seccionSegura<T>(
  nombre: string,
  extraer: () => T[],
): ResultadoSeccionDataportal<T> {
  try {
    return { estado: 'ok', datos: extraer() };
  } catch (error) {
    return {
      estado: 'error',
      advertencia: `No se pudo extraer ${nombre}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

interface TarjetasCrudas {
  existe: boolean;
  texto: string;
  tarjetas: Array<{ texto: string; lineas: string[] }>;
}

function normalizarPropiedades(crudo: TarjetasCrudas): PropiedadDataportal[] {
  return normalizarTarjetas(crudo, 'cédula catastral', (campos) => ({
    cedulaCatastral: normalizarIdentificador(
      requerido(campos, ['cedula catastral', 'cedula catastal']),
    ),
    parroquia: campo(campos, ['parroquia']),
    codigoCalle: campo(campos, ['codigo calle', 'codigo de calle']),
    callePrincipal: campo(campos, ['calle principal']),
    numero: campo(campos, ['numero']),
    barrioSector: campo(campos, ['barrio sector', 'barrio/sector', 'barrio']),
    zona: campo(campos, ['zona']),
    telefono: campo(campos, ['telefono']),
  }));
}

function normalizarVehiculos(crudo: TarjetasCrudas): VehiculoDataportal[] {
  return normalizarTarjetas(crudo, 'placa', (campos) => ({
    tipo: campo(campos, ['tipo']),
    modelo: campo(campos, ['modelo']),
    marca: campo(campos, ['marca']),
    anio: normalizarAnio(campo(campos, ['anio', 'año'])),
    placa: normalizarIdentificador(requerido(campos, ['placa'])),
    lugar: campo(campos, ['lugar']),
    fechaVencimiento: normalizarFechaHora(
      campo(campos, ['fecha vencimiento', 'fecha de vencimiento']),
    ),
  }));
}

function normalizarTarjetas<T>(
  crudo: TarjetasCrudas,
  identificador: string,
  mapear: (campos: Map<string, string>) => T,
): T[] {
  if (!crudo.existe)
    throw new Error('el contenedor no existe o está duplicado');
  if (!crudo.texto) return [];
  if (crudo.tarjetas.length === 0)
    throw new Error('hay contenido, pero no está dividido en elementos <div>');
  const resultado: T[] = [];
  for (const tarjeta of crudo.tarjetas) {
    const lineas = tarjeta.lineas.length
      ? tarjeta.lineas
      : tarjeta.texto.split(/\n+/).map((linea) => linea.trim());
    const campos = new Map<string, string>();
    for (const linea of lineas) {
      const separador = linea.indexOf(':');
      if (separador < 0) continue;
      const etiqueta = normalizarEtiqueta(linea.slice(0, separador));
      const valor = limpiarOpcional(linea.slice(separador + 1));
      if (etiqueta && valor) campos.set(etiqueta, valor);
    }
    if (campos.size === 0)
      throw new Error('un elemento no contiene etiquetas reconocibles');
    try {
      resultado.push(mapear(campos));
    } catch {
      throw new Error(`un elemento no contiene ${identificador}`);
    }
  }
  return resultado;
}

function normalizarEtiqueta(valor: string): string {
  return sinAcentos(valor)
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function campo(campos: Map<string, string>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const valor = campos.get(normalizarEtiqueta(alias));
    if (valor) return valor;
  }
  return null;
}

function requerido(campos: Map<string, string>, aliases: string[]): string {
  const valor = campo(campos, aliases);
  if (!valor) throw new Error('identificador obligatorio ausente');
  return valor;
}

function normalizarIdentificador(valor: string): string {
  return valor.replace(/\s+/g, ' ').trim().toLocaleUpperCase('es');
}

function normalizarAnio(valor: string | null): number | null {
  if (!valor || !/^\d{4}$/.test(valor)) return null;
  const anio = Number(valor);
  return anio >= 1900 && anio <= 2100 ? anio : null;
}

function normalizarFechaHora(valor: string | null): string | null {
  if (!valor) return null;
  const dmy =
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}):(\d{2}))?$/.exec(
      valor,
    );
  if (!dmy) return null;
  const [, d, m, a, hh = '0', mm = '00', ss = '00'] = dmy;
  const fecha = normalizarFecha(`${d}/${m}/${a}`);
  const hora = +hh;
  if (!fecha || hora > 23 || +mm > 59 || +ss > 59) return null;
  return `${fecha} ${String(hora).padStart(2, '0')}:${mm}:${ss}`;
}

function sinAcentos(valor: string): string {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizarContactos(
  filas: Array<{ celdas: string[]; tipoCodigo?: string | null }>,
): ContactoDataportal[] {
  const unicos = new Map<string, ContactoDataportal>();
  for (const fila of filas) {
    const valor = fila.celdas.find(Boolean)?.replace(/\s+/g, ' ').trim();
    if (!valor || unicos.has(valor)) continue;
    unicos.set(valor, {
      valor,
      tipo: clasificarContacto(valor),
      tipoCodigo: limpiarOpcional(fila.tipoCodigo),
    });
  }
  return [...unicos.values()];
}

function clasificarContacto(valor: string): ContactoDataportal['tipo'] {
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valor)) return 'email';
  if (/^\+?[\d\s()-]{7,}$/.test(valor)) return 'telefono';
  return 'otro';
}

function normalizarNomina(
  filas: string[][],
  indices: Record<'cedula' | 'nombre' | 'ingreso' | 'rol' | 'salario', number>,
): PersonaNominaDataportal[] {
  const unicos = new Map<string, PersonaNominaDataportal>();
  for (const fila of filas) {
    const cedula = limpiarOpcional(fila[indices.cedula]);
    if (!cedula || unicos.has(cedula)) continue;
    unicos.set(cedula, {
      cedula,
      nombre: limpiarOpcional(fila[indices.nombre]),
      fechaIngreso: normalizarFecha(fila[indices.ingreso]),
      rol: limpiarOpcional(fila[indices.rol]),
      posibleSalario: normalizarMoneda(fila[indices.salario]),
    });
  }
  return [...unicos.values()];
}

function limpiarOpcional(valor: string | null | undefined): string | null {
  const limpio = valor?.replace(/\s+/g, ' ').trim();
  return limpio ? limpio : null;
}

function normalizarFecha(valor: string | undefined): string | null {
  const limpio = limpiarOpcional(valor);
  if (!limpio) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(limpio);
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(limpio);
  const partes = iso
    ? [+iso[1], +iso[2], +iso[3]]
    : dmy
      ? [+dmy[3], +dmy[2], +dmy[1]]
      : null;
  if (!partes) return null;
  const [anio, mes, dia] = partes;
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia
  )
    return null;
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function normalizarMoneda(valor: string | undefined): number | null {
  let limpio = limpiarOpcional(valor)?.replace(/[^\d,.-]/g, '');
  if (!limpio) return null;
  const coma = limpio.lastIndexOf(',');
  const punto = limpio.lastIndexOf('.');
  if (coma >= 0 && punto >= 0) {
    const decimal = Math.max(coma, punto);
    limpio =
      limpio.slice(0, decimal).replace(/[.,]/g, '') +
      '.' +
      limpio.slice(decimal + 1);
  } else if (coma >= 0) {
    limpio = limpio.replace(/\./g, '').replace(',', '.');
  } else {
    const partes = limpio.split('.');
    if (partes.length > 2)
      limpio = `${partes.slice(0, -1).join('')}.${partes.at(-1)}`;
    else if (partes.length === 2 && partes[1].length === 3)
      limpio = partes.join('');
  }
  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : null;
}

interface OpcionesDataportal {
  baseUrl: URL;
  username: string;
  password: string;
  timeoutMs: number;
  headless: boolean;
  debugEsperaMs: number;
}

function clasificarError(error: unknown): Error {
  if (error instanceof ErrorPermanente) return error;
  if (error instanceof playwrightErrors.TimeoutError) {
    return new Error(
      `Tiempo de espera agotado al navegar DataPortal: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}

function enteroPositivo(valor: string | undefined, defecto: number): number {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? Math.floor(numero) : defecto;
}

function enteroNoNegativo(valor: string | undefined, defecto: number): number {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0 ? Math.floor(numero) : defecto;
}

function esperarInterrumpible(ms: number, signal: AbortSignal): Promise<void> {
  if (ms === 0) return Promise.resolve();
  if (signal.aborted) return Promise.reject(errorAbortado());

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', abortar);
      resolve();
    }, ms);
    const abortar = () => {
      clearTimeout(timeout);
      reject(errorAbortado());
    };
    signal.addEventListener('abort', abortar, { once: true });
  });
}

function unaVez(fn: () => Promise<void>): () => Promise<void> {
  let promesa: Promise<void> | null = null;
  return () => (promesa ??= fn());
}

class Cupos {
  private disponibles: number;
  private readonly cola: Array<() => void> = [];

  constructor(private readonly maximo: number) {
    this.disponibles = maximo;
  }

  adquirir(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) return Promise.reject(errorAbortado());
    if (this.disponibles > 0) {
      this.disponibles--;
      return Promise.resolve(this.liberador());
    }

    return new Promise((resolve, reject) => {
      const conceder = () => {
        signal.removeEventListener('abort', abortar);
        resolve(this.liberador());
      };
      const abortar = () => {
        const indice = this.cola.indexOf(conceder);
        if (indice >= 0) this.cola.splice(indice, 1);
        reject(errorAbortado());
      };
      this.cola.push(conceder);
      signal.addEventListener('abort', abortar, { once: true });
    });
  }

  private liberador(): () => void {
    let liberado = false;
    return () => {
      if (liberado) return;
      liberado = true;
      const siguiente = this.cola.shift();
      if (siguiente) siguiente();
      else this.disponibles = Math.min(this.maximo, this.disponibles + 1);
    };
  }
}

function errorAbortado(): Error {
  const error = new Error('Navegación DataPortal interrumpida');
  error.name = 'AbortError';
  return error;
}
