import { chatJSON } from './llm/registry'
import { sanitiseForPrompt } from '../lib/promptSanitiser'
import { contrastRatio, mixHex, textOn, normaliseHex } from '../lib/brandColor'
import { validateTheme, isThemeShape, DEFAULT_THEME, DARK_THEME, type Theme, type ValidatedTheme } from './themes'
import type { BackgroundKind } from '../../../shared/slideBackground'
import type { TalkLanguage } from '../../../shared/types'

// Design v3 (L3): themes that arrive from somewhere other than the rows in
// shared/themes.ts — a model's answer to «финтех, надёжно, тёмная», a
// derivation from the brand accent, the colour scheme of an uploaded
// .pptx. Each path produces a CANDIDATE that goes through the same two
// gates: `coerceTheme` (shape — every key present, hex valid, faces from
// the allow-list) and `validateTheme` (contrast — a failing pair corrected
// and reported). The model proposes; the contrast code disposes.

// Faces a .pptx carries without embedding, on Windows and Mac alike; the
// PDF maps them to PT Serif / PT Sans by name (talkPdf.ts family()).
export const ALLOWED_FACES = ['Georgia', 'Arial', 'Verdana', 'Trebuchet MS', 'Times New Roman', 'Courier New'] as const
const KINDS: readonly BackgroundKind[] = ['solid', 'wash', 'grid', 'dots', 'band', 'blob']

export const CUSTOM_THEME_ID = 'custom'

/** Anything → a Theme with every field valid; unknown or missing parts
 *  take the base's. The id is always `custom` — one per workspace. */
export function coerceTheme(raw: unknown, base: Theme = DEFAULT_THEME, name?: string): Theme {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const pal = (o.palette && typeof o.palette === 'object' ? o.palette : {}) as Record<string, unknown>
  const hex = (v: unknown, fallback: string) => normaliseHex(v) ?? fallback
  const fonts = (o.fonts && typeof o.fonts === 'object' ? o.fonts : {}) as Record<string, unknown>
  const face = (v: unknown, fallback: string) => (typeof v === 'string' && (ALLOWED_FACES as readonly string[]).includes(v.trim()) ? v.trim() : fallback)
  const bg = (o.background && typeof o.background === 'object' ? o.background : {}) as Record<string, unknown>
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback)
  const bgHex = hex(pal.bg, base.palette.bg)
  const palette = {
    bg: bgHex,
    panel: hex(pal.panel, base.palette.panel),
    ink: hex(pal.ink, base.palette.ink),
    ink2: hex(pal.ink2, base.palette.ink2),
    ink3: hex(pal.ink3, base.palette.ink3),
    accent: hex(pal.accent, base.palette.accent),
    accentText: hex(pal.accentText, ''),
    border: hex(pal.border, base.palette.border),
  }
  if (!palette.accentText) palette.accentText = textOn(palette.accent)
  return {
    id: CUSTOM_THEME_ID,
    name: (name ?? (typeof o.name === 'string' && o.name.trim() ? o.name.trim() : base.name)).slice(0, 40),
    palette,
    fonts: {
      display: face(fonts.display, base.fonts.display),
      body: face(fonts.body, base.fonts.body),
      mono: 'Courier New',
      math: 'Cambria Math',
    },
    margin: base.margin,
    background: {
      kind: typeof bg.kind === 'string' && (KINDS as readonly string[]).includes(bg.kind) ? (bg.kind as BackgroundKind) : base.background.kind,
      hero: num(bg.hero, base.background.hero),
      quiet: num(bg.quiet, base.background.quiet),
    },
  }
}

/** A stored custom theme, read back from JSONB: the shape check and the
 *  validator again — a row written by an older build is still a theme. */
export function readStoredTheme(raw: unknown): Theme | null {
  if (!raw) return null
  const t = isThemeShape(raw) ? raw : coerceTheme(raw)
  return validateTheme({ ...t, id: CUSTOM_THEME_ID }).theme
}

// ─── From a description ─────────────────────────────────────────────────────

const PROMPT: Record<TalkLanguage, (desc: string) => string> = {
  ru: (desc) => `Вы арт-директор. Предложите цветовую тему для слайдов по описанию ниже.

Описание: ${desc}

Верните JSON объект:
{ "name": "<название темы, 1–2 слова>",
  "palette": { "bg": "#RRGGBB — фон слайда", "panel": "#RRGGBB — тонированная плашка на фоне", "ink": "#RRGGBB — основной текст", "ink2": "#RRGGBB — второстепенный текст", "ink3": "#RRGGBB — подписи", "accent": "#RRGGBB — акцент: линии, рубрики, цифры", "accentText": "#RRGGBB — текст на акценте", "border": "#RRGGBB" },
  "fonts": { "display": "<одно из: ${ALLOWED_FACES.join(', ')}>", "body": "<одно из тех же>" },
  "background": { "kind": "<одно из: solid, wash, grid, dots, band, blob>", "hero": <0–1, сила фона на титуле>, "quiet": <0–1, сила на слайдах с текстом, обычно ≤ 0.15> } }

Правила: контраст текста на фоне не меньше 4.5:1 (ink и ink2 на bg и на panel; accent на bg как подпись). Тёмная тема — светлый текст на тёмном фоне. Только JSON.`,
  en: (desc) => `You are an art director. Propose a colour theme for slides from the description below.

Description: ${desc}

Return a JSON object:
{ "name": "<theme name, 1–2 words>",
  "palette": { "bg": "#RRGGBB — slide ground", "panel": "#RRGGBB — a tinted panel on it", "ink": "#RRGGBB — body text", "ink2": "#RRGGBB — secondary text", "ink3": "#RRGGBB — captions", "accent": "#RRGGBB — rules, labels, figures", "accentText": "#RRGGBB — text on the accent", "border": "#RRGGBB" },
  "fonts": { "display": "<one of: ${ALLOWED_FACES.join(', ')}>", "body": "<one of the same>" },
  "background": { "kind": "<one of: solid, wash, grid, dots, band, blob>", "hero": <0–1, strength on the title slide>, "quiet": <0–1, on text slides, usually ≤ 0.15> } }

Rules: text on its ground at 4.5:1 or better (ink and ink2 on bg and panel; accent on bg as a label). A dark theme is light text on a dark ground. JSON only.`,
}

