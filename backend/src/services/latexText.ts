// LaTeX → plain Unicode, best-effort — the fallback for slide text where no
// typesetting is available (pptxgenjs has none; formula slides get a PNG via
// formulaRenderer.ts, but inline $...$ in bullets and notes come through
// here). Covers what shows up in generated formulas — Greek, \frac, \sqrt,
// operators, ^/_ scripts — and drops the backslash rather than leaving a
// raw "\command" behind, which reads as broken markup, not math.

const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε',
  zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'θ', iota: 'ι', kappa: 'κ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο', pi: 'π', varpi: 'π',
  rho: 'ρ', varrho: 'ρ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ',
  phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Alpha: 'Α', Beta: 'Β', Gamma: 'Γ', Delta: 'Δ', Epsilon: 'Ε', Zeta: 'Ζ',
  Eta: 'Η', Theta: 'Θ', Iota: 'Ι', Kappa: 'Κ', Lambda: 'Λ', Mu: 'Μ', Nu: 'Ν',
  Xi: 'Ξ', Omicron: 'Ο', Pi: 'Π', Rho: 'Ρ', Sigma: 'Σ', Tau: 'Τ', Upsilon: 'Υ',
  Phi: 'Φ', Chi: 'Χ', Psi: 'Ψ', Omega: 'Ω',
}

const SYMBOLS: Record<string, string> = {
  cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓',
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡',
  infty: '∞', sum: 'Σ', int: '∫', partial: '∂', nabla: '∇', propto: '∝',
  to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', leftrightarrow: '↔',
  degree: '°', circ: '°', ldots: '…', cdots: '…', prime: '′',
}

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', 'n': 'ⁿ', 'i': 'ⁱ',
}
const SUBSCRIPT: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
}

// Longest name first so `\varrho` doesn't half-match on `\rho`.
const COMMAND_NAMES = [...Object.keys(GREEK), ...Object.keys(SYMBOLS)].sort((a, b) => b.length - a.length)
const COMMAND_RE = new RegExp(`\\\\(${COMMAND_NAMES.join('|')})(?![a-zA-Z])`, 'g')

// All-or-nothing: "a_{max}" → "a_max", not "amax" (which reads as a typo).
function scriptOrFallback(content: string, map: Record<string, string>, marker: string): string {
  const chars = [...content]
  return chars.every((ch) => ch in map) ? chars.map((ch) => map[ch]).join('') : marker + content
}

export function latexToPlainText(input: string): string {
  let s = input
  // ONE level of nested braces inside each \frac/\sqrt argument — real
  // formulas subscript a variable inside a \frac, and a brace-free-only
  // pattern fell through to "fracP_..." garbage in the parent.
  const ARG = String.raw`((?:[^{}]|\{[^{}]*\})*)`
  s = s.replace(new RegExp(String.raw`\\frac\{${ARG}\}\{${ARG}\}`, 'g'), (_m, a, b) => `(${a})/(${b})`)
  s = s.replace(new RegExp(String.raw`\\sqrt\{${ARG}\}`, 'g'), (_m, a) => `√(${a})`)
  s = s.replace(/\\sqrt(\w)/g, (_m, a) => `√${a}`)
  s = s.replace(COMMAND_RE, (_m, name) => GREEK[name] ?? SYMBOLS[name] ?? name)
  s = s.replace(/\^\{([^{}]+)\}/g, (_m, a) => scriptOrFallback(a, SUPERSCRIPT, '^'))
  s = s.replace(/\^(\S)/g, (_m, a) => scriptOrFallback(a, SUPERSCRIPT, '^'))
  s = s.replace(/_\{([^{}]+)\}/g, (_m, a) => scriptOrFallback(a, SUBSCRIPT, '_'))
  s = s.replace(/_(\S)/g, (_m, a) => scriptOrFallback(a, SUBSCRIPT, '_'))
  s = s.replace(/\\([a-zA-Z]+)/g, '$1')
  s = s.replace(/\\/g, '')
  s = s.replace(/[{}]/g, '')
  return s.replace(/[ \t]{2,}/g, ' ').trim()
}

/** Slide-ready prose: [N] markers stripped (a web-only affordance), inline
 *  and block LaTeX flattened. */
export function cleanForSlide(text: string): string {
  return text
    .replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, '')
    .replace(/\$\$([^$]*)\$\$/g, (_m, inner) => latexToPlainText(inner))
    .replace(/\$([^$]*)\$/g, (_m, inner) => latexToPlainText(inner))
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
