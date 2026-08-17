import { nullify } from '../../../common/text/normalize';
import { repararMojibake } from '../../../common/text/mojibake';

/**
 * Interpretación de las respuestas de la API de DataPortal.
 *
 * Puro y sin dependencias de red ni de base: recibe el JSON crudo de los cinco
 * endpoints y devuelve filas listas para insertar. Así el parseo se puede
 * reejecutar sobre el `payload` ya guardado sin volver a pedir nada.
 */

export interface RespuestasCrudas {
  ruc?: unknown;
  contacto?: unknown;
  nomina?: unknown;
  carro?: unknown;
  propiedades?: unknown;
}

export interface FilaEmpresa {
  ruc: string;
  razon_social: string | null;
  nombre_comercial: string | null;
  nombre_comercial_2: string | null;
  estado_contribuyente: string | null;
  fecha_inicio: string | null;
  fecha_suspension: string | null;
  actividad_economica: string | null;
  provincia: string | null;
  direccion: string | null;
  telefono: string | null;
  num_empleados: number;
  masa_salarial: number | null;
}

export interface FilaContacto {
  ruc: string;
  valor: string;
  tipo: 'email' | 'telefono' | 'otro';
  tipo_codigo: string | null;
}

export interface FilaNomina {
  ruc: string;
  cedula: string;
  nombre: string | null;
  ocupacion: string | null;
  sueldo: number | null;
  fecha_ingreso: string | null;
}

export interface FilaVehiculo {
  ruc: string;
  placa: string;
  tipo: string | null;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  cilindraje: number | null;
  avaluo: number | null;
  ciudad: string | null;
  fecha_matricula: string | null;
  anio_pago: number | null;
}

export interface Parseado {
  empresa: FilaEmpresa | null;
  contactos: FilaContacto[];
  nomina: FilaNomina[];
  vehiculos: FilaVehiculo[];
  propiedades: unknown[];
}

/** Texto del portal: recorta, repara el mojibake y colapsa los vacíos a null. */
function txt(v: unknown): string | null {
  if (typeof v !== 'string')
    return v === null || v === undefined ? null : String(v);
  return nullify(repararMojibake(v));
}

/** `1975-03-17 00:00:00` o `30/4/2026` -> `1975-03-17`. Ilegible -> null. */
export function fecha(v: unknown): string | null {
  const s = nullify(
    typeof v === 'string'
      ? v
      : v === null || v === undefined
        ? null
        : String(v),
  );
  if (s === null) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return valida(+iso[1], +iso[2], +iso[3]);

  // El portal mezcla formatos: la nómina usa `dd/mm/yyyy` y los vehículos
  // `d/m/yyyy` sin rellenar con ceros.
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (dmy) return valida(+dmy[3], +dmy[2], +dmy[1]);

  return null;
}

/** Rechaza fechas imposibles: un `31/02` reventaría el INSERT. */
function valida(a: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || a < 1900 || a > 2100) return null;
  const f = new Date(Date.UTC(a, m - 1, d));
  if (
    f.getUTCFullYear() !== a ||
    f.getUTCMonth() !== m - 1 ||
    f.getUTCDate() !== d
  )
    return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function numero(v: unknown): number | null {
  const s = nullify(
    typeof v === 'string'
      ? v
      : v === null || v === undefined
        ? null
        : String(v),
  );
  if (s === null) return null;
  const n = Number(s.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function entero(v: unknown, min: number, max: number): number | null {
  const n = numero(v);
  if (n === null) return null;
  const i = Math.trunc(n);
  return i >= min && i <= max ? i : null;
}

/**
 * Clasifica un contacto por su CONTENIDO, no por el código que manda la API.
 *
 * El portal devuelve `tipo` como número (`8` y `3` son los únicos observados) y
 * no publica el catálogo. Fiarse de ese código significaría clasificar mal en
 * cuanto aparezca uno nuevo; mirar si hay una arroba no falla. El código se
 * guarda igualmente por si algún día se conoce su significado.
 */
export function clasificarContacto(valor: string): FilaContacto['tipo'] {
  if (valor.includes('@') && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valor))
    return 'email';
  if (/^\+?[\d\s()-]{7,}$/.test(valor)) return 'telefono';
  return 'otro';
}

const comoArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const comoObjeto = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};

