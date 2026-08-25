import {ref, toValue, type MaybeRefOrGetter, type Ref} from 'vue'
import path from 'path-browserify'
import {createThumb as createVideoThumb} from '@/services/fileService'
import {invalidateVideoThumbCaches} from '@/utils/thumbDisplayCache'
import type {useVideoBigPreview} from '@/composable/useVideoBigPreview'
import type {BigVideoPreviewSize} from '@/composable/useItemPreviewBigPreviewSession'
import type {HoverSessionTimeoutMap} from '@/composable/useItemPreviewHoverSession'
import type {ContextMenuEntry, ContextMenuPayload, MediaItem} from '@/types/stores'

export const BIG_PREVIEW_SIZE_OPTIONS: BigVideoPreviewSize[] = [
  'original',
  'full_height',
  'two_thirds',
  'half',
]

export const BIG_PREVIEW_CONTEXT_MENU_Z_INDEX = '19990'

export const BIG_PREVIEW_CONTEXT_MENU_GUARD_MS = 400

export function getBigPreviewSizeMenuIcon(
  currentSize: BigVideoPreviewSize,
  size: BigVideoPreviewSize,
): string {
  return currentSize === size ? 'radiobox-marked' : 'radiobox-blank'
}

export function getMuteMenuIcon(muted: boolean): string {
  return muted ? 'volume-off' : 'volume-high'
}

export function shouldOpenBigPreviewContextMenu(input: {
  isBigPreviewVisual: boolean
  isBigPreviewCollapsing: boolean
  isFileExists: boolean
}): boolean {
  return (
    input.isBigPreviewVisual &&
    !input.isBigPreviewCollapsing &&
    input.isFileExists
  )
}

export type BuildBigPreviewSizeMenuInput = {
  currentSize: BigVideoPreviewSize
  translate: (key: string) => string
  onSelectSize: (size: BigVideoPreviewSize) => void
}

export function buildBigPreviewSizeMenuItems(
  input: BuildBigPreviewSizeMenuInput,
): ContextMenuEntry[] {
  return BIG_PREVIEW_SIZE_OPTIONS.map((size) => ({
    name: input.translate(`media.preview.big_preview_size.${size}`),
    type: 'item',
    icon: getBigPreviewSizeMenuIcon(input.currentSize, size),
    action: () => {
      input.onSelectSize(size)
    },
  }))
}

export type ItemPreviewContextMenuOptions = {
  media: MaybeRefOrGetter<MediaItem>
  isFileExists: MaybeRefOrGetter<boolean>
  gridBigPreview: ReturnType<typeof useVideoBigPreview>
  bigPreviewMenuActive: Ref<boolean>
  bigPreviewSize: MaybeRefOrGetter<BigVideoPreviewSize>
  muted: MaybeRefOrGetter<boolean>
  playSoundOnVideoPreview: MaybeRefOrGetter<string>
  videoRef: Ref<HTMLVideoElement | null>
  progress: Ref<number>
  timeouts: Pick<HoverSessionTimeoutMap, 'leave' | 'contextMenuGuard'>
  getPreviewEl: () => HTMLElement | null
  getStaticPreviewSubfolder: () => string | undefined
  loadThumb: (folder: 'thumbs' | 'grids', options?: {bust?: boolean}) => void
  applyBigPreviewMetrics: (preview: HTMLElement) => void
  mediaPath: MaybeRefOrGetter<string>
  translate: (key: string) => string
  setOption: (value: string, key: any) => unknown
  showContextMenu: (payload: ContextMenuPayload) => void
  isContextMenuOpen: () => boolean
  setNotification: (payload: {
    title: string
    text?: string
    filePath?: string
    icon?: string
    type?: any
  }) => unknown
  refreshThumb: (mediaId: any, options?: {regenerate?: boolean}) => unknown
  syncMediaItem: (mediaId: number | string) => void
  refreshGridPreviewIfNeeded?: () => Promise<void>
}

