// Plain, unbranded HTML — no design-system investment here yet (CLAUDE.md
// §6 tokens are for the app, not mail clients, which strip most CSS anyway).
// Every template returns { subject, html, text } so a broken HTML render
// never leaves a recipient with nothing readable.

function wrap(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="font-family:sans-serif;color:#15171C;max-width:480px;margin:0 auto;padding:24px 16px;">
<h1 style="font-size:20px;margin:0 0 16px;">${title}</h1>
${bodyHtml}
<p style="margin-top:32px;font-size:13px;color:#8B909C;">Тезариум · tezarium.ru</p>
</body></html>`
}

function button(url: string, label: string): string {
  return `<p style="margin:24px 0;"><a href="${url}" style="display:inline-block;background:#15171C;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:15px;">${label}</a></p>`
}

export function verifyEmailEmail(displayName: string | null, verifyUrl: string) {
  const greeting = displayName ? `${displayName}, здравствуйте!` : 'Здравствуйте!'
  return {
    subject: 'Подтвердите e-mail — Тезариум',
    html: wrap('Подтвердите e-mail', `<p>${greeting}</p><p>Чтобы подтвердить, что этот адрес принадлежит вам, перейдите по ссылке:</p>${button(verifyUrl, 'Подтвердить e-mail')}<p style="font-size:13px;color:#5B6170;">Ссылка не имеет срока действия. Если вы не регистрировались в Тезариуме, просто проигнорируйте это письмо.</p>`),
    text: `${greeting}\n\nЧтобы подтвердить e-mail, перейдите по ссылке:\n${verifyUrl}\n\nЕсли вы не регистрировались в Тезариуме, проигнорируйте это письмо.`,
  }
}

export function passwordResetEmail(displayName: string | null, resetUrl: string) {
  const greeting = displayName ? `${displayName}, здравствуйте!` : 'Здравствуйте!'
  return {
    subject: 'Сброс пароля — Тезариум',
    html: wrap('Сброс пароля', `<p>${greeting}</p><p>Мы получили запрос на сброс пароля для вашего аккаунта. Ссылка действует 1 час:</p>${button(resetUrl, 'Сбросить пароль')}<p style="font-size:13px;color:#5B6170;">Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо — пароль останется прежним.</p>`),
    text: `${greeting}\n\nСсылка для сброса пароля (действует 1 час):\n${resetUrl}\n\nЕсли вы не запрашивали сброс пароля, проигнорируйте это письмо.`,
  }
}

export function passwordChangedEmail(displayName: string | null) {
  const greeting = displayName ? `${displayName}, здравствуйте!` : 'Здравствуйте!'
  return {
    subject: 'Пароль изменён — Тезариум',
    html: wrap('Пароль изменён', `<p>${greeting}</p><p>Пароль вашего аккаунта в Тезариуме только что был изменён. Если это были не вы — напишите нам: hello@tezarium.ru.</p>`),
    text: `${greeting}\n\nПароль вашего аккаунта в Тезариуме только что был изменён. Если это были не вы — напишите нам: hello@tezarium.ru.`,
  }
}

// ─── Subscription ───────────────────────────────────────────────────────────
// Each of these restates the terms the buyer agreed to — amount, period, how
// to cancel, how to ask for a refund — so a later dispute meets a paper trail
// on their side too (T-Bank's condition for recurring charges, 2026-09-16).

const REFUND_LINE =
  'Возврат: последнее списание возвращается полностью, если вы попросите в течение 14 дней после него и не пользовались оплаченным периодом. ' +
  'Напишите на hello@tezarium.ru или через форму на tezarium.ru/contact — ответим в течение 2 рабочих дней.'

const fmtDate = (d: Date) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s*г\.$/, '')
const fmtRub  = (kopecks: number) => `${(kopecks / 100).toLocaleString('ru-RU')} ₽`

export function subscriptionStartedEmail(p: { displayName: string | null; amountKopecks: number; priceRub: number; until: Date; last4: string | null; billingUrl: string }) {
  const greeting = p.displayName ? `${p.displayName}, здравствуйте!` : 'Здравствуйте!'
  const card = p.last4 ? ` с карты ····${p.last4}` : ''
  const body =
    `Тариф Pro подключён до ${fmtDate(p.until)}. Списано ${fmtRub(p.amountKopecks)}. ` +
    `Далее ${p.priceRub.toLocaleString('ru-RU')} ₽ будут списываться ежемесячно, автоматически${card}, за день до конца оплаченного месяца — пока вы не отключите автопродление.`
  const cancel = 'Отключить автопродление можно в любой момент на странице «Тариф» — оплаченный месяц дорабатывает до конца.'
  return {
    subject: 'Подписка Pro оформлена — Тезариум',
    html: wrap('Подписка Pro оформлена', `<p>${greeting}</p><p>${body}</p><p>${cancel}</p>${button(p.billingUrl, 'Открыть «Тариф»')}<p style="font-size:13px;color:#5B6170;">${REFUND_LINE}</p>`),
    text: `${greeting}\n\n${body}\n\n${cancel}\n${p.billingUrl}\n\n${REFUND_LINE}`,
  }
}

export function subscriptionRenewedEmail(p: { displayName: string | null; amountKopecks: number; until: Date; last4: string | null; billingUrl: string }) {
  const greeting = p.displayName ? `${p.displayName}, здравствуйте!` : 'Здравствуйте!'
  const body = `Списано ${fmtRub(p.amountKopecks)}${p.last4 ? ` с карты ····${p.last4}` : ''} — тариф Pro продлён до ${fmtDate(p.until)}.`
  const cancel = 'Отключить автопродление можно в любой момент на странице «Тариф».'
  return {
    subject: 'Pro продлён — Тезариум',
    html: wrap('Pro продлён', `<p>${greeting}</p><p>${body}</p><p>${cancel}</p>${button(p.billingUrl, 'Открыть «Тариф»')}<p style="font-size:13px;color:#5B6170;">${REFUND_LINE}</p>`),
    text: `${greeting}\n\n${body}\n\n${cancel}\n${p.billingUrl}\n\n${REFUND_LINE}`,
  }
}

export function renewalFailedEmail(p: { displayName: string | null; graceUntil: Date; autoRenewOff: boolean; billingUrl: string }) {
  const greeting = p.displayName ? `${p.displayName}, здравствуйте!` : 'Здравствуйте!'
  const body = p.autoRenewOff
    ? `Списание за Pro не прошло несколько раз подряд — автопродление выключено. Pro действует до ${fmtDate(p.graceUntil)}; чтобы продолжить, оплатите месяц заново на странице «Тариф» — карта сохранится снова.`
    : `Списание за Pro не прошло: карта отклонена. Мы попробуем ещё раз завтра; Pro действует до ${fmtDate(p.graceUntil)}. Если хотите оплатить другой картой — на странице «Тариф».`
  return {
    subject: 'Не удалось продлить Pro — Тезариум',
    html: wrap('Не удалось продлить Pro', `<p>${greeting}</p><p>${body}</p>${button(p.billingUrl, 'Открыть «Тариф»')}<p style="font-size:13px;color:#5B6170;">Вопросы по списанию — hello@tezarium.ru.</p>`),
    text: `${greeting}\n\n${body}\n${p.billingUrl}\n\nВопросы по списанию — hello@tezarium.ru.`,
  }
}
