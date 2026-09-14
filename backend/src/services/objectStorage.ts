import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { logger } from '../lib/logger'

// Object storage from day one, local disk for dev (CLAUDE.md §10): two
// replicas on one VM already broke the "just use disk" assumption once in
// the parent. Any S3-compatible endpoint — Yandex Object Storage, MinIO,
// AWS — via generic STORAGE_* vars; no credentials → ./uploads.

const LOCAL_DIR = path.resolve(process.cwd(), '../uploads')

function s3(): { client: S3Client; bucket: string } | null {
  const accessKeyId = process.env.STORAGE_ACCESS_KEY
  const secretAccessKey = process.env.STORAGE_SECRET_KEY
  const bucket = process.env.STORAGE_BUCKET
  if (!accessKeyId || !secretAccessKey || !bucket) return null
  return {
    bucket,
    client: new S3Client({
      region:   process.env.STORAGE_REGION ?? 'ru-central1',
      endpoint: process.env.STORAGE_ENDPOINT ?? 'https://storage.yandexcloud.net',
      credentials: { accessKeyId, secretAccessKey },
    }),
  }
}

export function storageMode(): 'local' | 's3' {
  return s3() ? 's3' : 'local'
}

// Keys are built by our own code from ids; still refuse anything that could
// escape the local directory.
function localPath(storagePath: string): string {
  const full = path.resolve(LOCAL_DIR, storagePath)
  if (!full.startsWith(LOCAL_DIR + path.sep)) throw new Error('Invalid storage path')
  return full
}

export async function uploadObject(buffer: Buffer, storagePath: string, contentType: string): Promise<void> {
  const target = s3()
  if (!target) {
    const full = localPath(storagePath)
    await fs.mkdir(path.dirname(full), { recursive: true })
    await fs.writeFile(full, buffer)
    return
  }
  await target.client.send(new PutObjectCommand({ Bucket: target.bucket, Key: storagePath, Body: buffer, ContentType: contentType }))
}

export async function downloadObject(storagePath: string): Promise<Buffer> {
  const target = s3()
  if (!target) return fs.readFile(localPath(storagePath))
  const res = await target.client.send(new GetObjectCommand({ Bucket: target.bucket, Key: storagePath }))
  return Buffer.from(await res.Body!.transformToByteArray())
}

/** Best-effort — never throws; used during cleanup. */
export async function deleteObject(storagePath: string): Promise<void> {
  try {
    const target = s3()
    if (!target) { await fs.unlink(localPath(storagePath)).catch(() => null); return }
    await target.client.send(new DeleteObjectCommand({ Bucket: target.bucket, Key: storagePath }))
  } catch (err) {
    logger.warn({ message: '[storage] delete failed', storagePath, error: (err as Error).message })
  }
}
