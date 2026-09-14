import katex from 'katex'

// Slides mix prose with $inline$ and $$block$$ LaTeX. InlineText splits and
// renders exactly that; non-math segments stay React-escaped text. Bad
// LaTeX renders in red rather than vanishing — the user must see it to fix it.

export interface Segment { kind: 'text' | 'math'; body: string; block: boolean }

export function parseMixed(text: string): Segment[] {
  const out: Segment[] = []
  let i = 0
  while (i < text.length) {
    const dollar = text.indexOf('$', i)
    if (dollar === -1) { out.push({ kind: 'text', body: text.slice(i), block: false }); break }
    if (dollar > i) out.push({ kind: 'text', body: text.slice(i, dollar), block: false })
    if (text[dollar + 1] === '$') {
      const close = text.indexOf('$$', dollar + 2)
      if (close === -1) { out.push({ kind: 'text', body: text.slice(dollar), block: false }); break }
      out.push({ kind: 'math', body: text.slice(dollar + 2, close), block: true })
      i = close + 2
      continue
    }
    const close = text.indexOf('$', dollar + 1)
    if (close === -1) { out.push({ kind: 'text', body: text.slice(dollar), block: false }); break }
    out.push({ kind: 'math', body: text.slice(dollar + 1, close), block: false })
    i = close + 1
  }
  return out
}

function renderSafe(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, { displayMode, throwOnError: false, errorColor: '#B42318', strict: 'ignore', output: 'html' })
  } catch {
    return `<span style="color:#B42318">${latex.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`
  }
}

export function BlockMath({ latex }: { latex: string }) {
  return <div className="my-2 text-center overflow-x-auto" dangerouslySetInnerHTML={{ __html: renderSafe(latex, true) }} />
}

export function InlineText({ text }: { text: string }) {
  return (
    <>
      {parseMixed(text).map((p, i) =>
        p.kind === 'math'
          ? <span key={i} dangerouslySetInnerHTML={{ __html: renderSafe(p.body, p.block) }} />
          : <span key={i}>{p.body}</span>,
      )}
    </>
  )
}
