// Password rules — one place, checked on both sides: the form shows them as
// a live checklist, the server refuses a registration that fails them.
// Login is NOT held to these: accounts created before a rule existed must
// still be able to sign in.
export const PASSWORD_RULES = { minLength: 8 } as const

export type PasswordRuleId = 'length' | 'upper' | 'digit'

const CHECKS: Record<PasswordRuleId, (p: string) => boolean> = {
  length: (p) => p.length >= PASSWORD_RULES.minLength,
  upper:  (p) => /\p{Lu}/u.test(p),   // any script's capital — А–Я counts as much as A–Z
  digit:  (p) => /\d/.test(p),
}

export function passwordRuleState(p: string): Array<{ id: PasswordRuleId; ok: boolean }> {
  return (Object.keys(CHECKS) as PasswordRuleId[]).map((id) => ({ id, ok: CHECKS[id](p) }))
}

export function passwordIsStrong(p: string): boolean {
  return passwordRuleState(p).every((r) => r.ok)
}
