import {computed, onBeforeUnmount, ref, toValue, watch, type MaybeRefOrGetter} from 'vue'
import {parseGridTileIndex} from '@shared/videoPreview'
import {
  buildGridSpriteSheetStyle,
  buildGridSpriteViewportStyle,
} from '@/utils/gridSprite'
import {probeDisplayImageUrl} from '@/utils/probeImageUrl'
import {resolveGridSpriteDisplayUrl} from '@/utils/thumbSource'
import type {MediaItem} from '@/types/stores'

export function mediaGridPosterTileIndex(media: {
  semanticTileIndex?: unknown
  similarity?: {tileIndex?: unknown} | null
}): number | null {
  return parseGridTileIndex(media.semanticTileIndex ?? media.similarity?.tileIndex)
}

export type StaticGridPosterOptions = {
  media: MaybeRefOrGetter<MediaItem>
  mediaPath: MaybeRefOrGetter<string>
  mediaAspectRatio: MaybeRefOrGetter<number>
  previewActive: MaybeRefOrGetter<boolean>
  isMounted: MaybeRefOrGetter<boolean>
}

/**
 * Rest-state poster for a CLIP-matched grid tile (Home Similar, semantic cards).
 * Falls back to the normal thumb when the sprite is missing.
 */
export function useStaticGridPoster(options: StaticGridPosterOptions) {
  const spriteUrl = ref<string | null>(null)
  let probeController: AbortController | null = null
  let loadToken = 0

  const tileIndex = computed(() => mediaGridPosterTileIndex(toValue(options.media)))

  const abortProbe = () => {
    probeController?.abort()
    probeController = null
  }

  const clearPoster = () => {
    abortProbe()
    loadToken += 1
    spriteUrl.value = null
  }

  const loadPoster = async () => {
    const tile = tileIndex.value
    const media = toValue(options.media)
    if (tile == null || !toValue(options.previewActive) || !media?.id) {
      spriteUrl.value = null
      return
    }

    const url = resolveGridSpriteDisplayUrl(toValue(options.mediaPath), media.id)
    if (!url) {
      spriteUrl.value = null
      return
    }

    abortProbe()
    probeController = new AbortController()
    const token = ++loadToken
    const exists = await probeDisplayImageUrl(url, probeController.signal)
    if (token !== loadToken) return
    if (!toValue(options.isMounted) || tileIndex.value !== tile) return
    spriteUrl.value = exists ? url : null
  }

  watch(
    () => [
      tileIndex.value,
      Number(toValue(options.media)?.id) || 0,
      toValue(options.previewActive),
      toValue(options.mediaPath),
      toValue(options.isMounted),
    ],
    () => {
      if (!toValue(options.previewActive) || tileIndex.value == null || !toValue(options.isMounted)) {
        if (!toValue(options.previewActive) || tileIndex.value == null) {
          spriteUrl.value = null
        }
        return
      }
      void loadPoster()
    },
    {immediate: true},
  )

  onBeforeUnmount(clearPoster)

  const frameStyle = computed(() => {
    if (!spriteUrl.value || tileIndex.value == null) return null
    return buildGridSpriteViewportStyle(toValue(options.mediaAspectRatio))
  })

  const sheetStyle = computed(() => {
    if (!spriteUrl.value || tileIndex.value == null) return null
    return buildGridSpriteSheetStyle(spriteUrl.value, tileIndex.value)
  })

  const showStaticGridPoster = computed(() => Boolean(frameStyle.value && sheetStyle.value))

  return {
    tileIndex,
    spriteUrl,
    frameStyle,
    sheetStyle,
    showStaticGridPoster,
    clearPoster,
  }
}
