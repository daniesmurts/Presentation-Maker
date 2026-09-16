import { describe, it, expect, vi } from 'vitest'

vi.mock('../db/queries/admin', () => ({}))
vi.mock('../db/queries/users', () => ({}))

import { readListParams } from './admin'
import { requireAdmin } from '../middleware/requireAdmin'
import { NotFoundError } from '../errors/AppError'
import type { Request, Response } from 'express'

describe('requireAdmin', () => {
  const call = (user: unknown) => {
    const next = vi.fn()
    requireAdmin({ user } as Request, {} as Response, next)
    return next.mock.calls[0][0]
  }
  it('lets an admin through and answers 404 — not 403 — to everyone else', () => {
    expect(call({ is_admin: true })).toBeUndefined()
    expect(call({ is_admin: false })).toBeInstanceOf(NotFoundError)
    expect(call(undefined)).toBeInstanceOf(NotFoundError)
  })
})

describe('readListParams', () => {
  it('defaults and clamps', () => {
    expect(readListParams({})).toEqual({ q: undefined, tier: undefined, sort: 'created', page: 1, pageSize: 50 })
    expect(readListParams({ page: '-3', sort: 'evil', tier: 'gold' })).toMatchObject({ page: 1, sort: 'created', tier: undefined })
  })
  it('reads a search, a tier and a sort', () => {
    expect(readListParams({ q: '  ivan ', tier: 'pro', sort: 'spend', page: '2' })).toMatchObject({ q: 'ivan', tier: 'pro', sort: 'spend', page: 2 })
  })
})
