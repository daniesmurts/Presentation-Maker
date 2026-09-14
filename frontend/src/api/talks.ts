import { client } from './client'
import type { Talk, TalkJob, OutlineSlide, Intent, Audience, TalkLanguage, SharedTalk } from '../../../shared/types'

export interface CreateTalkRequest {
  title:            string
  brief:            string
  intent:           Intent
  audience:         Audience
  language:         TalkLanguage
  duration_minutes: number
  slide_count?:     number
  notes_enabled:    boolean
  strict_to_brief:  boolean
  // Sent explicitly — the backend reads a missing field as true.
  review_outline:   boolean
}

export interface TalkListItem {
  id: string; title: string; intent: Intent; audience: Audience; language: TalkLanguage
  slide_count: number; created_at: string; updated_at: string
}

export const createJob      = (data: CreateTalkRequest) => client.post<TalkJob>('/api/talks/jobs', data).then((r) => r.data)
export const getJob         = (id: string) => client.get<TalkJob>(`/api/talks/jobs/${id}`).then((r) => r.data)
export const confirmOutline = (id: string, outline: OutlineSlide[]) => client.post<TalkJob>(`/api/talks/jobs/${id}/outline`, { outline }).then((r) => r.data)
export const listTalks      = () => client.get<{ talks: TalkListItem[] }>('/api/talks').then((r) => r.data.talks)
export const getTalk        = (id: string) => client.get<{ talk: Talk }>(`/api/talks/${id}`).then((r) => r.data.talk)
export const deleteTalk     = (id: string) => client.delete(`/api/talks/${id}`).then(() => undefined)

// ─── Slide-level editing ────────────────────────────────────────────────────
// Every write returns the whole talk — the client keeps one source of truth.
import type { Slide, SlideType } from '../../../shared/types'
const unwrap = (r: { data: { talk: Talk } }) => r.data.talk

export const updateSlide     = (id: string, idx: number, slide: Slide) => client.patch<{ talk: Talk }>(`/api/talks/${id}/slides/${idx}`, { slide }).then(unwrap)
export const regenerateSlide = (id: string, idx: number, instruction: string) => client.post<{ talk: Talk }>(`/api/talks/${id}/slides/${idx}/regenerate`, { instruction }, { timeout: 120_000 }).then(unwrap)
export const deleteSlide     = (id: string, idx: number) => client.delete<{ talk: Talk }>(`/api/talks/${id}/slides/${idx}`).then(unwrap)
export const insertSlide     = (id: string, afterIndex: number, type: SlideType = 'bullets') => client.post<{ talk: Talk }>(`/api/talks/${id}/slides`, { after_index: afterIndex, type }).then(unwrap)
export const moveSlide       = (id: string, from: number, to: number) => client.post<{ talk: Talk }>(`/api/talks/${id}/slides/move`, { from, to }).then(unwrap)

// ─── Images ─────────────────────────────────────────────────────────────────
export function uploadSlideImage(id: string, idx: number, file: File) {
  const form = new FormData()
  form.append('file', file)
  return client.post<{ talk: Talk }>(`/api/talks/${id}/slides/${idx}/image`, form, { timeout: 60_000 }).then(unwrap)
}
export const removeSlideImage = (id: string, idx: number) => client.delete<{ talk: Talk }>(`/api/talks/${id}/slides/${idx}/image`).then(unwrap)

// ─── Import ─────────────────────────────────────────────────────────────────
export interface ImportResult { talk: Talk; source_slide_count: number; images_imported: number; images_dropped: number }
export function importPptx(file: File) {
  const form = new FormData()
  form.append('file', file)
  return client.post<ImportResult>('/api/talks/import', form, { timeout: 120_000 }).then((r) => r.data)
}

// ─── Theme ──────────────────────────────────────────────────────────────────
export const setTalkTheme = (id: string, theme_id: string) => client.patch<{ talk: Talk }>(`/api/talks/${id}`, { theme_id }).then(unwrap)

// ─── Sharing ────────────────────────────────────────────────────────────────
export const shareTalk   = (id: string) => client.post<{ talk: Talk; share_url: string }>(`/api/talks/${id}/share`).then((r) => r.data)
export const unshareTalk = (id: string) => client.delete<{ talk: Talk }>(`/api/talks/${id}/share`).then(unwrap)
export const getSharedTalk = (token: string) => client.get<{ talk: SharedTalk; themes: unknown[] }>(`/api/shared/${token}`).then((r) => r.data.talk)

// ─── Deck-level rewrite ─────────────────────────────────────────────────────
export const startRewrite = (id: string, instruction: string) => client.post<TalkJob>(`/api/talks/${id}/rewrite`, { instruction }).then((r) => r.data)
export const applyRewrite = (id: string, jobId: string, accept: number[]) => client.post<{ talk: Talk; before: Slide[] }>(`/api/talks/${id}/rewrite/${jobId}/apply`, { accept }).then((r) => r.data)
export const replaceTalkSlides = (id: string, slides: Slide[]) => client.put<{ talk: Talk }>(`/api/talks/${id}/slides`, { slides }).then(unwrap)
export const dismissRewrite = (id: string, jobId: string) => client.delete(`/api/talks/${id}/rewrite/${jobId}`).then(() => undefined)
