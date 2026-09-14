import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { parseMixed, InlineText } from './Math'

describe('parseMixed', () => {
  it('splits prose from $inline$ and $$block$$ math', () => {
    expect(parseMixed('Подача $Q$ и $$E=mc^2$$ конец')).toEqual([
      { kind: 'text', body: 'Подача ', block: false },
      { kind: 'math', body: 'Q', block: false },
      { kind: 'text', body: ' и ', block: false },
      { kind: 'math', body: 'E=mc^2', block: true },
      { kind: 'text', body: ' конец', block: false },
    ])
  })
  it('renders an unterminated $ literally instead of eating the rest of the slide', () => {
    expect(parseMixed('цена $15')).toEqual([{ kind: 'text', body: 'цена ', block: false }, { kind: 'text', body: '$15', block: false }])
  })
})

describe('InlineText', () => {
  it('keeps prose React-escaped — no HTML injection through slide text', () => {
    const { container } = render(<InlineText text="<img src=x onerror=alert(1)>" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('<img')
  })
})
