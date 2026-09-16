import { describe, it, expect, vi, beforeEach } from 'vitest'

const { sendEmailMock } = vi.hoisted(() => {
  process.env.ADMIN_EMAILS = 'founder@example.com'
  delete process.env.FOUNDER_ALERT_EMAILS
  return { sendEmailMock: vi.fn() }
})
vi.mock('./emailTransport', () => ({ sendEmail: sendEmailMock }))
vi.mock('../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { alertSignup, alertProPayment, alertRefund, alertRenewalFailed, alertSupportMessage, alertPromoRedeemed } from './founderAlerts'

const flush = () => new Promise((r) => setImmediate(r))

beforeEach(() => { sendEmailMock.mockReset(); sendEmailMock.mockResolvedValue(undefined); delete process.env.FOUNDER_ALERT_EMAILS })

describe('founderAlerts', () => {
  it('a signup mails ADMIN_EMAILS with who and how', async () => {
    alertSignup({ email: 'new@example.com', displayName: 'Аня <b>', via: 'yandex', referred: true })
    await flush()
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    const mail = sendEmailMock.mock.calls[0][0]
    expect(mail.to).toBe('founder@example.com')
    expect(mail.subject).toBe('Новая регистрация — Тезариум')
    expect(mail.text).toContain('new@example.com')
    expect(mail.text).toContain('Яндекс ID')
    expect(mail.text).toContain('По реферальной ссылке: да')
    expect(mail.html).toContain('Аня &lt;b&gt;')   // a display name is user input, never raw HTML
  })

  it('the operator registering does not mail the operator', async () => {
    alertSignup({ email: 'Founder@example.com', displayName: null, via: 'password', referred: false })
    await flush()
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('FOUNDER_ALERT_EMAILS overrides ADMIN_EMAILS and fans out to each address', async () => {
    process.env.FOUNDER_ALERT_EMAILS = 'a@example.com, b@example.com'
    alertProPayment({ email: 'buyer@example.com', workspaceId: 'w1', kind: 'initial', amountKopecks: 99_000, until: new Date('2026-10-16T00:00:00Z'), orderId: 'ws-x-i-1', promo: true })
    await flush()
    expect(sendEmailMock.mock.calls.map((c) => c[0].to)).toEqual(['a@example.com', 'b@example.com'])
    const mail = sendEmailMock.mock.calls[0][0]
    expect(mail.subject).toBe('Купили Pro — Тезариум')
    expect(mail.text).toContain('buyer@example.com')
    expect(mail.text).toContain('(по промокоду)')
  })

  it('a renewal is labelled as one', async () => {
    alertProPayment({ email: null, workspaceId: 'w1', kind: 'renewal', amountKopecks: 99_000, until: new Date(), orderId: 'o', promo: false })
    await flush()
    expect(sendEmailMock.mock.calls[0][0].subject).toBe('Pro продлён — Тезариум')
  })

  it('a mail failure is swallowed', async () => {
    sendEmailMock.mockRejectedValue(new Error('down'))
    expect(() => alertSignup({ email: 'x@example.com', displayName: null, via: 'password', referred: false })).not.toThrow()
    await flush()
  })
})

describe('founderAlerts — follow-ups', () => {
  it('a full refund of the current period says Pro was revoked', async () => {
    alertRefund({ email: 'b@example.com', workspaceId: 'w1', kind: 'initial', amountKopecks: 99_000, status: 'REFUNDED', orderId: 'o', currentPeriod: true, revoked: true })
    await flush()
    const mail = sendEmailMock.mock.calls[0][0]
    expect(mail.subject).toBe('Возврат платежа — Тезариум')
    expect(mail.text).toContain('Pro отозван')
  })
  it('a partial refund says support handles it', async () => {
    alertRefund({ email: null, workspaceId: 'w1', kind: 'renewal', amountKopecks: 1_000, status: 'PARTIAL_REFUNDED', orderId: 'o', currentPeriod: true, revoked: false })
    await flush()
    expect(sendEmailMock.mock.calls[0][0].text).toContain('частичный возврат')
  })
  it('a renewal failure reports the streak and whether auto-renew went off', async () => {
    alertRenewalFailed({ email: 'b@example.com', workspaceId: 'w1', orderId: 'o', failures: 3, autoRenewOff: true, graceUntil: new Date('2026-10-01T00:00:00Z') })
    await flush()
    const mail = sendEmailMock.mock.calls[0][0]
    expect(mail.subject).toContain('Автопродление выключено')
    expect(mail.text).toContain('Отказов подряд: 3')
  })
  it('a support message carries the text, escaped', async () => {
    alertSupportMessage({ name: 'Иван', email: 'i@example.com', category: 'billing', message: 'Не пришёл чек <script>' })
    await flush()
    const mail = sendEmailMock.mock.calls[0][0]
    expect(mail.subject).toBe('Новое обращение — Тезариум')
    expect(mail.text).toContain('Тема: оплата')
    expect(mail.html).toContain('&lt;script&gt;')
  })
  it('a free-months promo names the code', async () => {
    alertPromoRedeemed({ email: 'p@example.com', workspaceId: 'w1', code: 'LAUNCH3', months: 3, until: new Date('2026-12-16T00:00:00Z') })
    await flush()
    expect(sendEmailMock.mock.calls[0][0].text).toContain('Код: LAUNCH3')
  })
})
