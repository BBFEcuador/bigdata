import axios from 'axios'

const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export const httpClient = axios.create({
  baseURL: apiBaseUrl,
  headers: { 'Content-Type': 'application/json' },
})

// El backend todavía no tiene autenticación. No fingimos un flujo de login ni
// redirigimos a una ruta inexistente.
