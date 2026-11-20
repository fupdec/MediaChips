import path from 'path-browserify'
import {typedApi} from '@/services/typedApi'
import {setNotification} from '@/services/notificationService'
import {reloadTagsCatalog} from '@/composable/appCatalogs'
import {
  extractColorFromImageUrl,
  extractColorFromLocalFile,
  isDefaultTagColor,
} from '@/utils/colorFromImage'
import {getCachedThumb, tagThumbKey} from '@/utils/thumbDisplayCache'
import {isThumbUnavailable, resolveTagThumbDisplayUrl} from '@/utils/thumbSource'
import type {EntityUpdatePayload} from '@shared/api/responses'

type Translate = (key: string, params?: Record<string, string | number>) => string

export interface TagColorTarget {
  tagId: number | string
  metaId: number | string
  /** Whether the tag category has "Colors" enabled. */
  colorsEnabled: boolean | null | undefined
}

/** True when the tag's category has colors enabled and the tag has a main image. */
export function canPickTagColorFromImage(target: TagColorTarget, dbPath: string): boolean {
  if (!target.colorsEnabled || !dbPath) return false

  const url = resolveTagThumbDisplayUrl({
    dbPath,
    metaId: target.metaId,
    tagId: target.tagId,
    type: 'main',
  })

  return !isThumbUnavailable(url)
}

/**
 * Picks a color from the tag's main image and saves it to the tag right away.
 * Returns the new color, or null when nothing was applied.
 */
export async function applyTagColorFromMainImage(
  target: TagColorTarget,
  dbPath: string,
  t: Translate,
  onSaved?: () => void,
): Promise<string | null> {
  if (!target.colorsEnabled) return null

  if (!canPickTagColorFromImage(target, dbPath)) {
    setNotification({type: 'warning', text: t('meta.settings.color_from_image_no_main')})
    return null
  }

  const cached = getCachedThumb(tagThumbKey(target.metaId, target.tagId, 'main'))
  const color = cached?.startsWith('data:')
    ? await extractColorFromImageUrl(cached)
    : await extractColorFromLocalFile(
      path.join(dbPath, 'meta', String(target.metaId), `${target.tagId}_main.jpg`),
    )

  if (isDefaultTagColor(color)) {
    setNotification({type: 'error', text: t('meta.settings.color_from_image_failed')})
    return null
  }

  try {
    await typedApi.updateEntity('tag', Number(target.tagId), {color} as EntityUpdatePayload)
    await reloadTagsCatalog()
    onSaved?.()
    setNotification({type: 'success', text: t('meta.settings.color_from_image_applied')})
    return color
  } catch (error) {
    console.error('Error saving tag color from image:', error)
    setNotification({type: 'error', text: t('meta.settings.color_from_image_failed')})
    return null
  }
}
