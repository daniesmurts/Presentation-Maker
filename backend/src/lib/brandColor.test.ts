import { describe, it, expect } from 'vitest'
import { normaliseHex, contrastRatio, isTextSafe, textOn } from './brandColor'

describe('normaliseHex', () => {
  it('accepts 3- and 6-digit forms with or without #, upper-cases', () => {
    expect(normaliseHex('#0f6e6e')).toBe('0F6E6E')
    expect(normaliseHex('abc')).toBe('AABBCC')
    expect(normaliseHex(' #ABCDEF ')).toBe('ABCDEF')
  })
  it('refuses anything else', () => {
    for (const bad of ['red', '#12345', 'zzzzzz', 12, null, '']) expect(normaliseHex(bad)).toBeNull()
  })
})

describe('contrastRatio — the numbers written in the code must be reproducible', () => {
  it('matches the recorded palette ratios', () => {
    expect(contrastRatio('0F6E6E', 'FFFFFF')).toBeCloseTo(6.04, 1)   // accent on white (index.css)
    expect(contrastRatio('966508', 'FFFFFF')).toBeCloseTo(5.05, 1)   // the parent's amber (CLAUDE.md §6)
    expect(contrastRatio('8A9793', 'FFFFFF')).toBeCloseTo(3.03, 1)   // ink-tertiary — graphics only
  })
  it('is symmetric', () => {
    expect(contrastRatio('123456', 'FEDCBA')).toBeCloseTo(contrastRatio('FEDCBA', '123456'), 6)
  })
  it('the parent’s original amber C8860A fails as text on white — the incident in §3.8', () => {
    expect(isTextSafe('C8860A', 'FFFFFF')).toBe(false)
    expect(contrastRatio('C8860A', 'FFFFFF')).toBeCloseTo(3.06, 1)
  })
})

describe('textOn', () => {
  it('picks white on a dark accent and ink on a pale one', () => {
    expect(textOn('0F6E6E')).toBe('FFFFFF')
    expect(textOn('F4C55A')).toBe('16201F')
  })
})
