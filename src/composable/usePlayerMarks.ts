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
  loadMarkImageDisplayUrl,
} from '@/utils/markThumb'
import type { PlayerMark } from '@/types/player'

interface UsePlayerMarksOptions {
  emit: (event: 'removeMark', mark: PlayerMark) => void
}

export function usePlayerMarks({ emit }: UsePlayerMarksOptions) {
  const appStore = useAppStore()
  const playerStore = usePlayerStore()
  const itemsStore = useItemsStore()
  const eventBus = useEventBus()

  const marksType = ref<Array<string | number>>(['favorite', 'bookmark'])
  const is_thumbs_loaded = ref(false)

  const player = computed(() => playerStore)
  const assigned = computed(() => itemsStore.assigned.filter((i) => i.meta?.marks))

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

    for (const mark of playerStore.marks) {
      await loadMarkThumb(mark)
    }

    is_thumbs_loaded.value = true
  }

  const getDuration = (duration: number) => getReadableDuration(duration)

  const jumpTo = (time: number) => {
    playerStore.playerJumpTo(time)
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
    remove,
  }
}
