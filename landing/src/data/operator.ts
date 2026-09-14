// The data operator named in the legal documents. FILL IN before the site
// goes live — every field is printed verbatim. The highlighted placeholders
// on the page come from the `[…]` values here.
export const OPERATOR = {
  name:    '[полное наименование: ООО «…» или ИП Фамилия Имя Отчество]',
  ogrn:    '[ОГРН / ОГРНИП]',
  inn:     '[ИНН]',
  address: '[юридический адрес]',
  email:   'hello@tezarium.ru',
  site:    'https://tezarium.ru',
}
export const LEGAL_VERSION = '2026-09-14'   // = TERMS_VERSION in backend/src/db/queries/consent.ts
export const isPlaceholder = (v: string) => v.startsWith('[')
