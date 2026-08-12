import { Logger } from '@nestjs/common';
import { RespuestasCrudas } from './dataportal.parser';

/**
 * Cliente de la API REST de DataPortal.
 *
 * Cinco endpoints por RUC. Recorrer las 226.191 compañías son ~1,13 M de
 * peticiones, así que todo aquí está pensado para una carga larga: ritmo
 * controlado, reintentos con espera creciente y unas credenciales que se releen
 * en cada petición para poder rotarlas sin parar el proceso.
 *
 * La autenticación es un **`?token=` en la query string**, y nada más. No es la
 * de WordPress: las credenciales de WP no autorizan estas rutas. Comprobado
 * contra el portal el 12/08/2026, con el mismo RUC en las tres variantes:
 *
 *   token en la query                          -> 200
 *   contraseña de aplicación por Basic          -> 401 "usuario no autorizado"
 *   contraseña de la cuenta por Basic           -> 401 "usuario no autorizado"
 *   sin nada                                   -> 401 "usuario no autorizado"
 *
 * El token va en `DATAPORTAL_TOKEN`. Sale del propio panel del portal: la
 * pantalla "Buscar por Ruc" de `wp-admin` llama a estos cinco endpoints con él
 * en la URL.
 *
 * Este comentario decía justo lo contrario —que no había ningún `?token=`— y
 * costó una noche entera. La deducción de la que salía era razonable y era
 * falsa: el índice de la API declara `dni` como único argumento, y el raíz
 * anuncia `application-passwords`, pero ninguna de las dos cosas describe cómo
 * autoriza el plugin. Y el 401 no distingue "valor equivocado" de "mecanismo
 * equivocado", así que la hipótesis nunca se caía sola. Si algún día vuelve a
 * dar 401, mira qué pide el panel por red antes de tocar credenciales.
 */

const BASE = process.env.DATAPORTAL_BASE_URL ?? 'https://dataportalsys.com/wp-json/datacenter/v1';

/** Los cinco recursos, con la clave con la que se guardan en el payload. */
export const RECURSOS = [
  { clave: 'ruc', ruta: 'ruc' },
  { clave: 'contacto', ruta: 'contacto_ruc' },
  { clave: 'nomina', ruta: 'contacto_nomina' },
  { clave: 'carro', ruta: 'carro' },
  { clave: 'propiedades', ruta: 'propiedades' },
] as const;

export interface ResultadoConsulta {
  crudas: RespuestasCrudas;
  /** Peor código HTTP observado; 404 en un recurso es normal (no tiene ese dato). */
  status: number;
  /** true si ningún recurso devolvió datos: el RUC no está en el portal. */
  sinDatos: boolean;
}

export class CredencialesInvalidasError extends Error {}
export class LimiteAlcanzadoError extends Error {}

export class DataportalClient {
  private readonly logger = new Logger(DataportalClient.name);

  /** Momento en que se puede lanzar la siguiente petición. */
  private siguienteHueco = 0;

  constructor(
    /**
     * Se pasa como función, no como valor: el token puede revocarse a mitad de
     * una carga larga y así se relee de `.env` sin reiniciar nada.
     */
    private readonly leerToken: () => string,
    private readonly opciones: {
      reintentos?: number;
      timeoutMs?: number;
      /** Peticiones por segundo. Se aplica a CADA petición HTTP. */
      rps?: number;
    } = {},
  ) {}

  /**
   * Espera su turno antes de cada petición.
   *
   * El ritmo tiene que aplicarse aquí y no en el bucle de RUC del servicio.
   * Ese fue el primer fallo real de este importador: la pausa estaba por RUC,
   * así que `consultar()` disparaba sus CINCO endpoints de golpe y luego
   * esperaba. Con "1 petición por segundo" configurado, el portal recibía
   * ráfagas de cinco y devolvía 429 igual que con cinco por segundo — el
   * síntoma no cambiaba al bajar el ritmo, que es lo que despistaba.
   */
  private async esperarTurno(): Promise<void> {
    const rps = this.opciones.rps ?? 1;
    const intervalo = 1000 / rps;
    const ahora = Date.now();
    const espera = Math.max(0, this.siguienteHueco - ahora);
    this.siguienteHueco = Math.max(ahora, this.siguienteHueco) + intervalo;
    if (espera > 0) await dormir(espera);
  }

