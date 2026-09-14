import { client } from './client'

export interface ThemeSwatch { id: string; name: string; bg: string; ink: string; accent: string; panel: string }
export interface BrandContrast { theme: string; ratio: number; textSafe: boolean }
export interface Brand {
  accent:   string | null                          // 6-digit hex, no '#'
  name:     string | null
  logo:     { url: string; width: number | null; height: number | null } | null
  contrast: BrandContrast[]
}
export interface BrandResponse { brand: Brand; themes: ThemeSwatch[]; style_learning: boolean }

export const getBrand    = () => client.get<BrandResponse>('/api/brand').then((r) => r.data)
export const updateBrand = (patch: { accent?: string | null; name?: string | null }) => client.put<{ brand: Brand }>('/api/brand', patch).then((r) => r.data.brand)
export function uploadLogo(file: File) {
  const form = new FormData(); form.append('file', file)
  return client.post<{ brand: Brand }>('/api/brand/logo', form).then((r) => r.data.brand)
}
export const setStyleLearning = (enabled: boolean) => client.put<{ style_learning: boolean }>('/api/brand/style-learning', { enabled }).then((r) => r.data.style_learning)
export const removeLogo = () => client.delete<{ brand: Brand }>('/api/brand/logo').then((r) => r.data.brand)
