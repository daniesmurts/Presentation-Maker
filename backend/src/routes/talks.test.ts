import { describe, it, expect, vi } from 'vitest'

vi.mock('../services/jobQueue', () => ({ getJobQueue: vi.fn() }))
vi.mock('../db/queries/talkJobs', () => ({}))
vi.mock('../db/queries/talks', () => ({}))
vi.mock('../db/queries/users', () => ({}))

import { readGenerateParams, BRIEF_MAX_CHARS } from './talks'
import { ValidationError } from '../errors/AppError'

const ok = { title: 'Тема', intent: 'pitch', audience: 'investors', duration_minutes: 15 }

describe('readGenerateParams', () => {
  it('reads a minimal valid request and defaults notes per intent (CLAUDE.md §10)', () => {
    const p = readGenerateParams(ok, 'u', 'w')
    expect(p).toMatchObject({ userId: 'u', workspaceId: 'w', title: 'Тема', intent: 'pitch', language: 'ru', notesEnabled: false, strictToBrief: false })
    expect(readGenerateParams({ ...ok, intent: 'teach', audience: 'classroom' }, 'u', 'w').notesEnabled).toBe(true)
  })

  it('lets an explicit notes flag override the intent default', () => {
    expect(readGenerateParams({ ...ok, notes_enabled: true }, 'u', 'w').notesEnabled).toBe(true)
  })

  it('rejects a missing title, an unknown intent, and an out-of-range duration with user-facing copy', () => {
    for (const bad of [{ ...ok, title: '' }, { ...ok, intent: 'sell' }, { ...ok, duration_minutes: 0 }, { ...ok, slide_count: 999 }]) {
      expect(() => readGenerateParams(bad, 'u', 'w')).toThrow(ValidationError)
    }
  })

  it('caps the brief — past this the outline call hits the token wall first', () => {
    expect(() => readGenerateParams({ ...ok, brief: 'x'.repeat(BRIEF_MAX_CHARS + 1) }, 'u', 'w')).toThrow(ValidationError)
  })

  it('never lets the client choose the user or workspace', () => {
    const p = readGenerateParams({ ...ok, userId: 'evil', workspaceId: 'evil' }, 'u', 'w')
    expect(p.userId).toBe('u')
    expect(p.workspaceId).toBe('w')
  })
})
