import axios from 'axios'
import { config } from '../../lib/config'
import { logger } from '../../lib/logger'
import { AppError } from '../../errors/AppError'
import { signRequest } from './token'

// T-Bank internet acquiring, the three calls a subscription needs
// (developer.tbank.ru/eacq/api): Init (a payment + hosted form URL), Charge
// (debit a saved card), GetState (ask about one payment). Every request is
// signed (token.ts); every answer is checked for Success and mapped to a
// user-facing line (CLAUDE.md §3.2) — the raw ErrorCode/Message/Details go
// to the log.

export interface TbankReceipt {
  Email:    string
  Taxation: string
  Items:    Array<{ Name: string; Price: number; Quantity: number; Amount: number; Tax: string; PaymentMethod: string; PaymentObject: string }>
}

export interface InitParams {
  amountKopecks:   number
  orderId:         string
  description:     string
  customerKey:     string
  /** Y → this is a parent payment; the card is saved and a RebillId arrives with the notification. */
  recurrent?:      boolean
  successUrl:      string
  failUrl:         string
  notificationUrl: string
  receipt?:        TbankReceipt
  language?:       'ru' | 'en'
}

export interface InitResult   { paymentId: string; paymentUrl: string; status: string }
export interface StateResult  { paymentId: string; status: string; amountKopecks: number }
export interface ChargeResult { paymentId: string; status: string; errorCode: string }

interface Answer {
  Success:     boolean
  ErrorCode:   string
  Message?:    string
  Details?:    string
  Status?:     string
  PaymentId?:  string | number
  PaymentURL?: string
  Amount?:     number
}

export class TbankError extends AppError {
  constructor(message: string, public readonly errorCode: string, details?: unknown) {
    super(message, 502, 'PAYMENT_PROVIDER_ERROR', details)
  }
}

function tbank() {
  if (!config.billing.enabled) throw new AppError('Оплата в этой установке не подключена', 404, 'PLAN_BILLING_OFF')
  return config.billing.tbank
}

/** 54-ФЗ receipt for one subscription month. */
export function subscriptionReceipt(email: string, amountKopecks: number, name: string): TbankReceipt {
  const { receipt } = tbank()
  return {
    Email:    email,
    Taxation: receipt.taxation,
    Items: [{
      Name: name.slice(0, 128), Price: amountKopecks, Quantity: 1, Amount: amountKopecks, Tax: receipt.tax,
      PaymentMethod: 'full_prepayment', PaymentObject: 'service',
    }],
  }
}

async function call(method: 'Init' | 'Charge' | 'GetState', params: Record<string, unknown>): Promise<Answer> {
  const { terminalKey, password, apiUrl } = tbank()
  const body = { TerminalKey: terminalKey, ...params }
  const Token = signRequest(body, password)
  let data: Answer
  try {
    const res = await axios.post<Answer>(`${apiUrl}/${method}`, { ...body, Token }, { timeout: 15_000 })
    data = res.data
  } catch (err) {
    logger.error({ message: 'T-Bank request failed', method, error: axios.isAxiosError(err) ? `${err.code ?? ''} ${err.response?.status ?? ''} ${err.message}` : String(err) })
    throw new TbankError('Платёжный сервис не ответил. Попробуйте через несколько минут.', 'NETWORK')
  }
  if (!data || data.Success !== true) {
    logger.warn({ message: 'T-Bank answered with an error', method, errorCode: data?.ErrorCode, detail: data?.Message, details: data?.Details })
    throw new TbankError(userFacingProviderError(data?.ErrorCode), data?.ErrorCode ?? 'UNKNOWN', { message: data?.Message, details: data?.Details })
  }
  return data
}

// Only the codes a subscriber can act on get their own line; the rest is
// «try later» because a retry is genuinely what helps. Codes from
// developer.tbank.ru/eacq/intro/developer/errors.
function userFacingProviderError(code: string | undefined): string {
  switch (code) {
    case '1006': case '1051': case '1076': case '1082': case '1096':
      return 'Банк отклонил операцию по этой карте. Попробуйте другую карту.'
    case '1054': return 'Срок действия карты истёк. Укажите другую карту.'
    case '1065': case '3020':
      return 'Оплата по сохранённой карте отклонена. Оплатите заново — карта будет сохранена снова.'
    default:
      return 'Платёж не прошёл. Попробуйте ещё раз через несколько минут.'
  }
}

export async function init(p: InitParams): Promise<InitResult> {
  const data = await call('Init', {
    Amount:          p.amountKopecks,
    OrderId:         p.orderId,
    Description:     p.description.slice(0, 140),
    CustomerKey:     p.customerKey,
    ...(p.recurrent ? { Recurrent: 'Y' } : {}),
    PayType:         'O',
    Language:        p.language ?? 'ru',
    SuccessURL:      p.successUrl,
    FailURL:         p.failUrl,
    NotificationURL: p.notificationUrl,
    ...(p.receipt ? { Receipt: p.receipt } : {}),
  })
  if (!data.PaymentId || !data.PaymentURL) throw new TbankError('Платёжный сервис вернул неполный ответ. Попробуйте ещё раз.', 'MALFORMED')
  return { paymentId: String(data.PaymentId), paymentUrl: data.PaymentURL, status: data.Status ?? 'NEW' }
}

/** Debit a saved card. A declined card comes back as Success:false and is thrown as TbankError. */
export async function charge(paymentId: string, rebillId: string): Promise<ChargeResult> {
  const data = await call('Charge', { PaymentId: paymentId, RebillId: rebillId })
  return { paymentId: String(data.PaymentId ?? paymentId), status: data.Status ?? '', errorCode: data.ErrorCode }
}

export async function getState(paymentId: string): Promise<StateResult> {
  const data = await call('GetState', { PaymentId: paymentId })
  return { paymentId: String(data.PaymentId ?? paymentId), status: data.Status ?? 'UNKNOWN', amountKopecks: Number(data.Amount ?? 0) }
}
