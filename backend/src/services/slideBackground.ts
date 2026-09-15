import { createHash } from 'node:crypto'
import { logger } from '../lib/logger'
import { backgroundSvg, hasTreatment, BG_W, type BackgroundPalette, type BackgroundRecipe, type BackgroundRole } from '../../../shared/slideBackground'

// Design v3 (TODO L1): the slide background as a PNG for the exporters.
// The SVG is shared/slideBackground.ts — the same drawing the stage and the
// site inline; here it goes through @resvg/resvg-js, the path the formula
// renderer already vendors (formulaRenderer.ts), so the .pptx and the PDF
// carry a picture of it. Rasterised at 1600 × 900: one 16:9 slide at
// 160 px/in, sharp on a projector, and small — a grid or a band is a few
// KB, a wash or blob at 1200 wide under ~150 KB. The .pptx embeds it ONCE per role through a
// slide layout (talkExport.ts), never once per slide.
//
// Cached by a hash of the inputs: a deck asks for two rasters (hero, quiet)
// and the next deck in the same theme asks for the same two. The cache is
// bounded — brand accents make the input space open-ended.

export interface RenderedBackground { dataUri: string; buffer: Buffer; bytes: number }

const CACHE_MAX = 64
const cache = new Map<string, RenderedBackground>()

function remember(key: string, value: RenderedBackground): RenderedBackground {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string)
  cache.set(key, value)
  return value
}

/** The PNG for one role, or null when the role draws nothing (a flat
 *  ground needs no picture — the exporters fill the colour) or when
 *  rasterising fails (logged; the slide falls back to the flat ground,
 *  never to no export). */
export async function renderBackgroundPng(p: BackgroundPalette, recipe: BackgroundRecipe, role: BackgroundRole): Promise<RenderedBackground | null> {
  if (!hasTreatment(recipe, role)) return null
  const svg = backgroundSvg(p, recipe, role)
  const key = createHash('sha1').update(svg).digest('hex')
  const hit = cache.get(key)
  if (hit) return hit
  try {
    const { Resvg } = await import('@resvg/resvg-js')
    // Painted on the theme's ground: the blob's fade-to-transparent gives
    // the raster an alpha channel that PNG compresses badly (the dark blob
    // went 57 → 222 KB); with the ground filled, the alpha is constant.
    // Gradients (wash, blob) are the expensive kinds — a smooth 8-bit ramp
    // is high-entropy for PNG (the slate blob was 263 KB at 1600) — and the
    // only kinds that lose nothing at a lower raster: 1200 wide, scaled up
    // by the viewer, is the same ramp. Lines and dots stay at 1600 for
    // their edges.
    const width = recipe.kind === 'wash' || recipe.kind === 'blob' ? 1200 : BG_W
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: `#${p.bg}` }).render().asPng()
    const buffer = Buffer.from(png)
    return remember(key, { dataUri: `data:image/png;base64,${buffer.toString('base64')}`, buffer, bytes: buffer.length })
  } catch (err) {
    logger.warn({ message: '[background] rasterising the slide background failed — flat ground instead', kind: recipe.kind, role, error: (err as Error).message })
    return null
  }
}

/** For tests and the eval harness. */
export function backgroundCacheSize(): number { return cache.size }
