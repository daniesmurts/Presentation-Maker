// Yandex Metrika, SPA variant (2026-09-16): react-router never triggers a
// real page load, so the plain HTML snippet's auto pageview would fire
// once, on the very first script load, and every subsequent in-app
// navigation (login -> talks -> a talk) would be invisible. initMetrika()
// does the one-time init; trackPageview is called on every route change
// (App.tsx) to send the 'hit' the snippet's own script otherwise misses.
//
// No webvisor here, unlike the public landing site's copy of this snippet:
// webvisor is full session/DOM recording, and this app's screens show the
// user's own тезисы and slide text while they're typing it — that is
// private material, not something to hand a third party by default.

declare global {
  interface Window { ym?: (id: number, action: string, ...rest: unknown[]) => void }
}

const METRIKA_ID = import.meta.env.VITE_YANDEX_METRIKA_ID as string | undefined

export function initMetrika(): void {
  if (!METRIKA_ID || typeof window === 'undefined') return
  /* eslint-disable */
  ;(function (m: any, e: Document, t: string, r: string, i: string, k?: any, a?: any) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments) }
    m[i].l = 1 * (Date.now())
    for (let j = 0; j < e.scripts.length; j++) { if (e.scripts[j].src === r) return }
    k = e.createElement(t); a = e.getElementsByTagName(t)[0]
    k.async = 1; k.src = r; a.parentNode.insertBefore(k, a)
  })(window, document, 'script', `https://mc.yandex.ru/metrika/tag.js?id=${METRIKA_ID}`, 'ym')
  /* eslint-enable */
  window.ym!(Number(METRIKA_ID), 'init', {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    ecommerce: 'dataLayer',
  })
}

export function trackPageview(url: string): void {
  if (!METRIKA_ID || !window.ym) return
  window.ym(Number(METRIKA_ID), 'hit', url)
}
