import { client } from './client'
import type { Talk, TalkJob, OutlineSlide, Intent, Audience, TalkLanguage } from '../../../shared/types'

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
