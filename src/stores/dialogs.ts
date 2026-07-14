import { defineStore } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useItemsStore } from '@/stores/items'
import { getCurrentMediaType } from '@/utils/mediaType'
import { BASE_MARK_TYPES, findAssignedMeta, isMetaMarkType, normalizeMarkTime } from '@/utils/markAdding'
import type { MediaItem, Meta, Tag } from '@/types/stores'
import type { AssignedMeta } from '@shared/entities/meta'
import type { ValueInTagEntry } from '@shared/api/responses'
import type { Tab } from '@shared/entities/tab'
import type { MediaType } from '@/types/media'
import type { ScraperMultiplePerformer } from '@mediachips/plugin-adult/types/scraper'
import type { SceneScraperBatchItem } from '@mediachips/plugin-adult/types/sceneScraper'

export const useDialogsStore = defineStore('useDialogsStore', {
  state: () => ({
    documentation: false,
    feedback: false,
    feedbackPreset: null as { subject?: string; message?: string } | null,
    findInPage: { show: false },
    versions: false,
    changelog: {
      show: false,
      title: '',
      entries: [] as Array<{
        id: string
        version: string
        name: string
        date?: string
        content: string
      }>,
      markSeenOnClose: false,
      seenVersion: '',
    },
    mediaEditing: { show: false, media: null as MediaItem | null, mediaType: {} as Partial<MediaType> },
    tagEditing: { show: false, tag: null as Tag | null, meta: null as Meta | null, assigned: null as AssignedMeta[] | null, values: null as ValueInTagEntry[] | null },
    bulkEditingItems: false,
    markAdding: {
      show: false,
      type: 'favorite',
      meta: {} as Partial<Meta>,
      time: null as number | null,
      end: null as number | null,
      color: '#e91e63',
      is_end_time_active: false,
      submitting: false,
    },
    error: { show: false, text: null as string | null },
    confirm: { show: false, text: null as string | null, action: null as (() => void) | null, checkBox: false, checkBoxText: '' },
    playlistAdd: { show: false, mediaIds: [] as number[] },
    process: { show: false, text: null as string | null },
    tabEditing: { show: false, tab: null as Tab | null },
    about: { show: false },
    onboarding: { show: false },
    adultOnboarding: { show: false },
    scraperConfig: { show: false },
    scraper: { show: false, images: [] as string[] },
    scraperMultiple: { show: false, performers: [] as ScraperMultiplePerformer[], progress: 0 },
    sceneScraper: { show: false, media: null as MediaItem | null },
    sceneScraperMultiple: { show: false, items: [] as SceneScraperBatchItem[], progress: 0 },
  }),
  actions: {
    editMedia(media: MediaItem | null, mediaType: MediaType | null = null) {
      const appStore = useAppStore()
      const itemsStore = useItemsStore()
      const resolvedMediaType = mediaType || getCurrentMediaType(
        appStore.mediaTypes,
        media?.mediaTypeId || itemsStore.environment?.media_type_id,
      )

      this.mediaEditing.show = true
      this.mediaEditing.media = media ? { ...media } : null
      this.mediaEditing.mediaType = (resolvedMediaType || {}) as Partial<MediaType>
    },
    editTag(tag: Tag, meta: Meta) {
      this.tagEditing.tag = tag
      this.tagEditing.meta = meta
      this.tagEditing.show = true
    },
    editTab(tab: Tab) {
      this.tabEditing.tab = tab
      this.tabEditing.show = true
    },
    showAbout() {
      this.about.show = true
    },
    openFeedback(preset?: { subject?: string; message?: string }) {
      this.feedbackPreset = preset || null
      this.feedback = true
    },
    createPlaylistForMedia(mediaIds: number | number[]) {
      this.playlistAdd.mediaIds = Array.isArray(mediaIds) ? mediaIds : [mediaIds]
      this.playlistAdd.show = true
    },
    closePlaylistAdd() {
      this.playlistAdd.show = false
      this.playlistAdd.mediaIds = []
    },
    openMarkAdding({ time = 0, type = 'favorite' }: { time?: number; type?: string } = {}) {
      const normalizedType = type || 'favorite'
      const preset = BASE_MARK_TYPES.find((item) => item.value === normalizedType)

      this.markAdding.time = normalizeMarkTime(time)
      this.markAdding.type = normalizedType
      this.markAdding.end = null
      this.markAdding.is_end_time_active = false
      this.markAdding.submitting = false
      this.markAdding.meta = {}
      this.markAdding.color = preset?.color || '#fff'

      if (isMetaMarkType(normalizedType)) {
        const itemsStore = useItemsStore()
        const found = findAssignedMeta(itemsStore.assigned, normalizedType)
        if (found?.meta) {
          this.markAdding.meta = found.meta
        }
      }

      this.markAdding.show = true
    },
    closeMarkAdding() {
      this.markAdding.show = false
      this.markAdding.submitting = false
    },
    setMarkAddingSubmitting(value: boolean) {
      this.markAdding.submitting = value
    },
  },
})

export default useDialogsStore
