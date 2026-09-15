import { getBrandKit } from '../db/queries/brandKits'
import { downloadObject } from './objectStorage'
import { logger } from '../lib/logger'
import type { BrandKit } from './themes'
import { readStoredTheme } from './themeGenerator'

/** The workspace's brand kit with the logo bytes, for an export. Best-effort:
 *  a storage hiccup costs the logo, not the download. */
export async function resolveBrandKit(workspaceId: string): Promise<BrandKit | null> {
  try {
    const kit = await getBrandKit(workspaceId)
    if (!kit || (!kit.accent && !kit.name && !kit.logo_path && !kit.custom_theme)) return null
    let logo: BrandKit['logo'] = null
    if (kit.logo_path) {
      const buffer = await downloadObject(kit.logo_path)
      logo = { buffer, dataUri: `data:${kit.logo_mime ?? 'image/png'};base64,${buffer.toString('base64')}` }
    }
    return { accent: kit.accent, name: kit.name, logo, customTheme: readStoredTheme(kit.custom_theme) }
  } catch (err) {
    logger.warn({ message: '[brand] could not resolve brand kit for export', workspaceId, error: (err as Error).message })
    return null
  }
}
