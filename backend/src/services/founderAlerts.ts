// Founder alerts — a short e-mail to the operator when something worth
// knowing about happens: a new account, a Pro payment, a refund, a failed
// renewal, a support message, a free-months promo redeemed. Not analytics (that
// is `talk_events` + /admin), not a user-facing letter (lib/emailTemplates):
// the audience is one person who wants to hear about it *now* without
// polling the admin panel.
//
// Recipients: FOUNDER_ALERT_EMAILS, falling back to ADMIN_EMAILS — the
// person who can open /admin is the person who wants the ping. Nobody
// configured → nothing sent (dev/CI, an on-prem box). Every send is
// fire-and-forget through emailTransport, which already swallows provider
// failures: a Unisender outage must never fail a registration or a
// T-Bank webhook (the latter would make T-Bank retry a payment we had
// already applied).

import { config } from '../lib/config'
import { logger } from '../lib/logger'
import { sendEmail } from './emailTransport'

const fmtRub = (kopecks: number) => `${(kopecks / 100).toLocaleString('ru-RU')} ₽`
const fmtDate = (d: Date) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s*г\.$/, '')

function recipients(): string[] {
  const own = (process.env.FOUNDER_ALERT_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  return own.length ? own : config.adminEmails
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

function render(title: string, lines: Array<[string, string]>): { subject: string; html: string; text: string } {
  const rows = lines.map(([k, v]) => `<tr><td style="color:#5B6170;padding:2px 12px 2px 0;">${esc(k)}</td><td style="padding:2px 0;">${esc(v)}</td></tr>`).join('')
  return {
    subject: `${title} — Тезариум`,
    html: `<!doctype html><html><body style="font-family:sans-serif;color:#15171C;max-width:480px;margin:0 auto;padding:24px 16px;"><h1 style="font-size:18px;margin:0 0 12px;">${esc(title)}</h1><table style="font-size:14px;border-collapse:collapse;">${rows}</table></body></html>`,
    text: `${title}\n\n${lines.map(([k, v]) => `${k}: ${v}`).join('\n')}`,
  }
}

async function deliver(mail: { subject: string; html: string; text: string }): Promise<void> {
  const to = recipients()
  if (!to.length) return
  // The operator's own address must never be a way to fail the request
  // that triggered the alert — same posture as every other sendEmail call.
  await Promise.all(to.map((email) => sendEmail({ to: email, ...mail }))).catch((err) => {
    logger.error({ message: 'Founder alert failed', subject: mail.subject, err: err instanceof Error ? err.message : String(err) })
  })
}

export type SignupVia = 'password' | 'yandex'

/** A new account. Skips the operator's own registrations — nobody needs a letter about themselves. */
export function alertSignup(p: { email: string; displayName: string | null; via: SignupVia; referred: boolean }): void {
  if (config.adminEmails.includes(p.email.toLowerCase())) return
  void deliver(render('Новая регистрация', [
    ['E-mail', p.email],
    ['Имя', p.displayName ?? '—'],
    ['Через', p.via === 'yandex' ? 'Яндекс ID' : 'пароль'],
    ['По реферальной ссылке', p.referred ? 'да' : 'нет'],
    ['Когда', new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) + ' (МСК)'],
  ]))
}

/** A CONFIRMED T-Bank payment — the first month or a renewal. */
export function alertProPayment(p: { email: string | null; workspaceId: string; kind: 'initial' | 'renewal'; amountKopecks: number; until: Date; orderId: string; promo: boolean }): void {
  void deliver(render(p.kind === 'initial' ? 'Купили Pro' : 'Pro продлён', [
    ['E-mail', p.email ?? '—'],
    ['Сумма', fmtRub(p.amountKopecks) + (p.promo ? ' (по промокоду)' : '')],
    ['Pro до', fmtDate(p.until)],
    ['Заказ', p.orderId],
    ['Workspace', p.workspaceId],
  ]))
}

/** A refund seen on the T-Bank webhook — done by the operator in the cabinet,
 *  but the *effect* (Pro revoked or not) is decided here, so say what happened. */
export function alertRefund(p: { email: string | null; workspaceId: string; kind: 'initial' | 'renewal'; amountKopecks: number; status: string; orderId: string; currentPeriod: boolean; revoked: boolean }): void {
  const effect = p.status !== 'REFUNDED' ? 'частичный возврат — Pro не тронут, разбирает поддержка'
    : !p.currentPeriod ? 'возврат за прошлый период — Pro не тронут'
    : p.revoked ? 'Pro отозван, автопродление выключено' : 'текущий период, но Pro уже не был активен'
  void deliver(render('Возврат платежа', [
    ['E-mail', p.email ?? '—'],
    ['Сумма', fmtRub(p.amountKopecks)],
    ['Платёж', p.kind === 'initial' ? 'первый месяц' : 'продление'],
    ['Статус Т-Банка', p.status],
    ['Эффект', effect],
    ['Заказ', p.orderId],
    ['Workspace', p.workspaceId],
  ]))
}

/** A renewal charge declined — the buyer got their letter; this is yours. */
export function alertRenewalFailed(p: { email: string | null; workspaceId: string; orderId: string; failures: number; autoRenewOff: boolean; graceUntil: Date }): void {
  void deliver(render(p.autoRenewOff ? 'Автопродление выключено после отказов' : 'Не прошло продление Pro', [
    ['E-mail', p.email ?? '—'],
    ['Отказов подряд', String(p.failures)],
    ['Автопродление', p.autoRenewOff ? 'выключено' : 'повторим завтра'],
    ['Pro действует до', fmtDate(p.graceUntil)],
    ['Заказ', p.orderId],
    ['Workspace', p.workspaceId],
  ]))
}

/** A message through the public /contact form — lands in the admin inbox, and now in yours. */
export function alertSupportMessage(p: { name: string; email: string; category: string; message: string }): void {
  const category = ({ general: 'общий вопрос', support: 'техподдержка', billing: 'оплата' } as Record<string, string>)[p.category] ?? p.category
  void deliver(render('Новое обращение', [
    ['От', `${p.name} <${p.email}>`],
    ['Тема', category],
    ['Сообщение', p.message],
  ]))
}

/** Pro granted by a free-months promo code — no money moved, but it is a Pro workspace now. */
export function alertPromoRedeemed(p: { email: string | null; workspaceId: string; code: string; months: number; until: Date | null }): void {
  void deliver(render('Pro по промокоду', [
    ['E-mail', p.email ?? '—'],
    ['Код', p.code],
    ['Месяцев', String(p.months)],
    ['Pro до', p.until ? fmtDate(p.until) : '—'],
    ['Workspace', p.workspaceId],
  ]))
}
