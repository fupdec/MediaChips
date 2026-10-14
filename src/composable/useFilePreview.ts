import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useEventBus} from '@/utils/eventBus'
import {buildLocalFileUrl} from '@/services/fileService'
import {driveMediaKind, isDriveMediaPath} from '@shared/cloudDrive'
import {inferMediaTypeFromPaths, getMediaTypeKey} from '@/utils/mediaType'
import {isInAppTextPreviewPath} from '@/utils/textPreview'
import {openTextMedia} from '@/utils/openTextMedia'

export type PreviewFile = {name: string; path: string; isDirectory?: boolean}

/** Open a source directly. A preview never acquires a library ID. */
export function useFilePreview() {
  const app = useAppStore()
  const items = useItemsStore()
  const events = useEventBus()
  const kind = (file: PreviewFile) => {
    if (file.isDirectory) return null
    if (isDriveMediaPath(file.path)) return driveMediaKind(file.name)
    if (isInAppTextPreviewPath(file.path)) return 'text'
    const inferred = getMediaTypeKey(inferMediaTypeFromPaths([file.name], app.mediaTypes))
    return driveMediaKind(file.name) || (['video', 'audio', 'image'].includes(inferred) ? inferred : null)
  }
  async function preview(file: PreviewFile) {
    const type = kind(file)
    if (!type) return
    if (type === 'text') {
      openTextMedia({id: 0, path: file.path, name: file.name, basename: file.name})
      return
    }
    if (type === 'image') {
      events.emit('viewImage', {sources: [{src: buildLocalFileUrl(file.path, true, false, {maxEdge: 4096}), name: file.name}]})
      return
    }
    const media = {id: 0, name: file.name, basename: file.name, path: file.path,
      mediaTypeId: app.mediaTypes.find(mediaType => getMediaTypeKey(mediaType) === type)?.id}
    await items.playVideo({video: media, videos: [media], player: 'builtin'})
  }
  return {canPreview: (file: PreviewFile) => Boolean(kind(file)), preview}
}