export function parsearRespuestas(
  ruc: string,
  crudas: RespuestasCrudas,
): Parseado {
  const nomina = parsearNomina(ruc, crudas.nomina);
  const sueldos = nomina
    .map((n) => n.sueldo)
    .filter((s): s is number => s !== null);

  return {
    empresa: parsearEmpresa(ruc, crudas.ruc, nomina.length, sueldos),
    contactos: parsearContactos(ruc, crudas.contacto),
    nomina,
    vehiculos: parsearVehiculos(ruc, crudas.carro),
    propiedades: comoArray(
      comoObjeto(crudas.propiedades).propiedades ?? crudas.propiedades,
    ),
  };
}

function parsearEmpresa(
  ruc: string,
  crudo: unknown,
  numEmpleados: number,
  sueldos: number[],
): FilaEmpresa | null {
  const d = comoObjeto(crudo);
  // Sin razón social no hay ficha: el portal devuelve `{}` o un error para los
  // RUC que no conoce, y no tiene sentido crear una fila vacía.
  if (Object.keys(d).length === 0) return null;
  const razon = txt(d.razonSocial);
  if (razon === null) return null;

  return {
    ruc,
    razon_social: razon,
    nombre_comercial: txt(d.nombreComercial),
    nombre_comercial_2: txt(d.nombreComercial2),
    estado_contribuyente: txt(d.estadoContribuyente),
    fecha_inicio: fecha(d.fechaInicioActividades),
    // Sí, el portal lo escribe con esa falta: `fechaSupencionDefinitiva`.
    fecha_suspension: fecha(
      d.fechaSupencionDefinitiva ?? d.fechaSuspensionDefinitiva,
    ),
    actividad_economica: txt(d.actividadEconomica),
    provincia: txt(d.provincia),
    direccion: txt(d.direccion),
    telefono: txt(d.telefono),
    num_empleados: numEmpleados,
    masa_salarial: sueldos.length ? sueldos.reduce((a, b) => a + b, 0) : null,
  };
}

function parsearContactos(ruc: string, crudo: unknown): FilaContacto[] {
  const vistos = new Set<string>();
  const out: FilaContacto[] = [];
  for (const item of comoArray(crudo)) {
    const d = comoObjeto(item);
    const valor = txt(d.contacto);
    if (valor === null || vistos.has(valor)) continue; // la PK es (ruc, valor)
    vistos.add(valor);
    out.push({
      ruc,
      valor,
      tipo: clasificarContacto(valor),
      tipo_codigo: txt(d.tipo),
    });
  }
  return out;
}

function parsearNomina(ruc: string, crudo: unknown): FilaNomina[] {
  const vistos = new Set<string>();
  const out: FilaNomina[] = [];
  for (const item of comoArray(crudo)) {
    const d = comoObjeto(item);
    // El `dni` viene con un espacio final en TODAS las filas del portal.
    const cedula = txt(d.dni);
    if (cedula === null || vistos.has(cedula)) continue;
    vistos.add(cedula);
    out.push({
      ruc,
      cedula,
      nombre: txt(d.nombre),
      ocupacion: txt(d.ocupacion),
      sueldo: numero(d.sueldo),
      fecha_ingreso: fecha(d.fechaIngreso),
    });
  }
  return out;
}

function parsearVehiculos(ruc: string, crudo: unknown): FilaVehiculo[] {
  const lista = comoArray(comoObjeto(crudo).vehicle ?? crudo);
  const vistos = new Set<string>();
  const out: FilaVehiculo[] = [];

  for (const item of lista) {
    const d = comoObjeto(item);
    const placa = txt(d.carRegistration);
    if (placa === null || vistos.has(placa)) continue;
    vistos.add(placa);
    out.push({
      ruc,
      placa,
      tipo: txt(d.vehicleType),
      marca: txt(d.brand),
      modelo: txt(d.model),
      anio: entero(d.year, 1900, 2100),
      cilindraje: entero(d.cylinderCapacity, 0, 100000),
      avaluo: numero(d.appraisalValue),
      ciudad: txt(d.city),
      fecha_matricula: fecha(d.dateOfLastCarRegistration),
      anio_pago: entero(d.yearofPayment, 1900, 2100),
      // `subClassName` NO se guarda: el portal mete ahí el correo de la empresa,
      // no una subclase de vehículo. Queda en el payload crudo por si acaso.
    });
  }
  return out;
}
