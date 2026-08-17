export interface Contacto {
  valor: string;
  tipo: 'email' | 'telefono' | 'otro';
  tipoCodigo: string | null;
}

export interface ResultadoContactos {
  datos: Contacto[];
  siguiente: string | null;
}
