// Errors whose `message` is written for users. Anything else that reaches a
// user goes through lib/userFacingFailure.ts first (CLAUDE.md §3.2).

export class AppError extends Error {
  constructor(
    public override message: string, // user-facing — safe to show in the UI
    public statusCode: number,        // HTTP status
    public code: string,              // machine-readable — frontend switches on this
    public details?: unknown,         // extra context for logs, never shown
    public upgrade?: boolean,         // true → frontend shows the upgrade prompt
  ) {
    super(message)
    this.name = 'AppError'
    Error.captureStackTrace(this, this.constructor)
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Не найдено') {
    super(message, 404, 'NOT_FOUND')
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Войдите в аккаунт') {
    super(message, 401, 'UNAUTHORIZED')
  }
}

/** The account was switched off by an operator (TODO M). Says what to do, not why. */
export class DeactivatedError extends AppError {
  constructor() {
    super('Аккаунт отключён. Если это ошибка — напишите нам: hello@tezarium.ru', 403, 'ACCOUNT_DEACTIVATED')
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Недостаточно прав') {
    super(message, 403, 'FORBIDDEN')
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details)
  }
}

export class PlanLimitError extends AppError {
  constructor(message: string, code = 'PLAN_LIMIT_REACHED') {
    super(message, 403, code, undefined, true)
  }
}

// A cost-protection circuit breaker, not a paywall — 429, not 403.
export class SpendCapExceededError extends AppError {
  constructor(capUsd: number) {
    super(
      `Достигнут месячный лимит расходов на генерацию для этого рабочего пространства (${capUsd.toFixed(2)} $). ` +
      'Лимит обновится в начале следующего месяца.',
      429,
      'SPEND_CAP_EXCEEDED',
    )
  }
}
