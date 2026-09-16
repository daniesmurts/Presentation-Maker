import { describe, it, expect } from 'vitest'
import { yandexAuthorizeUrl, yandexRedirectUri } from './yandexOAuth'

describe('yandexOAuth', () => {
  it('builds an authorize URL carrying response_type, client_id, redirect_uri, and state', () => {
    const url = new URL(yandexAuthorizeUrl('abc123'))
    expect(url.origin + url.pathname).toBe('https://oauth.yandex.ru/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('state')).toBe('abc123')
    expect(url.searchParams.get('redirect_uri')).toBe(yandexRedirectUri())
  })

  it('points the redirect uri at our own callback route, not Yandex', () => {
    expect(yandexRedirectUri()).toContain('/api/auth/yandex/callback')
  })
})
