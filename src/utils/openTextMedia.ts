import {useDialogsStore} from '@/stores/dialogs'
import {openPath} from '@/services/shellService'
import {isInAppTextPreviewPath} from '@/utils/textPreview'
import type {MediaItem} from '@/types/stores'

/**
 * Open text media: in-app preview for txt/html/md, otherwise system app.
 */
export function openTextMedia(
  media: Pick<MediaItem, 'path'> & Partial<MediaItem> | null | undefined,
  options: {forceExternal?: boolean} = {},
): void {
  const path = media?.path
  if (!path) return

  if (!options.forceExternal && isInAppTextPreviewPath(path)) {
    useDialogsStore().openTextPreview(media as MediaItem)
    return
  }

  void openPath(path)
}