export function useItemPreviewContextMenu(options: ItemPreviewContextMenuOptions) {
  const isSettingThumb = ref(false)

  const togglePreviewMute = () => {
    const nextValue = toValue(options.playSoundOnVideoPreview) === '1' ? '0' : '1'
    options.setOption(nextValue, 'play_sound_on_video_preview')
  }

  const setBigPreviewSize = (size: BigVideoPreviewSize) => {
    options.setOption(size, 'big_video_preview_size')
    const preview = options.getPreviewEl()
    if (preview && options.gridBigPreview.isVisual.value) {
      options.applyBigPreviewMetrics(preview)
    }
  }

  const buildBigPreviewSizeMenu = () =>
    buildBigPreviewSizeMenuItems({
      currentSize: toValue(options.bigPreviewSize),
      translate: options.translate,
      onSelectSize: setBigPreviewSize,
    })

  const setAsThumbFromPreview = async () => {
    if (!toValue(options.isFileExists) || isSettingThumb.value) return

    const video = options.videoRef.value
    if (!video) return

    const media = toValue(options.media)
    const currentTime = Number.isFinite(video.currentTime)
      ? video.currentTime
      : options.progress.value

    const imgPath = path.join(
      toValue(options.mediaPath) || '',
      'videos/thumbs',
      `${media.id}.jpg`,
    )

    isSettingThumb.value = true
    try {
      await createVideoThumb(currentTime, media.path ?? '', imgPath, 320, true)
      invalidateVideoThumbCaches(media.id)
      options.loadThumb('thumbs', {bust: true})
      if (options.getStaticPreviewSubfolder() === 'grids') {
        options.loadThumb('grids', {bust: true})
      }
      options.refreshThumb(media.id)
      options.syncMediaItem(media.id)
      void options.refreshGridPreviewIfNeeded?.()
      options.setNotification({
        title: options.translate('player.video_thumb_updated'),
        text: media.path,
        icon: 'image',
        type: 'success',
      })
    } catch (error) {
      console.log(error)
      options.setNotification({
        title: options.translate('player.video_thumb_not_updated'),
        text: String(error),
        filePath: media.path,
        icon: 'image',
        type: 'error',
      })
    } finally {
      isSettingThumb.value = false
    }
  }

  const buildBigPreviewContextMenu = (): ContextMenuEntry[] => {
    const muted = toValue(options.muted)
    const items: ContextMenuEntry[] = [
      {
        name: muted
          ? options.translate('media.preview.unmute')
          : options.translate('media.preview.mute'),
        type: 'item',
        icon: getMuteMenuIcon(muted),
        action: () => {
          togglePreviewMute()
        },
      },
    ]

    items.push(
      {type: 'divider'},
      {
        name: options.translate('media.preview.big_preview_size.title'),
        type: 'menu',
        icon: 'resize',
        menu: buildBigPreviewSizeMenu(),
      },
    )

    items.push(
      {type: 'divider'},
      {
        name: options.translate('player.controls.set_frame_as_thumb'),
        type: 'item',
        icon: 'image',
        disabled: isSettingThumb.value,
        action: () => {
          void setAsThumbFromPreview()
        },
      },
    )

    return items
  }

  const handlePreviewContextMenu = (e: MouseEvent) => {
    if (!shouldOpenBigPreviewContextMenu({
      isBigPreviewVisual: options.gridBigPreview.isVisual.value,
      isBigPreviewCollapsing: options.gridBigPreview.isCollapsing.value,
      isFileExists: toValue(options.isFileExists),
    })) return

    e.preventDefault()
    e.stopPropagation()

    clearTimeout(options.timeouts.leave)
    clearTimeout(options.timeouts.contextMenuGuard)
    options.bigPreviewMenuActive.value = true

    const preview = options.getPreviewEl()
    if (preview) preview.style.zIndex = BIG_PREVIEW_CONTEXT_MENU_Z_INDEX

    options.showContextMenu({
      x: e.clientX,
      y: e.clientY,
      content: buildBigPreviewContextMenu(),
    })
  }

  const handlePreviewMouseDown = (e: MouseEvent) => {
    if (e.button !== 2) return
    if (
      !options.gridBigPreview.isVisual.value ||
      options.gridBigPreview.isCollapsing.value
    ) return

    clearTimeout(options.timeouts.leave)
    options.bigPreviewMenuActive.value = true
    clearTimeout(options.timeouts.contextMenuGuard)
    options.timeouts.contextMenuGuard = setTimeout(() => {
      if (!options.isContextMenuOpen()) {
        options.bigPreviewMenuActive.value = false
      }
    }, BIG_PREVIEW_CONTEXT_MENU_GUARD_MS)
  }

  return {
    isSettingThumb,
    togglePreviewMute,
    setBigPreviewSize,
    buildBigPreviewSizeMenu,
    setAsThumbFromPreview,
    buildBigPreviewContextMenu,
    handlePreviewContextMenu,
    handlePreviewMouseDown,
  }
}
