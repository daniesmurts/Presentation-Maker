import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
    : undefined, // production: raw JSON for the aggregator
  base: { env: process.env.NODE_ENV, pid: process.pid },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    // Never log these, even by accident.
    paths: ['password', 'password_hash', 'token', 'apiKey', '*.password', '*.password_hash', '*.token', '*.apiKey'],
    censor: '[REDACTED]',
  },
})
