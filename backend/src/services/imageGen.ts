import { logger } from '../lib/logger'
import { createUsageLog } from '../db/queries/usageLog'
import { checkSpendCap } from './spendCap'
import { checkGlobalSpendCap } from './globalSpendCap'
import { YANDEX_ART_COST_USD } from '../config/pricing'
import { sniffMime } from './slideImageSource'
import { imageSize } from '../lib/imageSize'
import { sanitiseForPrompt } from '../lib/promptSanitiser'
import { AppError } from '../errors/AppError'
import type { Slide, TalkLanguage } from '../../../shared/types'
import type { Theme } from '../../../shared/themes'

// Generated pictures (Design v3, L3's last item; CLAUDE.md §5.4): one more
// way a slide gets an image, landing in the same storage and the same
// `slideImageSource` path as an upload. The provider is YandexART through
// Yandex AI Studio's OpenAI-compatible endpoint — same cloud, same folder
// and API-key scope as everything else on Yandex.
//
// What the first live probe (2026-09-15) taught, so nobody repeats it:
//  - the modelUri alias `yandex-art/latest` answers «Access to model
//    denied» (code 7) with every role and scope in place — it is retired;
//  - the async `imageGenerationAsync` + `/operations/<id>` pair accepts the
//    new `yandex-art-2.0` URI and then stays `done: false` for minutes;
//  - `POST https://ai.api.cloud.yandex.net/v1/images/generations` with
//    model `art://<folder>/aliceai-image-art-3.0` answers in ~3 s with a
//    JPEG (1344 × 768 for a 16:9 ask). That is the one used here.
//  - The API key must carry the scope `yc.ai.imageGeneration.execute`
//    AND the account the role `ai.imageGeneration.user` on the folder.
//
// Costs go to usage_log like a model call (feature `image_generate`,
// YANDEX_ART_COST_USD per picture) and the same spend caps run first —
// a bad hour must not become a bad bill (CLAUDE.md §2).

export class ImageGenUnavailableError extends AppError {
  constructor(message = 'Генерация изображений сейчас недоступна — попробуйте загрузить картинку') {
    super(message, 503, 'IMAGE_GEN_UNAVAILABLE')
  }
}

export type ImageAspect = '16:9' | '4:3' | '1:1'
const SIZE: Record<ImageAspect, string> = { '16:9': '1792x1024', '4:3': '1344x1024', '1:1': '1024x1024' }
const ENDPOINT = 'https://ai.api.cloud.yandex.net/v1/images/generations'
const MODEL = 'aliceai-image-art-3.0'
const TIMEOUT_MS = 60_000
export const PROMPT_MAX_CHARS = 500   // the provider's limit

export function isImageGenConfigured(): boolean {
  return Boolean(process.env.YANDEX_FOLDER_ID && process.env.YANDEX_API_KEY)
}

export interface GeneratedImage { buffer: Buffer; mime: 'image/jpeg' | 'image/png'; width: number; height: number }

/** One picture for `prompt`. Throws ImageGenUnavailableError (503, user
 *  copy) on any provider failure; logs cost and outcome to usage_log. */
export async function generateImage(prompt: string, aspect: ImageAspect, ctx: { userId: string; workspaceId: string; language: TalkLanguage }): Promise<GeneratedImage> {
  const folder = process.env.YANDEX_FOLDER_ID, key = process.env.YANDEX_API_KEY
  if (!folder || !key) throw new ImageGenUnavailableError()
  await checkGlobalSpendCap()
  await checkSpendCap(ctx.workspaceId)

  const started = Date.now()
  const log = (success: boolean, errorCode?: string) =>
    createUsageLog({ userId: ctx.userId, workspaceId: ctx.workspaceId, feature: 'image_generate', variant: aspect, model: `yandex:${MODEL}`, inputTokens: 0, outputTokens: 0, costUsd: success ? YANDEX_ART_COST_USD : 0, durationMs: Date.now() - started, success, errorCode })
      .catch((err) => logger.warn({ message: '[imageGen] usage log failed', error: (err as Error).message }))

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Api-Key ${key}`, 'OpenAI-Project': folder },
      body: JSON.stringify({ model: `art://${folder}/${MODEL}`, prompt: prompt.slice(0, PROMPT_MAX_CHARS), size: SIZE[aspect] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      logger.warn({ message: '[imageGen] provider refused', status: res.status, body: text.slice(0, 300) })
      void log(false, `HTTP_${res.status}`)
      throw new ImageGenUnavailableError()
    }
    const data = (await res.json()) as { data?: Array<{ b64_json?: string }> }
    const b64 = data.data?.[0]?.b64_json
    if (!b64) { void log(false, 'NO_IMAGE'); throw new ImageGenUnavailableError() }
    const buffer = Buffer.from(b64, 'base64')
    const mime = sniffMime(buffer)
    const size = imageSize(buffer)
    if ((mime !== 'image/jpeg' && mime !== 'image/png') || !size) { void log(false, 'BAD_BYTES'); throw new ImageGenUnavailableError() }
    void log(true)
    return { buffer, mime, width: size.width, height: size.height }
  } catch (err) {
    if (err instanceof AppError) throw err
    logger.warn({ message: '[imageGen] request failed', error: (err as Error).message })
    void log(false, (err as Error).name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK')
    throw new ImageGenUnavailableError()
  }
}

