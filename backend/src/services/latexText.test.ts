import { describe, it, expect } from 'vitest'
import { latexToPlainText, cleanForSlide } from './latexText'

describe('latexToPlainText', () => {
  it('converts Greek letters', () => {
    expect(latexToPlainText(String.raw`\rho g Q H`)).toBe('ρ g Q H')
  })
  it('does not let a longer command name get shadowed by a shorter one', () => {
    expect(latexToPlainText(String.raw`\varrho`)).toBe('ρ')
    expect(latexToPlainText(String.raw`\varepsilon`)).toBe('ε')
  })
  it('converts \\frac to a parenthesised division', () => {
    expect(latexToPlainText(String.raw`\frac{a}{b}`)).toBe('(a)/(b)')
  })
  it('converts \\frac whose arguments themselves contain a subscript (nested braces)', () => {
    expect(latexToPlainText(String.raw`\eta = \frac{P_{полезн}}{P_{затрач}}`)).toBe('η = (P_полезн)/(P_затрач)')
  })
  it('converts \\sqrt with and without braces', () => {
    expect(latexToPlainText(String.raw`\sqrt{2gh}`)).toBe('√(2gh)')
    expect(latexToPlainText(String.raw`\sqrt2`)).toBe('√2')
  })
  it('converts single- and multi-character super/subscripts', () => {
    expect(latexToPlainText('v^2 + h_1')).toBe('v² + h₁')
    expect(latexToPlainText('x^{10} + a_{12}')).toBe('x¹⁰ + a₁₂')
    expect(latexToPlainText('a_{max}')).toBe('a_max')
  })
  it('converts common operators', () => {
    expect(latexToPlainText(String.raw`a \cdot b \leq c \to \infty`)).toBe('a · b ≤ c → ∞')
  })
  it('drops the backslash from an unrecognised command instead of leaving it raw', () => {
    expect(latexToPlainText(String.raw`\mathrm{Re} > 2300`)).toBe('mathrmRe > 2300')
  })
  it('leaves plain arithmetic untouched', () => {
    expect(latexToPlainText('P = 2 + 2')).toBe('P = 2 + 2')
  })
})

describe('cleanForSlide', () => {
  it('strips single and multi-number citation markers', () => {
    expect(cleanForSlide('Тезис [1] и ещё [2, 3].')).toBe('Тезис и ещё .')
  })
  it('converts inline and block LaTeX to readable Unicode', () => {
    expect(cleanForSlide('Подача $Q$ и $$\\rho g$$')).toBe('Подача Q и ρ g')
  })
  it('leaves plain text untouched', () => {
    expect(cleanForSlide('Обычный текст без разметки')).toBe('Обычный текст без разметки')
  })
})
