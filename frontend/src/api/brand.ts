import { client } from './client'

import type { BackgroundRecipe } from '../../../shared/slideBackground'
import type { Theme } from '../../../shared/themes'
export type { Theme }
export interface ThemeSwatch { id: string; name: string; bg: string; ink: string; ink2: string; accent: string; panel: string; background: BackgroundRecipe }
export interface BrandContrast { theme: string; ratio: number; textSafe: boolean }
export interface Brand {
  accent:   string | null                          // 6-digit hex, no '#'
  name:     string | null
  logo:     { url: string; width: number | null; height: number | null } | null
  contrast: BrandContrast[]
}
export interface BrandResponse { brand: Brand; themes: ThemeSwatch[]; custom_theme: Theme | null; style_learning: boolean }
// Design v3 (L3): a candidate theme from one of three sources, with the
// corrections the validator made; PUT saves it (validated again).
export interface ThemeIssue { pair: string; ratio: number; floor: number }
export interface ThemeCandidate { theme: Theme; issues: ThemeIssue[] }
export const generateTheme = (description: string) => client.post<ThemeCandidate>('/api/brand/theme/generate', { description }).then((r) => r.data)
export const deriveTheme   = (mode: 'light' | 'dark') => client.post<ThemeCandidate>('/api/brand/theme/derive', { mode }).then((r) => r.data)
export function themeFromPptx(file: File) {
  const form = new FormData(); form.append('file', file)
  return client.post<ThemeCandidate>('/api/brand/theme/from-pptx', form).then((r) => r.data)
}
export const saveTheme   = (theme: Theme) => client.put<ThemeCandidate & { themes: ThemeSwatch[] }>('/api/brand/theme', { theme }).then((r) => r.data)
export const removeTheme = () => client.delete<{ themes: ThemeSwatch[] }>('/api/brand/theme').then((r) => r.data)

export const getBrand    = () => client.get<BrandResponse>('/api/brand').then((r) => r.data)
export const updateBrand = (patch: { accent?: string | null; name?: string | null }) => client.put<{ brand: Brand }>('/api/brand', patch).then((r) => r.data.brand)
export function uploadLogo(file: File) {
  const form = new FormData(); form.append('file', file)
  return client.post<{ brand: Brand }>('/api/brand/logo', form).then((r) => r.data.brand)
}
export const setStyleLearning = (enabled: boolean) => client.put<{ style_learning: boolean }>('/api/brand/style-learning', { enabled }).then((r) => r.data.style_learning)
export const removeLogo = () => client.delete<{ brand: Brand }>('/api/brand/logo').then((r) => r.data.brand)
