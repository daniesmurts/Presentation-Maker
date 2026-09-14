// pg-boss worker for async talk generation. The route enqueues a durable
// job + a talk_jobs row the client polls; nothing holds an HTTP socket
// open for a multi-call generation, and the worker count bounds how many
// decks generate at once.

import type PgBoss from 'pg-boss'
import { generateTalk, planTalk, expandTalk, type GenerateParams } from './talks'
import { createTalk } from '../db/queries/talks'
import {
  getTalkJobByIdUnscoped, setTalkJobProcessing, setTalkJobOutlineReady,
  completeTalkJob, failTalkJob, expireStaleTalkOutlines,
} from '../db/queries/talkJobs'
import { scheduleWithLease } from './schedulerLease'
import { logger } from '../lib/logger'
import { userFacingFailure } from '../lib/userFacingFailure'
import { ValidationError } from '../errors/AppError'

export const TALK_JOB_QUEUE = 'talk-job'

// Which half of generation this message runs:
//   'outline' — plan only, then park the job at 'outline_ready' (the gate).
//   'expand'  — write the deck from the outline stored on the job row.
//   'full'    — both back-to-back, for a user who opted out of the gate.
// One queue with a stage discriminator: the concurrency ceiling that
// matters is "decks generating at once", and two queues would each need
// their own share of it.
export type TalkJobStage = 'full' | 'outline' | 'expand'

export interface TalkJobPayload {
  jobId: string          // talk_jobs row id (NOT the pg-boss job id)
  stage: TalkJobStage
}

// One retry, short backoff. expandTalk's caller persists the talk row and
// then completes the job; a crash between the two would regenerate (and
// re-bill) on retry — the idempotency guard in the handler is what keeps a
// retry cheap, not the low retryLimit alone.
const QUEUE_OPTIONS: PgBoss.Queue = {
  name:            TALK_JOB_QUEUE,
  retryLimit:      1,
  retryDelay:      15,
  retryBackoff:    true,
  expireInSeconds: 10 * 60,
}

// pg-boss v10 has no per-queue concurrency option — the way to run more
// than one job at a time is to register boss.work() more than once. Not
// batchSize: the handler looks at `[job]` only, and pg-boss marks the whole
// fetched batch complete when it resolves, so batchSize > 1 would silently
// drop jobs as "done" without running them.
const CONCURRENCY = Number(process.env.TALK_WORKER_CONCURRENCY) || 4

export const FAILURE_FALLBACK = 'Не удалось создать выступление. Попробуйте ещё раз.'

export async function registerTalkJobWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue(TALK_JOB_QUEUE, QUEUE_OPTIONS)

  for (let i = 0; i < CONCURRENCY; i++) {
    await boss.work<TalkJobPayload>(TALK_JOB_QUEUE, { includeMetadata: true }, async ([job]) => {
      const { jobId, stage } = job.data
      const isLastAttempt = job.retryCount >= job.retryLimit
      try {
        // Idempotency guard for the requeue-after-crash path: if a previous
        // attempt already completed the row, don't generate — and bill —
        // again. 'outline_ready' is terminal for the outline stage for the
        // same reason: the plan is already with the user, and a retry would
        // silently replace it with a different one.
        const existing = await getTalkJobByIdUnscoped(jobId)
        if (!existing || existing.status === 'ready') return
        if (stage === 'outline' && existing.status === 'outline_ready') return

        // The request is read from the row, never from the message: the
        // row is what the route validated, and it is what the sweep clears.
        const params = existing.request as GenerateParams
        if (!params?.userId || !params.workspaceId) throw new ValidationError('Параметры генерации утеряны — создайте выступление заново')

        await setTalkJobProcessing(jobId)

        if (stage === 'outline') {
          const plan = await planTalk(params)
          await setTalkJobOutlineReady(jobId, plan.outline)
          return
        }

        if (stage === 'expand') {
          // The user's edited outline, written by the confirm route.
          const outline = existing.outline
          if (!outline || outline.length === 0) {
            // A ValidationError so the wording — already written for the
            // user — survives userFacingFailure.
            throw new ValidationError('Подтверждённый план не найден — создайте выступление заново')
          }
          const slideTarget = params.slideCountTarget ?? outline.length
          const result = await expandTalk(params, { outline, slideTarget })
          const talk = await createTalk(params, result.slides, result.sources, slideTarget)
          await completeTalkJob(jobId, talk.id)
          return
        }

        const result = await generateTalk(params)
        const talk = await createTalk(params, result.slides, result.sources, result.slideTarget)
        await completeTalkJob(jobId, talk.id)
      } catch (err) {
        logger.error({
          message: 'Talk job failed', jobId, stage,
          attempt: job.retryCount + 1, maxAttempts: job.retryLimit + 1,
          error: (err as Error).message,
        })
        // Only surface a terminal failure once retries are exhausted, so the
        // UI never flashes «failed» right before a silent retry succeeds.
        if (isLastAttempt) {
          // The raw message is in the log line above; what lands in this
          // column is printed to the user verbatim (CLAUDE.md §3.2).
          await failTalkJob(jobId, userFacingFailure(err, FAILURE_FALLBACK)).catch(() => null)
        }
        throw err   // tells pg-boss the attempt failed
      }
    })
  }
}

// ─── Stale-outline sweep ────────────────────────────────────────────────────
//
// A user who closes the tab at the approval gate leaves the job parked at
// 'outline_ready' forever, holding their brief in `request`. 24h rather
// than something tight: an outline abandoned over lunch should still be
// there after lunch, and a parked row costs nothing — no call in flight.
const OUTLINE_TTL_HOURS = 24

export function startTalkOutlineSweeper(): void {
  scheduleWithLease(
    'talk_outline_sweep',
    { intervalMs: 60 * 60 * 1000, leaseMs: 50 * 60_000, firstRunDelayMs: 3 * 60_000 },
    async () => {
      const expired = await expireStaleTalkOutlines(OUTLINE_TTL_HOURS)
      if (expired > 0) logger.info({ message: 'Expired unconfirmed talk outlines', count: expired, ttlHours: OUTLINE_TTL_HOURS })
    },
  )
}
