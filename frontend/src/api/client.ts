import axios from 'axios'

// Session lives in an HttpOnly cookie; the X-Requested-With header is the
// CSRF check the backend requires on mutating requests.
export const client = axios.create({
  baseURL: '',
  timeout: 60_000,
  withCredentials: true,
  headers: { 'X-Requested-With': 'Tezarium' },
})

export interface ApiError { code: string; message: string; upgrade: boolean }

/** The user-facing message from an API error, or the generic line. */
export function errorMessage(err: unknown, fallback = 'Что-то пошло не так. Попробуйте ещё раз.'): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: Partial<ApiError> } | undefined
    if (typeof data?.error?.message === 'string') return data.error.message
    if (!err.response) return 'Не удалось связаться с сервером. Проверьте соединение.'
  }
  return fallback
}

export function errorStatus(err: unknown): number | undefined {
  return axios.isAxiosError(err) ? err.response?.status : undefined
}

/** True when the API said the fix is a higher tier (AppError.upgrade). */
export function errorUpgrade(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false
  const data = err.response?.data as { error?: Partial<ApiError> } | undefined
  return data?.error?.upgrade === true
}
