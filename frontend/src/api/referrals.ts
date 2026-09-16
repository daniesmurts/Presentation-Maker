import { client } from './client'

export interface MyReferral {
  code: string | null
  url:  string | null
  invited: number
  paid:    number
  rewarded: number
  invitee_discount_percent: number
  referrer_reward_days:     number
}

export const getMyReferral = () => client.get<MyReferral>('/api/referrals/me').then((r) => r.data)
