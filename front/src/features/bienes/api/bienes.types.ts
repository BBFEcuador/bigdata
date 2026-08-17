export interface Propiedad {
  cedulaCatastral: string
  parroquia: string | null
  codigoCalle: string | null
  callePrincipal: string | null
  numero: string | null
  barrioSector: string | null
  zona: string | null
  telefono: string | null
}

export interface Vehiculo {
  tipo: string | null
  modelo: string | null
  marca: string | null
  anio: number | null
  placa: string
  lugar: string | null
  fechaVencimiento: string | null
}

export interface PaginaBienes<T> {
  datos: T[]
  siguiente: string | null
}

export interface ResultadoBienes {
  propiedades: PaginaBienes<Propiedad>
  vehiculos: PaginaBienes<Vehiculo>
}
