import { logger } from '../lib/logger'
import { imageSize } from '../lib/imageSize'

// The one loader that knows which image URLs are web and which are storage
// routes (CLAUDE.md §2). Today only https web images exist; stored media
// (TODO B) adds the root-relative branch here — nowhere else. `fetch()` of a
// relative URL throws in Node, which is how every stored image once exported
// as a placeholder in the parent.
//
// Only PNG/JPEG go into decks (§3.5): pptxgenjs cannot embed EMF and the
// PDF renderer throws mid-document on WebP. Identified from the bytes, not
// the Content-Type header — a CDN's header is a claim, the bytes are a fact.

export interface LoadedImage { buffer: Buffer; mime: 'image/png' | 'image/jpeg' }

const MAX_BYTES = 8 * 1024 * 1024
const TIMEOUT_MS = 10_000

export async function loadSlideImage(url: string): Promise<LoadedImage | null> {
  try {
    if (!/^https?:\/\//i.test(url)) {
      logger.warn({ message: '[slide image] not a web URL and no storage route exists yet', url })
      return null
    }
    const res = await fetch(url.replace(/^http:\/\//i, 'https://'), { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length > MAX_BYTES) return null
    const mime = sniffMime(buffer)
    if (!mime) return null
    if (!imageSize(buffer)) return null
    return { buffer, mime }
  } catch (err) {
    logger.warn({ message: '[slide image] load failed', url, error: (err as Error).message })
    return null
  }
}

export function sniffMime(buffer: Buffer): LoadedImage['mime'] | null {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png'
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  return null
}