  /** Consulta los cinco recursos de un RUC. */
  async consultar(ruc: string): Promise<ResultadoConsulta> {
    const crudas: RespuestasCrudas = {};
    let peorStatus = 200;
    let conDatos = false;

    for (const recurso of RECURSOS) {
      const { cuerpo, status } = await this.pedir(recurso.ruta, ruc);
      if (status !== 200) {
        // Un 404 significa "esta empresa no tiene ese dato", no un fallo: hay
        // compañías sin vehículos, sin nómina o sin propiedades.
        if (status !== 404) peorStatus = Math.max(peorStatus, status);
        continue;
      }
      (crudas as Record<string, unknown>)[recurso.clave] = cuerpo;
      if (tieneContenido(cuerpo)) conDatos = true;
    }

    return { crudas, status: peorStatus, sinDatos: !conDatos };
  }

  /**
   * Una petición con reintentos.
   *
   * El 401/403 NO se reintenta: significa token caducado, y machacar el
   * endpoint 1,13 M de veces con un token muerto no lo arregla — sube y para la
   * carga para que se pueda renovar.
   */
  private async pedir(ruta: string, ruc: string): Promise<{ cuerpo: unknown; status: number }> {
    const maxIntentos = this.opciones.reintentos ?? 3;
    const timeout = this.opciones.timeoutMs ?? 20_000;
    let ultimoError: Error | null = null;

    for (let intento = 1; intento <= maxIntentos; intento++) {
      await this.esperarTurno();
      const control = new AbortController();
      const alarma = setTimeout(() => control.abort(), timeout);
      try {
        const url =
          `${BASE}/${ruta}/${encodeURIComponent(ruc)}` +
          `?token=${encodeURIComponent(this.leerToken())}`;
        const res = await fetch(url, { signal: control.signal });

        if (res.status === 401 || res.status === 403) {
          throw new CredencialesInvalidasError(
            `El portal devolvió ${res.status}: el token no es válido o se revocó. ` +
              `Revisa DATAPORTAL_TOKEN en back/.env y reanuda el job. ` +
              `El token sale del panel del portal (pantalla "Buscar por Ruc"); ` +
              `las credenciales de WordPress NO autorizan estas rutas.`,
          );
        }
        if (res.status === 429) {
          // Límite de ritmo. La espera se empuja al planificador y no sólo a
          // esta petición: si se limita a dormir aquí, la siguiente sale en
          // cuanto acabe y vuelve a chocar contra el mismo límite.
          const espera = Number(res.headers.get('retry-after')) || 30;
          this.logger.warn(`429 del portal; frenando ${espera}s`);
          this.siguienteHueco = Date.now() + espera * 1000;
          await dormir(espera * 1000);
          continue;
        }
        if (res.status === 404) return { cuerpo: null, status: 404 };
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        return { cuerpo: await res.json(), status: 200 };
      } catch (err) {
        if (err instanceof CredencialesInvalidasError) throw err;
        ultimoError = err as Error;
        // Espera creciente: 1s, 2s, 4s. Un pico de la red o del portal se pasa
        // solo; insistir sin pausa sólo lo empeora.
        if (intento < maxIntentos) await dormir(1000 * 2 ** (intento - 1));
      } finally {
        clearTimeout(alarma);
      }
    }

    throw ultimoError ?? new Error('fallo desconocido');
  }
}

/** Un objeto vacío, un array vacío o null significan "no hay dato". */
function tieneContenido(cuerpo: unknown): boolean {
  if (cuerpo === null || cuerpo === undefined) return false;
  if (Array.isArray(cuerpo)) return cuerpo.length > 0;
  if (typeof cuerpo === 'object') return Object.keys(cuerpo as object).length > 0;
  return true;
}

export const dormir = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));
