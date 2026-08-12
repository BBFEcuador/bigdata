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
 * La autenticación es la de WordPress: **contraseña de aplicación por cabecera
 * `Authorization: Basic`**. No hay parámetro `token` en la URL — el índice de la
 * API (`GET /wp-json/datacenter/v1`) declara `dni` como único argumento de cada
 * ruta, y el raíz anuncia `application-passwords` como método. Mandar el token
 * por query devuelve 401 exactamente igual que no mandar nada.
 *
 * Ojo: la contraseña de la cuenta NO sirve. WordPress sólo acepta por Basic las
 * contraseñas de aplicación (`abcd EFGH ijkl MNOP`, generadas en el perfil).
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

export interface Credenciales {
  usuario: string;
  /** Contraseña de aplicación de WordPress. Los espacios son parte del valor. */
  clave: string;
}

export class DataportalClient {
  private readonly logger = new Logger(DataportalClient.name);

  constructor(
    /**
     * Se pasa como función, no como valor: una contraseña de aplicación puede
     * revocarse a mitad de una carga de 31 horas y así se relee de `.env` sin
     * reiniciar nada.
     */
    private readonly leerCredenciales: () => Credenciales,
    private readonly opciones: { reintentos?: number; timeoutMs?: number } = {},
  ) {}

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
      const control = new AbortController();
      const alarma = setTimeout(() => control.abort(), timeout);
      try {
        const url = `${BASE}/${ruta}/${encodeURIComponent(ruc)}`;
        const res = await fetch(url, {
          signal: control.signal,
          headers: { Authorization: cabeceraBasic(this.leerCredenciales()) },
        });

        if (res.status === 401 || res.status === 403) {
          throw new CredencialesInvalidasError(
            `El portal devolvió ${res.status}: las credenciales no son válidas o se revocaron. ` +
              `Revisa DATAPORTAL_USER / DATAPORTAL_PASSWORD y reanuda el job. ` +
              `Recuerda que ha de ser una contraseña de APLICACIÓN, no la de la cuenta.`,
          );
        }
        if (res.status === 429) {
          // Límite de ritmo: esperar de verdad, no reintentar de inmediato.
          const espera = Number(res.headers.get('retry-after')) || 30;
          this.logger.warn(`429 del portal; esperando ${espera}s`);
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

/**
 * Basic de HTTP: base64 de `usuario:clave`, en **latin1**, no en UTF-8.
 * Es lo que manda el RFC 7617 y lo que espera WordPress; con un usuario o una
 * contraseña con acentos, hacerlo en UTF-8 da un 401 difícil de diagnosticar.
 */
function cabeceraBasic({ usuario, clave }: Credenciales): string {
  return `Basic ${Buffer.from(`${usuario}:${clave}`, 'latin1').toString('base64')}`;
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
