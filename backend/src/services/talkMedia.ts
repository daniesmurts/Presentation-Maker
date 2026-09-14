import { uploadObject, deleteObject } from './objectStorage'
import { createTalkMedia, listTalkMediaPaths } from '../db/queries/talkMedia'
import { sniffMime } from './slideImageSource'
import { imageSize } from '../lib/imageSize'
import { ValidationError } from '../errors/AppError'
import { logger } from '../lib/logger'
import type { SlideImage, Slide, Talk } from '../../../shared/types'
import { withSlideImage } from './talks'
import type { ImportedSlide } from './pptxImport'

// Uploaded slide images (TODO B, upload only — search comes with a provider).
// One image per slide by construction (shared/types.ts); everything
// downstream assumes it.

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

/** The path every stored image is served from — the ONE root-relative
 *  shape slideImageSource.ts knows how to load. */
export const MEDIA_ROUTE_PREFIX = '/api/talks/media/'
export function mediaUrl(mediaId: string): string {
  return `${MEDIA_ROUTE_PREFIX}${mediaId}/image`
}

/**
 * Validate from the bytes (§3.5, §3.7: a header is a claim, bytes are a
 * fact), store, record, and return the SlideImage to put on the slide.
 */
export async function storeSlideImage(talk: Talk, slideIndex: number, buffer: Buffer): Promise<SlideImage> {
  if (buffer.length === 0) throw new ValidationError('Файл пуст')
  if (buffer.length > MAX_IMAGE_BYTES) throw new ValidationError('Изображение больше 8 МБ — уменьшите его')
  const mime = sniffMime(buffer)
  if (!mime) throw new ValidationError('Поддерживаются только PNG и JPEG')
  const size = imageSize(buffer)
  if (!size) throw new ValidationError('Не удалось прочитать размеры изображения — файл повреждён?')

  const ext = mime === 'image/jpeg' ? 'jpg' : 'png'
  const storagePath = `talks/${talk.workspace_id}/${talk.id}/${slideIndex}-${Date.now()}.${ext}`
  await uploadObject(buffer, storagePath, mime)
  const row = await createTalkMedia({
    talk_id: talk.id, workspace_id: talk.workspace_id, slide_index: slideIndex,
    storage_path: storagePath, mime, width: size.width, height: size.height, bytes: buffer.length,
  })

  const url = mediaUrl(row.id)
  return {
    url, source_url: url, thumbnail: url,
    width: size.width, height: size.height,
    query: '',
    // Shown as the credit line; it is not a web result and saying so is
    // more honest than a hostname-shaped blank.
    source_host: talk.language === 'ru' ? 'Загружено' : 'Uploaded',
  }
}

/** The paths to delete — collected BEFORE the talk row goes, because the
 *  media rows cascade with it and would be gone by the time cleanup runs.
 *  Workspace-scoped: a talk id alone must not reach another tenant's objects. */
export async function collectTalkMediaPaths(talkId: string, workspaceId: string): Promise<string[]> {
  try {
    return await listTalkMediaPaths(talkId, workspaceId)
  } catch (err) {
    logger.warn({ message: '[talk media] could not list objects for cleanup', talkId, error: (err as Error).message })
    return []
  }
}

/** Best-effort object cleanup after the row is gone. */
export async function deleteMediaObjects(paths: string[]): Promise<void> {
  for (const p of paths) await deleteObject(p)
}

// ─── Pictures arriving from an imported .pptx ───────────────────────────────
//
// The parent's first import read text only, so a deck carried by drawings —
// a reported 995 KB file that was 900 KB of schematics — arrived as a shell
// of captions above nothing. The slide model holds ONE image per slide, so a
// slide with several contributes its largest and the rest are dropped:
// a real loss, and deliberate — a multi-image type changes rendering, export
// and the picker for every deck to serve the minority of imported slides.

const MAX_IMAGES_PER_DECK = 60
const MAX_TOTAL_BYTES     = 20 * 1024 * 1024

export interface StoredMediaResult { slides: Slide[]; stored: number; dropped: number }

/**
 * Store each slide's largest picture and hand back the slides pointing at
 * it. Best-effort per image: a storage failure loses that picture, never
 * the import — a user who has just waited for an upload should get their
 * deck with nine of ten drawings, not an error.
 */
export async function attachImportedImages(talk: Talk, slides: Slide[], imported: ImportedSlide[]): Promise<StoredMediaResult> {
  let out = slides
  let stored = 0, dropped = 0, bytes = 0
  for (const [index, source] of imported.entries()) {
    const [picture, ...extras] = source.images
    dropped += extras.length
    if (!picture || !out[index]) continue
    if (stored >= MAX_IMAGES_PER_DECK || bytes + picture.buffer.length > MAX_TOTAL_BYTES) { dropped += 1; continue }
    try {
      const image = await storeSlideImage(talk, index, picture.buffer)
      image.source_host = talk.language === 'ru' ? 'Из загруженной презентации' : 'From the uploaded deck'
      out = out.map((slide, i) => (i === index ? withSlideImage(slide, image) : slide))
      stored += 1
      bytes += picture.buffer.length
    } catch (err) {
      logger.warn({ message: '[pptx import] could not store slide image', talkId: talk.id, index, error: (err as Error).message })
      dropped += 1
    }
  }
  return { slides: out, stored, dropped }
}
