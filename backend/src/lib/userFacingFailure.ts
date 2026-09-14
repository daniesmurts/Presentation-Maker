import axios from 'axios'
import { AppError } from '../errors/AppError'
import { TruncatedResponseError, InvalidModelJsonError } from '../services/llm/modelJson'

// Turning an exception into something a user can act on (CLAUDE.md §3.2).
//
// Async jobs store their failure in a column the UI prints verbatim
// (talk_jobs.error_message). In the parent product that column held
// `(err as Error).message`, so on 2026-09-09 a user was shown
//
//   Expected ',' or ']' after array element in JSON at position 3203
//
// — a V8 parser message, in English, naming an offset in a buffer they had
// never seen. The raw text still goes to the logs; this is what goes on the
// screen.
//
// Every branch says what happened AND what to do about it. «Попробуйте ещё
// раз» alone is only honest when a retry is genuinely likely to work, which
// is why truncation — where an identical retry fails identically — says
// shorten the request instead.
//
// Copy follows the three nouns (CLAUDE.md §1): тезисы, выступление, текст
// докладчика. Never a component name, an offset, or a stack.

export function userFacingFailure(err: unknown, fallback: string): string {
  // AppError messages are written for users already.
  if (err instanceof AppError) return err.message

  if (err instanceof TruncatedResponseError) {
    return 'Ответ не поместился в лимит и оборвался. Уменьшите число слайдов ' +
           'или сократите тезисы — и запустите снова.'
  }

  if (err instanceof InvalidModelJsonError || err instanceof SyntaxError) {
    // A SyntaxError here is a JSON.parse escaping some path that does not go
    // through modelJson.ts. Same wording deliberately: to the user it is the
    // same event, and which internal layer noticed is our problem.
    return 'Ответ пришёл в неожиданном формате. Попробуйте запустить ещё раз.'
  }

  if (axios.isAxiosError(err)) {
    const status = err.response?.status
    if (status === 429) return 'Сервис перегружен. Подождите минуту и попробуйте снова.'
    if (status && status >= 500) return 'Сервис генерации временно недоступен. Попробуйте через несколько минут.'
    if (!err.response) return 'Не удалось связаться с сервисом генерации. Проверьте соединение и попробуйте снова.'
  }

  return fallback
}
