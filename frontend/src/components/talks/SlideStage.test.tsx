import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import SlideStage from './SlideStage'
import type { Slide } from '../../../../shared/types'
import type { ThemeSwatch } from '../../api/brand'

// Design v3 (TODO L1): the stage draws the theme's background recipe as
// the same SVG the exporters rasterise — hero slides at hero strength,
// content at quiet, nothing when the recipe is solid.

const THEME: ThemeSwatch = { id: 'bold', name: 'Яркая', bg: '0B0F2A', ink: 'FFFFFF', ink2: 'C7CBE6', accent: 'FFB020', panel: '171C3F', background: { kind: 'band', hero: 1, quiet: 0 } }
const base = { notes: '', citations: [] }
const title: Slide = { type: 'title', title: 'Т', ...base, body: { subtitle: 's', presenter: 'p' } }
const bullets: Slide = { type: 'bullets', title: 'Б', ...base, body: { items: ['a'] } }

function stageOf(container: HTMLElement): HTMLElement {
  return container.firstElementChild!.firstElementChild as HTMLElement
}

describe('SlideStage background', () => {
  it('a hero slide gets the SVG treatment, a quiet slide at strength 0 gets none', () => {
    const hero = stageOf(render(<SlideStage slide={title} theme={THEME} scale={0.5} />).container)
    expect(hero.style.backgroundImage).toContain('data:image/svg+xml')
    expect(decodeURIComponent(hero.style.backgroundImage)).toContain('#FFB020')
    const quiet = stageOf(render(<SlideStage slide={bullets} theme={THEME} scale={0.5} />).container)
    expect(quiet.style.backgroundImage).toBe('')
  })

  it('a swatch without a recipe (an older API answer) draws the flat ground', () => {
    const { background: _omit, ...legacy } = THEME
    const el = stageOf(render(<SlideStage slide={title} theme={legacy as ThemeSwatch} scale={0.5} />).container)
    expect(el.style.backgroundImage).toBe('')
    expect(el.style.backgroundColor).toBe('rgb(11, 15, 42)')
  })
})
