import { defineStore } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useItemsStore } from '@/stores/items'
import { useTasksStore } from '@/stores/tasks'
import { getCurrentMediaType } from '@/utils/mediaType'
import { BASE_MARK_TYPES, findAssignedMeta, isMetaMarkType, normalizeMarkTime } from '@/utils/markAdding'
import type { MediaItem, Meta, Tag } from '@/types/stores'
import type { AssignedMeta } from '@shared/entities/meta'
import type { ValueInTagEntry } from '@shared/api/responses'
import type { Tab } from '@shared/entities/tab'
import type { MediaType } from '@/types/media'
import type { ScraperImageAssignment, ScraperMultiplePerformer } from '@mediachips/plugin-adult/types/scraper'
import type { SceneScraperBatchItem } from '@mediachips/plugin-adult/types/sceneScraper'

export const useDialogsStore = defineStore('useDialogsStore', {
  state: () => ({
    documentation: false,
    localAi: {
      show: false,
      seedPrompt: '',
    },
    feedback: false,
    feedbackPreset: null as { subject?: string; message?: string } | null,
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
    faceResults: { show: false, media: null as MediaItem | null, taskId: null as string | null },
    enrollmentQuality: { show: false, metaId: null as number | null },
    tagEditing: { show: false, tag: null as Tag | null, meta: null as Meta | null, assigned: null as AssignedMeta[] | null, values: null as ValueInTagEntry[] | null },
    tagMerge: { show: false, tags: [] as Tag[], meta: null as Meta | null },
    mediaMerge: { show: false, items: [] as MediaItem[], survivorId: null as number | null },
    duplicateReview: {
      show: false,
      duplicatesBy: null as string | null,
      mediaTypeId: null as number | null,
    },
    similarWall: {
      show: false,
      seedId: null as number | null,
      mediaTypeId: null as number | null,
    },
    textPreview: {
      show: false,
      media: null as MediaItem | null,
    },
    tagCategoryMerge: { show: false, categories: [] as Meta[] },
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
    confirm: {
      show: false,
      text: null as string | null,
      action: null as (() => void) | null,
      checkBox: false,
      checkBoxText: '',
      checkBox2: false,
      checkBox2Text: '',
      checkBox2RequiresPrimary: false,
    },
    playlistAdd: { show: false, mediaIds: [] as number[] },
    process: { show: false, text: null as string | null },
    tabEditing: { show: false, tab: null as Tab | null },
    about: { show: false },
    onboarding: { show: false },
    adultOnboarding: { show: false },
    scraperConfig: { show: false },
    scraper: { show: false, images: [] as ScraperImageAssignment[] },
    camgirlFinder: {
      show: false,
      query: '',
      cropPath: null as string | null,
      tag: null as Tag | null,
      meta: null as Meta | null,
      faceId: null as number | null,
      clusterFaceIds: [] as number[],
      mediaId: null as number | null,
    },
    scraperMultiple: { show: false, performers: [] as ScraperMultiplePerformer[], progress: 0 },
    sceneScraper: { show: false, media: null as MediaItem | null },
    sceneScraperMultiple: { show: false, items: [] as SceneScraperBatchItem[], progress: 0 },
    tmdbScraper: { show: false, media: null as MediaItem | null },
    tmdbPersonScraper: {
      show: false,
      tag: null as Tag | null,
      meta: null as Meta | null,
    },
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
    openFaceResults(media: MediaItem | null, options: {taskId?: string | null} = {}) {
      this.faceResults.media = media ? { ...media } : null
      this.faceResults.taskId = options.taskId || null
      this.faceResults.show = true
    },
    closeFaceResults() {
      const taskId = this.faceResults.taskId
      this.faceResults.show = false
      this.faceResults.media = null
      this.faceResults.taskId = null
      if (taskId) {
        const tasksStore = useTasksStore()
        const task = tasksStore.list.find((item) => item.id === taskId)
        if (task && !task.done && typeof task.action === 'function') {
          task.action()
        }
        tasksStore.removeTask(taskId)
      }
    },
    openEnrollmentQuality(metaId: number | null = null) {
      this.enrollmentQuality.metaId = metaId != null && Number.isFinite(metaId) ? Number(metaId) : null
      this.enrollmentQuality.show = true
    },
    closeEnrollmentQuality() {
      this.enrollmentQuality.show = false
      this.enrollmentQuality.metaId = null
    },
    editTag(tag: Tag, meta: Meta) {
      this.tagEditing.tag = tag
      this.tagEditing.meta = meta
      this.tagEditing.show = true
    },
    openCamGirlFinder(options: {
      query?: string
      cropPath?: string | null
      tag?: Tag | null
      meta?: Meta | null
      faceId?: number | null
      clusterFaceIds?: number[]
      mediaId?: number | null
    } = {}) {
      this.camgirlFinder.query = String(options.query || '').trim()
      this.camgirlFinder.cropPath = options.cropPath ? String(options.cropPath) : null
      this.camgirlFinder.tag = options.tag ? {...options.tag} : null
      this.camgirlFinder.meta = options.meta ? {...options.meta} : null
      this.camgirlFinder.faceId = options.faceId != null && Number.isFinite(Number(options.faceId))
        ? Number(options.faceId)
        : null
      this.camgirlFinder.clusterFaceIds = Array.isArray(options.clusterFaceIds)
        ? options.clusterFaceIds.map(Number).filter((id) => Number.isFinite(id) && id > 0)
        : []
      this.camgirlFinder.mediaId = options.mediaId != null && Number.isFinite(Number(options.mediaId))
        ? Number(options.mediaId)
        : null
      this.camgirlFinder.show = true
    },
    closeCamGirlFinder() {
      this.camgirlFinder.show = false
      this.camgirlFinder.query = ''
      this.camgirlFinder.cropPath = null
      this.camgirlFinder.tag = null
      this.camgirlFinder.meta = null
      this.camgirlFinder.faceId = null
      this.camgirlFinder.clusterFaceIds = []
      this.camgirlFinder.mediaId = null
    },
    openTagMerge(tags: Tag[], meta: Meta) {
      this.tagMerge.tags = tags
      this.tagMerge.meta = meta
      this.tagMerge.show = true
    },
    closeTagMerge() {
      this.tagMerge.show = false
      this.tagMerge.tags = []
      this.tagMerge.meta = null
    },
    openMediaMerge(items: MediaItem[], survivorId?: number | null) {
      this.mediaMerge.items = items
      this.mediaMerge.survivorId = survivorId == null ? null : Number(survivorId)
      this.mediaMerge.show = true
    },
    closeMediaMerge() {
      this.mediaMerge.show = false
      this.mediaMerge.items = []
      this.mediaMerge.survivorId = null
    },
    openDuplicateReview(options?: {
      duplicatesBy?: string | null
      mediaTypeId?: number | null
    }) {
      this.duplicateReview.duplicatesBy = options?.duplicatesBy ?? null
      this.duplicateReview.mediaTypeId = options?.mediaTypeId == null
        ? null
        : Number(options.mediaTypeId)
      this.duplicateReview.show = true
    },
    closeDuplicateReview() {
      this.duplicateReview.show = false
      this.duplicateReview.duplicatesBy = null
      this.duplicateReview.mediaTypeId = null
    },
    openSimilarWall(options: {
      seedId: number
      mediaTypeId?: number | null
    }) {
      const seedId = Number(options.seedId)
      if (!Number.isFinite(seedId) || seedId <= 0) return
      this.similarWall.seedId = seedId
      this.similarWall.mediaTypeId = options.mediaTypeId == null
        ? null
        : Number(options.mediaTypeId)
      this.similarWall.show = true
    },
    setSimilarWallSeed(seedId: number) {
      const id = Number(seedId)
      if (!Number.isFinite(id) || id <= 0) return
      this.similarWall.seedId = id
    },
    closeSimilarWall() {
      this.similarWall.show = false
      this.similarWall.seedId = null
      this.similarWall.mediaTypeId = null
    },
    openTextPreview(media: MediaItem | null | undefined) {
      if (!media?.path) return
      this.textPreview.media = {...media}
      this.textPreview.show = true
    },
    closeTextPreview() {
      this.textPreview.show = false
      this.textPreview.media = null
    },
    openTagCategoryMerge(categories: Meta[]) {
      this.tagCategoryMerge.categories = categories
      this.tagCategoryMerge.show = true
    },
    closeTagCategoryMerge() {
      this.tagCategoryMerge.show = false
      this.tagCategoryMerge.categories = []
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
