import { client } from './client'
import type { Draft, DraftCard } from '../../../shared/types'

export interface DraftListItem {
  id: string; title: string; message_count: number; job_id: string | null; talk_id: string | null
  created_at: string; updated_at: string
}

const unwrap = (r: { data: { draft: Draft } }) => r.data.draft

export const listDrafts  = () => client.get<{ drafts: DraftListItem[] }>('/api/drafts').then((r) => r.data.drafts)
export const createDraft = (card?: Partial<DraftCard>) => client.post<{ draft: Draft }>('/api/drafts', card ? { card } : {}).then(unwrap)
export const getDraft    = (id: string) => client.get<{ draft: Draft }>(`/api/drafts/${id}`).then(unwrap)
export const saveCard    = (id: string, card: DraftCard) => client.patch<{ draft: Draft }>(`/api/drafts/${id}`, { card }).then(unwrap)
export const deleteDraft = (id: string) => client.delete(`/api/drafts/${id}`).then(() => undefined)
// A turn is a model call — the default 60 s is enough, but a slow provider
// hour is not a reason to show a failure over a reply that is still coming.
export const sendMessage = (id: string, text: string) => client.post<{ draft: Draft }>(`/api/drafts/${id}/messages`, { text }, { timeout: 120_000 }).then(unwrap)
export const collectDraft = (id: string) => client.post<{ job: { id: string } }>(`/api/drafts/${id}/talk`).then((r) => r.data.job)
// Edit a message of yours: the conversation is cut before it and the
// corrected text is sent as the turn (see routes/drafts.ts).
export const editMessage = (id: string, idx: number, text: string) => client.post<{ draft: Draft }>(`/api/drafts/${id}/messages/${idx}/edit`, { text }, { timeout: 120_000 }).then(unwrap)
