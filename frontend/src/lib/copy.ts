// Every user-facing string lives here (CLAUDE.md §1: the three nouns —
// выступление / тезисы / текст докладчика — and «say what it does, never
// what powers it»: no «ИИ», «нейросеть», «модель» in copy). Russian-first;
// an English UI comes with a second table keyed the same way.

import type { Intent, Audience, SlideType, TalkJobStatus } from '../../../shared/types'

/** Russian has three plural forms: 1 слайд / 2 слайда / 5 слайдов. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10, mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} ${few}`
  return `${n} ${many}`
}
export const slidesCount  = (n: number) => plural(n, 'слайд', 'слайда', 'слайдов')
export const minutesCount = (n: number) => plural(n, 'минута', 'минуты', 'минут')

export const INTENT_LABEL: Record<Intent, string> = {
  inform:   'Информировать',
  persuade: 'Убедить',
  teach:    'Научить',
  pitch:    'Питч',
  report:   'Отчитаться',
  workshop: 'Воркшоп',
}
export const INTENT_HINT: Record<Intent, string> = {
  inform:   'донести суть и факты',
  persuade: 'привести к решению или позиции',
  teach:    'объяснить так, чтобы поняли и применили',
  pitch:    'продать идею, продукт или проект',
  report:   'показать результаты и статус',
  workshop: 'вовлечь и отработать на практике',
}

export const AUDIENCE_LABEL: Record<Audience, string> = {
  executives: 'Руководители',
  customers:  'Клиенты',
  team:       'Своя команда',
  conference: 'Конференция',
  classroom:  'Учебная аудитория',
  investors:  'Инвесторы',
}

export const SLIDE_TYPE_LABEL: Record<SlideType, string> = {
  title:      'Титул',
  bullets:    'Тезисы',
  concept:    'Понятие',
  formula:    'Формула',
  comparison: 'Сравнение',
  diagram:    'Схема',
  discussion: 'Вопрос залу',
  cta:        'Призыв',
  summary:    'Итоги',
}

export const JOB_STATUS_LINE: Record<TalkJobStatus, string> = {
  pending:       'Ставим в очередь…',
  processing:    'Работаем…',
  outline_ready: 'План готов — проверьте его',
  ready:         'Готово',
  failed:        'Не получилось',
}

export const copy = {
  brand:        'Тезариум',
  tagline:      'От тезисов — к выступлению',
  nav: { talks: 'Выступления', newTalk: 'Новое выступление', logout: 'Выйти' },
  auth: {
    loginTitle:    'Вход',
    registerTitle: 'Регистрация',
    email:         'E-mail',
    password:      'Пароль',
    displayName:   'Как вас называть',
    login:         'Войти',
    register:      'Создать аккаунт',
    toRegister:    'Нет аккаунта? Зарегистрируйтесь',
    toLogin:       'Уже есть аккаунт? Войдите',
  },
  form: {
    title:        'Тема выступления',
    titleHint:    'Одной строкой: о чём это',
    brief:        'Тезисы',
    briefHint:    'Что вы хотите сказать — списком, абзацами, как удобно. Можно оставить пустым: тогда выступление будет построено по теме.',
    intent:       'Цель',
    audience:     'Аудитория',
    language:     'Язык выступления',
    length:       'Длительность',
    slideCount:   'Или точное число слайдов',
    notes:        'Нужен текст докладчика',
    notesHint:    'Что говорить, пока слайд на экране. Для питча и отчёта, которые читают с экрана, обычно не нужен.',
    strict:       'Только по моим материалам',
    strictHint:   'Ничего не добавлять к тезисам. Если материала мало — слайдов будет меньше.',
    reviewOutline:'Показать план перед написанием слайдов',
    reviewHint:   'Порядок и состав слайдов дешевле поправить сейчас, чем после.',
    submit:       'Построить план',
    submitNoGate: 'Создать выступление',
  },
  outline: {
    heading:   'План выступления',
    lead:      'Проверьте структуру до того, как будут написаны слайды: порядок, тип и состав слайдов сейчас поменять быстро, после — долго. Содержание каждого слайда будет написано по его заголовку и описанию.',
    titlePh:   'Заголовок слайда',
    briefPh:   'Что раскрыть на слайде — конкретно, а не «рассказать про…»',
    add:       'Добавить слайд',
    empty:     'План пуст — добавьте хотя бы один слайд.',
    noTitle:   (n: number) => `${n} без заголовка — не войдут`,
    confirm:   'Написать слайды',
    cancel:    'Отменить',
    writing:   'Пишем слайды — это занимает около минуты.',
    up: 'Выше', down: 'Ниже', insert: 'Добавить слайд ниже', remove: 'Удалить слайд',
  },
  job: {
    planning:  'Строим план выступления — обычно это несколько секунд.',
    writing:   'Пишем слайды — это занимает около минуты.',
    failedLead:'Не получилось',
    back:      'Вернуться к форме',
    open:      'Открыть выступление',
  },
  talk: {
    notes:      'Текст докладчика',
    noNotes:    '—',
    overfull:   'Много текста',
    overfullTip:(reason: string) => `Не поместится на слайд 16:9: ${reason}. В презентации текст обрежется или уедет за край — сократите или разбейте на два слайда.`,
    copy:       'Копировать',
    copied:     'Скопировано',
    imageSlot:  (q: string) => `Изображение: «${q}»`,
    delete:     'Удалить выступление',
    deleteConfirm: 'Удалить это выступление? Это действие нельзя отменить.',
  },
  list: {
    heading: 'Выступления',
    empty:   'Пока ни одного выступления.',
    emptyCta:'Создать первое',
    created: 'Создано',
  },
  errors: {
    generic:  'Что-то пошло не так. Попробуйте ещё раз.',
    network:  'Не удалось связаться с сервером. Проверьте соединение.',
  },
}
