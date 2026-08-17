export interface NominaPersona {
  cedula: string
  nombre: string | null
  fechaIngreso: string | null
  rol: string | null
  posibleSalario: number | null
}

export interface ResultadoNomina {
  datos: NominaPersona[]
  siguiente: string | null
}

