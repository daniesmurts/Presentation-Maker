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
  nav: { talks: 'Выступления', newTalk: 'Новое выступление', brand: 'Бренд', logout: 'Выйти' },
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
    image: {
      upload: 'Загрузить изображение', replace: 'Заменить', remove: 'Убрать изображение',
      hint: 'PNG или JPEG до 8 МБ', credit: (host: string) => host,
    },
    download:   'Скачать .pptx',
    downloadPdf:'Скачать PDF',
    downloadMenu: 'Скачать',
    selected:   (n: number) => `выбрано ${n}`,
    selectAll:  'Выбрать все', clearSelection: 'Снять выбор',
    selectSlide:(n: number) => `Слайд ${n} — выбрать для скачивания`,
    downloadSelected: (fmt: string, n: number) => `${fmt} — только выбранные (${n})`,
    downloadAll: (fmt: string) => `${fmt} — все слайды`,
    withNotes:  'PDF с текстом докладчика',
    share: {
      button: 'Поделиться', on: 'Ссылка открыта', off: 'Закрыть доступ', copy: 'Скопировать ссылку', copied: 'Ссылка скопирована',
      hint: 'По ссылке видно слайды без текста докладчика. Аккаунт не нужен.',
    },
    sharedBadge: 'Открыто по ссылке',
    delete:     'Удалить выступление',
    deleteConfirm: 'Удалить это выступление? Это действие нельзя отменить.',
    edit: {
      up: 'Выше', down: 'Ниже', edit: 'Изменить', close: 'Закрыть', regenerate: 'Переписать', remove: 'Удалить слайд',
      removeConfirm: 'Удалить этот слайд?',
      insertAfter: 'Добавить слайд ниже',
      instructionLabel: 'Что поправить? Можно оставить пустым — тогда слайд просто перепишется заново.',
      instructionPh: 'Короче, и добавь пример с реальными числами',
      undo: 'Вернуть прежний',
      undone: 'Прежний вариант возвращён',
      save: 'Сохранить', cancel: 'Отмена',
      fields: {
        title: 'Заголовок слайда', notes: 'Текст докладчика', subtitle: 'Подзаголовок', presenter: 'Докладчик',
        items: 'Тезисы', definition: 'Определение', supporting: 'Уточнения', formula: (n: number) => `Формула ${n} (LaTeX)`,
        caption: 'Подпись', explanation: 'Пояснение', column: (n: number) => `Колонка ${n} — заголовок`, columnItems: 'Пункты',
        diagramCaption: 'Подпись под изображением', points: 'Пункты под изображением', imageQuery: 'Запрос для поиска изображения',
        question: 'Вопрос залу', prompts: 'Подвопросы', angles: 'Ожидаемые ответы',
        action: 'Призыв к действию', reasons: 'Почему', contact: 'Как откликнуться',
        takeaways: 'Главное', nextSteps: 'Что дальше', perLine: 'По одному пункту на строку',
      },
    },
  },
  import: {
    button:  'Загрузить .pptx',
    hint:    'Своя презентация — как есть, без изменений. Каждый слайд потом можно переписать.',
    busy:    'Читаем презентацию…',
    done:    (n: number, imgs: number) => `Загружено: ${n} ${n === 1 ? 'слайд' : n < 5 ? 'слайда' : 'слайдов'}${imgs ? `, ${imgs} ${imgs === 1 ? 'изображение' : imgs < 5 ? 'изображения' : 'изображений'}` : ''}`,
  },
  brandKit: {
    heading:   'Бренд',
    lead:      'Цвет, логотип и название попадают в каждую скачанную презентацию. Темы задают остальное — шрифты, фон, компоновку.',
    accent:    'Фирменный цвет',
    accentHint:'Линии, полосы и мелкие подписи. Если цвет слишком светлый для текста, подписи останутся тёмными — ниже показано, где именно.',
    reset:     'Сбросить',
    name:      'Название',
    nameHint:  'Компания или проект — одной строкой на титульном слайде.',
    logo:      'Логотип',
    logoHint:  'PNG или JPEG до 2 МБ. Лучше с прозрачным фоном: он ставится и на светлые, и на тёмные темы.',
    upload:    'Загрузить логотип', replace: 'Заменить', removeLogo: 'Убрать',
    preview:   'Как это будет выглядеть',
    previewOnLight: 'на светлой теме', previewOnDark: 'на тёмной теме',
    contrast:  (theme: string, ratio: number, ok: boolean) => `${theme}: ${ratio.toFixed(1)}:1 — ${ok ? 'подписи цветом' : 'подписи тёмным'}`,
    saved:     'Сохранено',
    sampleTitle:  'Название выступления',
    sampleLabel:  'ГЛАВНОЕ',
  },
  theme: {
    label: 'Тема',
  },
  present: {
    button: 'Показать', openSpeaker: 'Окно докладчика', exit: 'Выйти', next: 'Следующий', noNotes: 'Для этого слайда нет текста докладчика.',
    hint: 'Стрелки — листать, F — на весь экран, Esc — выйти. Окно докладчика откройте на втором экране.',
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
