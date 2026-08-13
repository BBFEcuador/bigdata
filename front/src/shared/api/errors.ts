import axios from 'axios'

type ApiErrorPayload = { message?: string | string[] }

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiErrorPayload>(error)) {
    const message = error.response?.data?.message
    if (Array.isArray(message)) return message.join('. ')
    if (message) return message
    if (error.message) return error.message
  }
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado.'
}
