import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import SlideStage from './SlideStage'
import type { Slide } from '../../../../shared/types'
import type { ThemeSwatch } from '../../api/brand'
import { backgroundSvg } from '../../../../shared/slideBackground'

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

// Design v3 (L2): the rhythm types draw, the design changes what is drawn,
// and the role exceptions hold on the stage as in the exporters.
const BOLD_BAND: ThemeSwatch = { ...THEME, background: { kind: 'band', hero: 1, quiet: 0.35 } }
const GRID: ThemeSwatch = { ...THEME, background: { kind: 'grid', hero: 0.12, quiet: 0.06 } }

describe('SlideStage — L2 types and design', () => {
  it('draws section, agenda (column-wise numbering), stats, quote and image-full', () => {
    const section: Slide = { type: 'section', title: 'Рынок', ...base, body: { kicker: 'Часть 2', lead: 'Где деньги' } }
    const agenda: Slide = { type: 'agenda', title: 'План', ...base, body: { items: ['a', 'b', 'c', 'd', 'e'] } }
    const stats: Slide = { type: 'stats', title: 'Цифры', ...base, body: { stats: [{ value: '42 %', label: 'доля', note: null }] } }
    const quote: Slide = { type: 'quote', title: 'Клиент', ...base, body: { quote: 'Мы увидели', attribution: 'Иван' } }
    const full: Slide = { type: 'image-full', title: 'Вид', ...base, image: { url: 'https://x/y.png', source_url: '', width: 10, height: 10 }, body: { caption: 'подпись' } }
    expect(render(<SlideStage slide={section} theme={THEME} scale={1} />).container.textContent).toContain('Часть 2')   // uppercase is CSS
    const ag = render(<SlideStage slide={agenda} theme={THEME} scale={1} />).container
    const nums = [...ag.querySelectorAll('ol')].map((ol) => [...ol.querySelectorAll('li > span:first-child')].map((s) => s.textContent).join(' '))
    expect(nums).toEqual(['01 02 03', '04 05'])
    expect(render(<SlideStage slide={stats} theme={THEME} scale={1} />).container.textContent).toContain('42 %')
    expect(render(<SlideStage slide={quote} theme={THEME} scale={1} />).container.textContent).toContain('«Мы увидели»')
    const img = render(<SlideStage slide={full} theme={THEME} scale={1} />).container.querySelector('img')!
    expect(img.style.objectFit).toBe('cover')
  })

  it('a stats slide with emphasis=plain sets the figure in the ink, not the accent', () => {
    const stats: Slide = { type: 'stats', title: 'x', ...base, design: { variant: 'three-up', emphasis: 'plain', backdrop: 'none' }, body: { stats: [{ value: '7', label: 'l', note: null }] } }
    const el = [...render(<SlideStage slide={stats} theme={THEME} scale={1} />).container.querySelectorAll('div')].find((d) => d.textContent === '7')!
    expect(el.style.color).toBe('rgb(255, 255, 255)')
  })

  it('backdrop=pattern lifts a content slide to the hero background — except under a band; a picture-less image-full stays quiet', () => {
    const bullets: Slide = { type: 'bullets', title: 'b', ...base, design: { variant: 'plain', emphasis: 'accent', backdrop: 'pattern' }, body: { items: ['a'] } }
    const grid = stageOf(render(<SlideStage slide={bullets} theme={GRID} scale={1} />).container)
    expect(decodeURIComponent(grid.style.backgroundImage)).toContain(backgroundSvg({ bg: GRID.bg, accent: GRID.accent, ink: GRID.ink, panel: GRID.panel }, GRID.background, 'hero'))
    const band = stageOf(render(<SlideStage slide={bullets} theme={BOLD_BAND} scale={1} />).container)
    expect(decodeURIComponent(band.style.backgroundImage)).toContain('M1576 0')   // the quiet strip, not the wedge
    const full: Slide = { type: 'image-full', title: 'Вид', ...base, image_query: 'q', body: { caption: '' } }
    expect(decodeURIComponent(stageOf(render(<SlideStage slide={full} theme={BOLD_BAND} scale={1} />).container).style.backgroundImage)).toContain('M1576 0')
  })
})
