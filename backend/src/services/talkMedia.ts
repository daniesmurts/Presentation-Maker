import { uploadObject, deleteObject } from './objectStorage'
import { createTalkMedia, listTalkMediaPaths } from '../db/queries/talkMedia'
import { sniffMime } from './slideImageSource'
import { imageSize } from '../lib/imageSize'
import { ValidationError } from '../errors/AppError'
import { logger } from '../lib/logger'
import type { SlideImage, Talk } from '../../../shared/types'

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
