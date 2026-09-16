import { yandexAuthUrl } from '../../api/auth'
import { copy } from '../../lib/copy'

// A generic circular monogram, not Yandex's own logo mark — swap in the
// official asset from Yandex ID's brand kit if pixel-exact compliance
// ever matters (CLAUDE.md ui-ux-pro-max checklist: don't guess brand
// assets). #FC3F1D is Yandex's public brand red.
function YandexMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r="9" fill="#FC3F1D" />
      <text x="9" y="13" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">Я</text>
    </svg>
  )
}

/** The link is a real navigation (browser leaves the app for
 *  oauth.yandex.ru) — this can never be a <button onClick>. */
export default function YandexButton({ referral }: { referral?: string | null }) {
  return (
    <div className="space-y-2">
      <a
        href={yandexAuthUrl(referral)}
        className="w-full h-10 inline-flex items-center justify-center gap-2.5 rounded-md text-sm font-medium border border-border-strong bg-surface text-ink hover:bg-surface-soft transition-colors motion-safe:active:scale-[0.98]"
      >
        <YandexMark />
        {copy.auth.yandex.button}
      </a>
      <p className="text-xs text-ink-tertiary text-center leading-snug">
        {copy.auth.yandex.disclosureBefore}
        <a href={copy.auth.consent.termsUrl} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-ink-secondary">{copy.auth.consent.terms}</a>
        {copy.auth.yandex.disclosureAnd}
        <a href={copy.auth.consent.privacyUrl} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-ink-secondary">{copy.auth.consent.privacy}</a>
        {copy.auth.yandex.disclosureAfter}
      </p>
    </div>
  )
}
