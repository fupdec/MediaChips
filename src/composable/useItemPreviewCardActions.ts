import {toValue, type MaybeRefOrGetter, type Ref} from 'vue'
import type {useVideoBigPreview} from '@/composable/useVideoBigPreview'
import type {MediaItem} from '@/types/stores'

export type PreviewClickAction = 'ignore' | 'dismiss-big-preview' | 'activate' | 'stop-preview'

export type PreviewClickInput = {
  isCollapsing: boolean
  isShrinking: boolean
  isBigPreviewVisual: boolean
  browserLayoutActive: boolean
}

export function resolvePreviewClickAction(input: PreviewClickInput): PreviewClickAction {
  if (input.isCollapsing || input.isShrinking) return 'ignore'
  if (input.isBigPreviewVisual) return 'dismiss-big-preview'
  if (input.browserLayoutActive) return 'activate'
  return 'stop-preview'
}

export function resolveMediaClickAction(input: PreviewClickInput): PreviewClickAction | 'play' {
  if (input.isCollapsing || input.isShrinking) return 'ignore'
  if (input.isBigPreviewVisual) return 'dismiss-big-preview'
  if (input.browserLayoutActive) return 'activate'
  return 'play'
}

export type PlayAction = 'stop-preview' | 'force-stop-and-play'

export function resolvePlayAction(input: {
  isBigPreviewOpen: boolean
  isShrinking: boolean
}): PlayAction {
  if (input.isBigPreviewOpen || input.isShrinking) return 'stop-preview'
  return 'force-stop-and-play'
}

export type ItemPreviewCardActionsOptions = {
  media: MaybeRefOrGetter<MediaItem>
  playTime: MaybeRefOrGetter<number | undefined>
  isShrinking: MaybeRefOrGetter<boolean>
  isBigPreviewOpen: MaybeRefOrGetter<boolean>
  gridBigPreview: ReturnType<typeof useVideoBigPreview>
  bigPreviewMenuActive: Ref<boolean>
  browserLayoutActive: MaybeRefOrGetter<boolean>
  stopPlayingPreview: (options?: {force?: boolean}) => void
  clearContextMenu: () => void
  onActivate: () => void
  playVideo: (payload: {video: MediaItem; time?: number}) => void
  syncMediaItem: (mediaId: number) => void
}

export function useItemPreviewCardActions(options: ItemPreviewCardActionsOptions) {
  const clickInput = (): PreviewClickInput => ({
    isCollapsing: options.gridBigPreview.isCollapsing.value,
    isShrinking: toValue(options.isShrinking),
    isBigPreviewVisual: options.gridBigPreview.isVisual.value,
    browserLayoutActive: toValue(options.browserLayoutActive),
  })

  const dismissBigPreview = () => {
    options.clearContextMenu()
    options.bigPreviewMenuActive.value = false
    options.stopPlayingPreview()
  }

  const handlePreviewClick = () => {
    const action = resolvePreviewClickAction(clickInput())
    if (action === 'ignore') return
    if (action === 'dismiss-big-preview') {
      dismissBigPreview()
      return
    }
    if (action === 'activate') {
      options.onActivate()
      return
    }
    options.stopPlayingPreview()
  }

  const handleMediaClick = () => {
    const action = resolveMediaClickAction(clickInput())
    if (action === 'ignore') return
    if (action === 'dismiss-big-preview') {
      dismissBigPreview()
      return
    }
    if (action === 'activate') {
      options.onActivate()
      return
    }
    play()
  }

  const handlePreviewBlur = () => {
    if (toValue(options.isBigPreviewOpen)) return
    options.stopPlayingPreview()
  }

  const play = (_inApp?: unknown) => {
    const action = resolvePlayAction({
      isBigPreviewOpen: toValue(options.isBigPreviewOpen),
      isShrinking: toValue(options.isShrinking),
    })
    if (action === 'stop-preview') {
      options.stopPlayingPreview()
      return
    }
    options.stopPlayingPreview({force: true})
    const media = toValue(options.media)
    const playTime = toValue(options.playTime)
    options.playVideo({
      video: media,
      ...(playTime != null ? {time: playTime} : {}),
    })
  }

  const restartImageGeneration = () => {
    options.syncMediaItem(Number(toValue(options.media).id))
  }

  return {
    handlePreviewClick,
    handleMediaClick,
    handlePreviewBlur,
    play,
    restartImageGeneration,
  }
}
