/**
 * Strips prompt-injection patterns from user-supplied text before it enters
 * a prompt (CLAUDE.md §3.4). Applied to the brief, source text, edit
 * instructions and file names. Instructions inside an uploaded document are
 * data, not commands — this removes the most common ways of pretending
 * otherwise. Not a complete defence; the prompt itself frames the material
 * as material.
 */

const INJECTION_PATTERNS: RegExp[] = [
  /\[INST\]/gi,
  /\[\/INST\]/gi,
  /<\|system\|>/gi,
  /<\|user\|>/gi,
  /<\|assistant\|>/gi,
  /###\s*(system|instruction|human|assistant)/gi,
  /ignore\s+(all\s+)?previous\s+instructions?/gi,
  /disregard\s+all\s+previous/gi,
  /you\s+are\s+now\s+(?:a\s+)?(?:dan|jailbreak|evil|unfiltered)/gi,
  /forget\s+(everything|all)\s+(you|i)\s+(know|said)/gi,
  /игнорируй(те)?\s+(все\s+)?предыдущие\s+инструкции/gi,
  /забудь(те)?\s+(все|всё)\s+предыдущие/gi,
]

export function sanitiseForPrompt(text: string): string {
  let out = text
  for (const pattern of INJECTION_PATTERNS) {
    out = out.replace(pattern, '[removed]')
  }
  return out
}
