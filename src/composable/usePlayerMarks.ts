import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { usePlayerStore } from '@/stores/player'
import { useItemsStore } from '@/stores/items'
import { useEventBus } from '@/utils/eventBus'
import { getReadableDuration } from '@/services/formatUtils'
import {
  filterMarksByTypes,
  getMarkListColor,
  getMarkListIcon,
} from '@/composable/playerMarkDisplay'
import {
  ensureMarkThumb,
  getMarkImagePath,
  loadMarkImageDisplayUrl,
} from '@/utils/markThumb'
import { checkFileExists } from '@/services/fileService'
import type { PlayerMark } from '@/types/player'
import { MARK_FILTER_CHAPTER, getAssignedArrayMetas } from '@/utils/markAdding'

interface UsePlayerMarksOptions {
  emit: (event: 'removeMark' | 'editMark', mark: PlayerMark) => void
}

export function usePlayerMarks({ emit }: UsePlayerMarksOptions) {
  const appStore = useAppStore()
  const playerStore = usePlayerStore()
  const itemsStore = useItemsStore()
  const eventBus = useEventBus()

  const marksType = ref<Array<string | number>>(['favorite', 'bookmark', MARK_FILTER_CHAPTER])
  const is_thumbs_loaded = ref(false)

  const player = computed(() => playerStore)
  const assigned = computed(() => getAssignedArrayMetas(itemsStore.assigned))

  const marks = computed(() => filterMarksByTypes(playerStore.marks, marksType.value))

  const loadMarkThumb = async (mark: PlayerMark & { thumb?: string }) => {
    if (!appStore.mediaPath || mark.id == null) return

    mark.thumb = await loadMarkImageDisplayUrl({
      markId: mark.id,
      mediaPath: appStore.mediaPath,
      mediaId: playerStore.media?.id,
    })
  }

  const getThumbs = async () => {
    if (!appStore.mediaPath) return

    is_thumbs_loaded.value = false
    const mediaId = playerStore.media?.id
    const videoPath = playerStore.media?.path

    for (const mark of playerStore.marks) {
      if (mark.id != null && mediaId != null) {
        const imgPath = getMarkImagePath(appStore.mediaPath, mark.id)
        try {
          if (!(await checkFileExists(imgPath))) {
            await ensureMarkThumb({
              mark,
              mediaId,
              mediaPath: appStore.mediaPath,
              videoPath,
            })
          }
        } catch {
          // Keep video-thumb / unavailable fallback from loadMarkImageDisplayUrl.
        }
      }
      await loadMarkThumb(mark)
    }

    is_thumbs_loaded.value = true
  }

  const getDuration = (duration: number) => getReadableDuration(duration)

  const jumpTo = (time: number) => {
    playerStore.playerJumpTo(time)
  }

  const edit = (mark: PlayerMark) => {
    emit('editMark', mark)
  }

  const remove = (mark: PlayerMark) => {
    emit('removeMark', mark)
  }

  const handleUpdateMarkImage = (id: unknown) => {
    if (player.value.marks.some((i) => i.id === id)) {
      getThumbs()
    }
  }

  const ensureMetaTypeSelected = (metaId: string | number | null | undefined) => {
    if (metaId != null && !marksType.value.some((type) => type == metaId)) {
      marksType.value.push(metaId)
    }
  }

  watch(() => playerStore.marks, (storeMarks) => {
    getThumbs()

    storeMarks.forEach((mark) => {
      if (mark.type !== 'meta') return
      ensureMetaTypeSelected(mark.meta?.id ?? mark.metaId)
    })
  })

  watch(() => appStore.mediaPath, (mediaPath) => {
    if (mediaPath) {
      getThumbs()
    }
  })

  watch(assigned, (arr) => {
    arr.forEach((i) => ensureMetaTypeSelected(i.meta?.id))
  }, { immediate: true })

  const handleRefreshMarkThumbs = () => {
    getThumbs()
  }

  onMounted(() => {
    eventBus.on('updateMarkImage', handleUpdateMarkImage)
    eventBus.on('refreshMarkThumbs', handleRefreshMarkThumbs)
    getThumbs()
  })

  onBeforeUnmount(() => {
    eventBus.off('updateMarkImage', handleUpdateMarkImage)
    eventBus.off('refreshMarkThumbs', handleRefreshMarkThumbs)
  })

  return {
    player,
    marksType,
    is_thumbs_loaded,
    assigned,
    marks,
    getThumbs,
    getIcon: getMarkListIcon,
    getColor: getMarkListColor,
    getDuration,
    jumpTo,
    edit,
    remove,
  }
}
