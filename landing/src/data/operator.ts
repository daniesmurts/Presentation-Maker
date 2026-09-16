// The data operator named in the legal documents. FILL IN before the site
// goes live — every field is printed verbatim. The highlighted placeholders
// on the page come from the `[…]` values here.
export const OPERATOR = {
  name:    'ИП БУГЕМБЕ ДАНИЕЛ',
  ogrn:    '322169000192683',
  inn:     '165510859142',
  address: 'г.Казань, ул.Светлая, д.28, кв. 78',
  email:   'hello@tezarium.ru',
  site:    'https://tezarium.ru',
}
export const LEGAL_VERSION = '2026-09-16'   // = TERMS_VERSION in backend/src/db/queries/consent.ts
export const isPlaceholder = (v: string) => v.startsWith('[')
