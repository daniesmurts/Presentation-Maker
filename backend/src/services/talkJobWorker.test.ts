import { describe, it, expect, vi, beforeEach } from 'vitest'
import type PgBoss from 'pg-boss'

vi.mock('./talks', () => ({ generateTalk: vi.fn(), planTalk: vi.fn(), expandTalk: vi.fn() }))
vi.mock('../db/queries/talks', () => ({ createTalk: vi.fn() }))
vi.mock('../db/queries/talkJobs', () => ({
  getTalkJobByIdUnscoped: vi.fn(), setTalkJobProcessing: vi.fn(), setTalkJobOutlineReady: vi.fn(),
  completeTalkJob: vi.fn(), failTalkJob: vi.fn(), expireStaleTalkOutlines: vi.fn(),
}))
vi.mock('./schedulerLease', () => ({ scheduleWithLease: vi.fn() }))
vi.mock('../lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { registerTalkJobWorker, TALK_JOB_QUEUE, type TalkJobPayload } from './talkJobWorker'
import { generateTalk, planTalk, expandTalk } from './talks'
import { createTalk } from '../db/queries/talks'
import { getTalkJobByIdUnscoped, setTalkJobProcessing, setTalkJobOutlineReady, completeTalkJob, failTalkJob } from '../db/queries/talkJobs'
import { TruncatedResponseError } from './llm/modelJson'

const REQUEST = { userId: 'u1', workspaceId: 'w1', title: 'x', brief: '', intent: 'inform', audience: 'team', language: 'ru', durationMinutes: 30, notesEnabled: true, strictToBrief: false }
const OUTLINE = [{ type: 'title' as const, title: 'Вступление', brief: '' }]

type Handler = (jobs: Array<{ data: TalkJobPayload; retryCount: number; retryLimit: number }>) => Promise<void>

// Captures every worker callback pg-boss would invoke (one per boss.work()
// registration — the worker registers several for concurrency).
async function captureHandler(): Promise<Handler> {
  const handlers: Handler[] = []
  const boss = {
    createQueue: vi.fn().mockResolvedValue(undefined),
    work: vi.fn().mockImplementation(async (_q: string, _o: unknown, cb: Handler) => { handlers.push(cb) }),
  } as unknown as PgBoss
  await registerTalkJobWorker(boss)
  expect(boss.createQueue).toHaveBeenCalledWith(TALK_JOB_QUEUE, expect.objectContaining({ name: TALK_JOB_QUEUE }))
  expect(handlers.length).toBeGreaterThan(1)   // concurrency via multiple registrations, not batchSize
  return handlers[0]
}

const job = (stage: TalkJobPayload['stage'], retryCount = 0, retryLimit = 1) =>
  [{ data: { jobId: 'job1', stage }, retryCount, retryLimit }]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getTalkJobByIdUnscoped).mockResolvedValue({ id: 'job1', status: 'pending', request: REQUEST, outline: null } as never)
  vi.mocked(failTalkJob).mockResolvedValue(undefined)
  vi.mocked(createTalk).mockResolvedValue({ id: 'talk1' } as never)
})

describe('talkJobWorker', () => {
  it('outline stage: plans, parks the job at outline_ready, writes no talk', async () => {
    vi.mocked(planTalk).mockResolvedValue({ outline: OUTLINE, slideTarget: 1 })
    await (await captureHandler())(job('outline'))
    expect(setTalkJobProcessing).toHaveBeenCalledWith('job1')
    expect(planTalk).toHaveBeenCalledWith(REQUEST)
    expect(setTalkJobOutlineReady).toHaveBeenCalledWith('job1', OUTLINE)
    expect(expandTalk).not.toHaveBeenCalled()
    expect(createTalk).not.toHaveBeenCalled()
  })

  it('expand stage: reads the user’s edited outline from the ROW, creates the talk, completes the job', async () => {
    vi.mocked(getTalkJobByIdUnscoped).mockResolvedValue({ id: 'job1', status: 'processing', request: REQUEST, outline: OUTLINE } as never)
    vi.mocked(expandTalk).mockResolvedValue({ slides: [], sources: [] })
    await (await captureHandler())(job('expand'))
    expect(expandTalk).toHaveBeenCalledWith(REQUEST, { outline: OUTLINE, slideTarget: 1 })
    expect(createTalk).toHaveBeenCalled()
    expect(completeTalkJob).toHaveBeenCalledWith('job1', 'talk1')
  })

  it('full stage: both halves, no gate', async () => {
    vi.mocked(generateTalk).mockResolvedValue({ outline: OUTLINE, slideTarget: 1, slides: [], sources: [] })
    await (await captureHandler())(job('full'))
    expect(generateTalk).toHaveBeenCalledWith(REQUEST)
    expect(completeTalkJob).toHaveBeenCalledWith('job1', 'talk1')
  })

  it('skips generation when a previous attempt already completed the row (no double bill on requeue)', async () => {
    vi.mocked(getTalkJobByIdUnscoped).mockResolvedValue({ id: 'job1', status: 'ready', request: REQUEST } as never)
    await (await captureHandler())(job('full'))
    expect(generateTalk).not.toHaveBeenCalled()
  })

  it('outline stage does not replace a plan already sitting with the user', async () => {
    vi.mocked(getTalkJobByIdUnscoped).mockResolvedValue({ id: 'job1', status: 'outline_ready', request: REQUEST, outline: OUTLINE } as never)
    await (await captureHandler())(job('outline'))
    expect(planTalk).not.toHaveBeenCalled()
  })

  it('does NOT mark the row failed on a non-final attempt — the UI must not flash «failed» before a silent retry', async () => {
    vi.mocked(planTalk).mockRejectedValue(new Error('boom'))
    await expect((await captureHandler())(job('outline', 0, 1))).rejects.toThrow('boom')
    expect(failTalkJob).not.toHaveBeenCalled()
  })

  it('on the last attempt, stores USER-FACING copy — never the raw message (CLAUDE.md §3.2)', async () => {
    vi.mocked(planTalk).mockRejectedValue(new SyntaxError("Expected ',' or ']' after array element in JSON at position 3203"))
    await expect((await captureHandler())(job('outline', 1, 1))).rejects.toBeInstanceOf(SyntaxError)
    const stored = vi.mocked(failTalkJob).mock.calls[0][1]
    expect(stored).not.toContain('JSON')
    expect(stored).toMatch(/^[^A-Za-z]*$/u)
  })

  it('a truncated answer tells the user to shorten the request, not to retry', async () => {
    vi.mocked(planTalk).mockRejectedValue(new TruncatedResponseError('deepseek-flash', 6200, 'DeepSeek'))
    await expect((await captureHandler())(job('outline', 1, 1))).rejects.toBeTruthy()
    expect(vi.mocked(failTalkJob).mock.calls[0][1]).toMatch(/оборвался.*сократите/)
  })

  it('expand stage with no stored outline fails with the wording written for the user', async () => {
    vi.mocked(getTalkJobByIdUnscoped).mockResolvedValue({ id: 'job1', status: 'processing', request: REQUEST, outline: [] } as never)
    await expect((await captureHandler())(job('expand', 1, 1))).rejects.toBeTruthy()
    expect(vi.mocked(failTalkJob).mock.calls[0][1]).toContain('Подтверждённый план не найден')
  })
})
