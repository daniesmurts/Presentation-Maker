import { client } from './client'
import type { Rehearsal, RehearsalSegment, RehearsalVisit, Talk } from '../../../shared/types'

export interface RehearsalListItem {
  id: string; started_at: string; duration_ms: number; speech_available: boolean
  review_status: Rehearsal['review_status']; words: number; fillers: number
  target_ms: number | null; words_per_min: number | null; over_slides: number
}
export type DeliveredOutcome = 'good' | 'ok' | 'bad'
export interface Delivered { outcome: DeliveredOutcome; at: string }

export interface SaveRehearsalRequest {
  started_at:       string
  duration_ms:      number
  speech_available: boolean
  segments:         RehearsalSegment[]
  visits:           RehearsalVisit[]
}

export const listRehearsals  = (talkId: string) => client.get<{ rehearsals: RehearsalListItem[] }>(`/api/talks/${talkId}/rehearsals`).then((r) => r.data.rehearsals)
export const getRehearsal    = (talkId: string, id: string) => client.get<{ rehearsal: Rehearsal }>(`/api/talks/${talkId}/rehearsals/${id}`).then((r) => r.data.rehearsal)
export const saveRehearsal   = (talkId: string, data: SaveRehearsalRequest) => client.post<{ rehearsal: Rehearsal }>(`/api/talks/${talkId}/rehearsals`, data).then((r) => r.data.rehearsal)
// Batched model calls: a 40-slide rehearsal is ~8 calls; give it room.
export const reviewRehearsal = (talkId: string, id: string) => client.post<{ rehearsal: Rehearsal }>(`/api/talks/${talkId}/rehearsals/${id}/review`, {}, { timeout: 240_000 }).then((r) => r.data.rehearsal)
export const applySpokenNotes = (talkId: string, id: string, slides: number[]) => client.post<{ talk: Talk; before: Talk['slides'] }>(`/api/talks/${talkId}/rehearsals/${id}/apply-notes`, { slides }).then((r) => r.data)
export const deleteRehearsal = (talkId: string, id: string) => client.delete(`/api/talks/${talkId}/rehearsals/${id}`).then(() => undefined)
export const getDelivered  = (talkId: string) => client.get<{ delivered: Delivered | null }>(`/api/talks/${talkId}/rehearsals/delivered`).then((r) => r.data.delivered)
export const setDelivered  = (talkId: string, outcome: DeliveredOutcome) => client.post<{ delivered: Delivered }>(`/api/talks/${talkId}/rehearsals/delivered`, { outcome }).then((r) => r.data.delivered)