// ─── The prompt comes from the slide, not from the model ────────────────────
//
// Learned live on 2026-09-15 (three prompts per slide, pictures looked at):
// «calm, clean shapes, colours #0F6E6E and #FFFFFF, no text, no logos, no
// faces, no watermarks» produced two flat colour blocks — the manner words
// and the hex codes (which the model does not read) crowded out the
// subject. What works: the SUBJECT first, concretely; «flat vector
// illustration for a presentation slide»; the palette as colour NAMES;
// one short negative. The manner per theme is one clause, not a mood
// board. The user sees and may edit the prompt before generation.

const STYLE: Record<TalkLanguage, string> = {
  ru: 'Плоская векторная иллюстрация для слайда презентации',
  en: 'Flat vector illustration for a presentation slide',
}
const MANNER: Record<TalkLanguage, Record<string, string>> = {
  ru: { default: 'минимализм, чёткие формы', dark: 'тёмный фон, мягкий свет', warm: 'тёплая бумага, приглушённые тона', bold: 'контрастно, крупные формы', editorial: 'в духе газетной графики', mono: 'чёрно-белая графика', forest: 'природные формы', ocean: 'вода и воздух, простор', sand: 'земляные тона', violet: 'лёгкая и воздушная', slate: 'строгая, холодный свет', play: 'игривая, простые формы', custom: 'минимализм, чёткие формы' },
  en: { default: 'minimal, clean shapes', dark: 'dark ground, soft light', warm: 'warm paper, muted tones', bold: 'high contrast, large shapes', editorial: 'newspaper graphic style', mono: 'black-and-white graphic', forest: 'natural forms', ocean: 'water and air, open space', sand: 'earth tones', violet: 'light and airy', slate: 'strict, cold light', play: 'playful, simple shapes', custom: 'minimal, clean shapes' },
}
const NEGATIVE: Record<TalkLanguage, string> = { ru: 'Без текста и надписей.', en: 'No text, no lettering.' }

/** A colour NAME for a hex — the model reads «бирюзовый», not #0F6E6E.
 *  Twelve hue buckets, grey when the colour has no chroma, «тёмно-» /
 *  «светло-» from the lightness. */
export function colourName(hex: string, language: TalkLanguage): string {
  const r = parseInt(hex.slice(0, 2), 16) / 255, g = parseInt(hex.slice(2, 4), 16) / 255, b = parseInt(hex.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min
  const ru = language === 'ru'
  if (d < 0.08) return l > 0.9 ? (ru ? 'белый' : 'white') : l < 0.15 ? (ru ? 'чёрный' : 'black') : (ru ? 'серый' : 'grey')
  if (l > 0.85 && d < 0.2) return ru ? 'кремовый' : 'cream'   // a tinted paper (F2E9D8) is not «светло-оранжевый»
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h = (h * 60 + 360) % 360
  const names: Array<[number, string, string]> = [
    [15, 'красный', 'red'], [40, 'оранжевый', 'orange'], [65, 'жёлтый', 'yellow'], [150, 'зелёный', 'green'],
    [190, 'бирюзовый', 'teal'], [250, 'синий', 'blue'], [290, 'фиолетовый', 'violet'], [335, 'розовый', 'pink'], [360, 'красный', 'red'],
  ]
  const [, nameRu, nameEn] = names.find(([upTo]) => h < upTo)!
  const base = ru ? nameRu : nameEn
  if (l < 0.3) return ru ? `тёмно-${base}` : `dark ${base}`
  if (l > 0.7) return ru ? `светло-${base}` : `light ${base}`
  return base
}

/** The subject a slide asks for: its query, else its caption, else its title. */
export function slideImageSubject(slide: Slide): string {
  if (slide.type === 'diagram') return slide.body.image_query || slide.title
  if (slide.image_query) return slide.image_query
  if (slide.type === 'image-full' && slide.body.caption) return `${slide.title} — ${slide.body.caption}`
  if (slide.type === 'section' && slide.body.lead) return `${slide.title} — ${slide.body.lead}`
  return slide.title
}

export function imagePromptForSlide(slide: Slide, theme: Pick<Theme, 'id' | 'palette'>, language: TalkLanguage): string {
  const subject = sanitiseForPrompt(slideImageSubject(slide)).replace(/\s+/g, ' ').trim().replace(/[.。]+$/, '')
  const manner = MANNER[language][theme.id] ?? MANNER[language].default
  const palette = `${colourName(theme.palette.accent, language)} ${language === 'ru' ? 'и' : 'and'} ${colourName(theme.palette.bg, language)}`
  return `${STYLE[language]}: ${subject}. ${manner[0].toUpperCase()}${manner.slice(1)}, ${palette}. ${NEGATIVE[language]}`.slice(0, PROMPT_MAX_CHARS)
}

/** The aspect a slide's picture is laid out in. */
export function aspectForSlide(slide: Slide): ImageAspect {
  return slide.type === 'image-full' || slide.type === 'section' ? '16:9' : slide.type === 'diagram' ? '4:3' : '1:1'
}