export async function generateThemeFromDescription(description: string, language: TalkLanguage, ctx: { userId: string; workspaceId: string }): Promise<ValidatedTheme> {
  const desc = sanitiseForPrompt(description).slice(0, 400)
  const raw = await chatJSON<unknown>(
    [{ role: 'user', content: PROMPT[language](desc) }],
    'theme',
    { context: { userId: ctx.userId, workspaceId: ctx.workspaceId, feature: 'theme_generate', variant: language }, maxTokens: 600 },
  )
  // A dark answer is coerced against the dark base so a missing key lands
  // on a dark default, not a white panel on a black ground.
  const bg = normaliseHex((raw as { palette?: { bg?: unknown } })?.palette?.bg)
  const base = bg && contrastRatio('FFFFFF', bg) > contrastRatio('000000', bg) ? DARK_THEME : DEFAULT_THEME
  return validateTheme(coerceTheme(raw, base))
}

// ─── From the brand accent ──────────────────────────────────────────────────

/** A whole palette from one colour: the accent, a ground tinted toward it
 *  (light or dark), the ink pulled slightly toward it, a wash. Then
 *  validated like anything else — the brand kit as a derivation, not an
 *  accent override. */
export function deriveThemeFromAccent(accent: string, mode: 'light' | 'dark', name: string): ValidatedTheme {
  const a = normaliseHex(accent) ?? DEFAULT_THEME.palette.accent
  const light = mode === 'light'
  const bg = light ? mixHex('FFFFFF', a, 0.03) : mixHex('101216', a, 0.12)
  const palette = {
    bg,
    panel: light ? mixHex('FFFFFF', a, 0.10) : mixHex(bg, 'FFFFFF', 0.06),
    ink: light ? mixHex('15171C', a, 0.15) : mixHex('F2F3F5', a, 0.05),
    ink2: light ? mixHex('5B6170', a, 0.15) : mixHex('C4C8D0', a, 0.10),
    ink3: light ? mixHex('8B909C', a, 0.10) : mixHex('8B909C', a, 0.10),
    accent: a,
    accentText: textOn(a),
    border: light ? mixHex('FFFFFF', a, 0.25) : mixHex(bg, 'FFFFFF', 0.18),
  }
  const base = light ? DEFAULT_THEME : DARK_THEME
  return validateTheme({ ...base, id: CUSTOM_THEME_ID, name, palette, background: { kind: 'wash', hero: 0.14, quiet: 0.05 } })
}

// ─── From an uploaded .pptx ─────────────────────────────────────────────────

import { extractPptxColorScheme, type PptxColorScheme } from './pptxImport'

/** The deck's scheme → a candidate: lt1 is the ground, dk1 the ink, lt2
 *  the panel, accent1 the accent (accent2 when accent1 is the ink), the
 *  major face for titles when it is one we can carry. Then validated —
 *  Office's defaults (accent1 4472C4 on white: 4.9) mostly pass; a pale
 *  accent gets pushed. */
export function themeFromColorScheme(s: PptxColorScheme, name: string): ValidatedTheme {
  const light = contrastRatio('000000', s.lt1) >= contrastRatio('FFFFFF', s.lt1)
  const accent = s.accent1 === s.dk1 ? s.accent2 : s.accent1
  const face = (f: string | null, fallback: string) => (f && (ALLOWED_FACES as readonly string[]).includes(f) ? f : fallback)
  const base = light ? DEFAULT_THEME : DARK_THEME
  return validateTheme(coerceTheme({
    palette: {
      bg: s.lt1, panel: s.lt2 === s.lt1 ? mixHex(s.lt1, accent, 0.08) : s.lt2, ink: s.dk1,
      ink2: mixHex(s.dk1, s.lt1, 0.3), ink3: mixHex(s.dk1, s.lt1, 0.5),
      accent, accentText: textOn(accent), border: mixHex(s.lt1, s.dk1, 0.2),
    },
    fonts: { display: face(s.majorFont, base.fonts.display), body: face(s.minorFont, base.fonts.body) },
    background: { kind: 'wash', hero: 0.12, quiet: 0.05 },
  }, base, name))
}

export async function themeFromPptx(buffer: Buffer, name: string): Promise<ValidatedTheme | null> {
  const scheme = await extractPptxColorScheme(buffer)
  return scheme ? themeFromColorScheme(scheme, name) : null
}
