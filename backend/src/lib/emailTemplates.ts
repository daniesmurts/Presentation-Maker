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
