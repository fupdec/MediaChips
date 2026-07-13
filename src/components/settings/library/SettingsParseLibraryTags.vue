<template>
  <div class="mx-4 pb-4">
    <SettingsCategoryDivider
      :title="t('settings_labels.library.parse_library_tags')"
      icon="tag-search-outline"
    />

    <v-alert
      type="info"
      variant="tonal"
      density="compact"
      rounded="xl"
      class="mb-4"
    >
      <span class="text-caption">
        {{ t('settings_labels.library.parse_library_tags_hint') }}
      </span>
    </v-alert>

    <div class="text-body-2 mb-4">
      <template v-if="statusLoaded && hasParserMetas">
        {{ t('settings_labels.library.parse_library_tags_status', {
          totalMedia: status.totalMedia,
          parserMetas: parserMetaNames,
          parserTags: status.parserTags,
        }) }}
      </template>
      <template v-else-if="statusLoaded">
        {{ t('settings_labels.library.parse_library_tags_status_no_parser') }}
      </template>
      <template v-else>
        {{ t('settings_labels.database.status_not_loaded') }}
      </template>
    </div>

    <div class="mb-4">
      <div class="text-body-2 mb-2">
        {{ t('settings_labels.library.parse_library_tags_match_precision') }}
      </div>

      <v-btn-toggle
        v-model="matchPrecisionPreset"
        mandatory
        divided
        rounded="lg"
        color="primary"
        class="match-precision-toggle mb-3"
      >
        <v-btn value="strict" class="match-precision-toggle__btn">
          <v-icon icon="mdi-target" start/>
          {{ t('settings_labels.library.parse_library_tags_match_precision_level_strict') }}
        </v-btn>
        <v-btn value="balanced" class="match-precision-toggle__btn">
          <v-icon icon="mdi-tune-variant" start/>
          {{ t('settings_labels.library.parse_library_tags_match_precision_level_balanced') }}
        </v-btn>
        <v-btn value="permissive" class="match-precision-toggle__btn">
          <v-icon icon="mdi-select-search" start/>
          {{ t('settings_labels.library.parse_library_tags_match_precision_level_permissive') }}
        </v-btn>
      </v-btn-toggle>

      <v-alert
        :color="matchPrecisionColor"
        variant="tonal"
        density="compact"
        rounded="lg"
        class="match-precision-alert"
      >
        <div class="text-body-2 font-weight-medium mb-1">
          {{ matchPrecisionLabel }}
        </div>
        <div class="text-caption">
          {{ matchPrecisionDescription }}
        </div>
      </v-alert>
    </div>

    <div class="d-flex flex-wrap ga-2 mb-4">
      <v-btn
        @click="refreshStatus"
        :loading="statusLoading"
        :disabled="statusLoading || active"
        color="secondary"
        rounded
        variant="outlined"
        class="pr-4"
      >
        <v-icon icon="mdi-refresh" start/>
        {{ t('settings_labels.database.refresh_status') }}
      </v-btn>

      <v-btn
        @click="startParsing"
        :disabled="!canStart"
        color="primary"
        rounded
        variant="flat"
        class="pr-4"
      >
        <v-icon icon="mdi-tag-search-outline" start/>
        {{ t('settings_labels.library.parse_library_tags_start') }}
      </v-btn>
    </div>

    <v-dialog
      v-model="dialog"
      :fullscreen="xs"
      :width="xl ? 1280 : 960"
      scrollable
      class="parse-library-tags-dialog"
    >
      <v-card rounded="lg" class="parse-library-tags-dialog__card">
        <DialogHeader
          :header="t('settings_labels.library.parse_library_tags_dialog_title')"
          :subheader="dialogSubheader"
          :buttons="dialogButtons"
          closable
          @close="closeDialog"
        />

        <v-card-text class="parse-library-tags-dialog__body">
          <div v-if="active" class="scan-state py-8 px-4">
            <v-progress-linear
              :model-value="progress"
              color="primary"
              height="10"
              rounded
              striped
              class="mb-4"
            />
            <div class="text-body-2 text-center mb-2">
              {{ t('settings_labels.library.parse_library_tags_progress', counters) }}
            </div>
            <div
              v-if="currentPath"
              class="text-caption text-medium-emphasis text-center selectable scan-state__path"
            >
              {{ currentPath }}
            </div>
          </div>

          <template v-else-if="items.length > 0">
            <div class="parse-library-tags-dialog__results">
            <div class="summary-chips d-flex flex-wrap ga-2 mb-4">
              <v-chip size="small" variant="tonal" color="primary">
                {{ t('settings_labels.library.parse_library_tags_summary_media', {
                  count: displayItems.length,
                }) }}
              </v-chip>
              <v-chip size="small" variant="tonal" color="secondary">
                {{ t('settings_labels.library.parse_library_tags_summary_tags', {
                  count: uniqueNewTags.length,
                }) }}
              </v-chip>
              <v-chip size="small" variant="tonal">
                {{ t('settings_labels.library.parse_library_tags_summary_assignments', {
                  count: totalNewAssignmentCount,
                }) }}
              </v-chip>
            </div>

            <v-tabs
              v-if="smAndDown"
              v-model="dialogTab"
              density="compact"
              class="mb-3"
            >
              <v-tab value="tags">
                {{ t('settings_labels.library.parse_library_tags_tab_tags', {
                  count: filteredUniqueNewTags.length,
                }) }}
              </v-tab>
              <v-tab value="media">
                {{ t('settings_labels.library.parse_library_tags_tab_media', {
                  count: searchedDisplayItems.length,
                }) }}
              </v-tab>
            </v-tabs>

            <v-window v-if="smAndDown" v-model="dialogTab">
              <v-window-item value="tags">
                <TagsPanel
                  :filtered-tags="filteredUniqueNewTags"
                  :selected-keys="selectedGlobalTagKeys"
                  :select-all="selectAllTags"
                  :select-all-indeterminate="selectAllTagsIndeterminate"
                  :tag-search="tagSearch"
                  :tag-sort-mode="tagSortMode"
                  :selected-meta-filter="selectedMetaFilter"
                  :parser-metas="parserMetasInResults"
                  @update:tag-search="tagSearch = $event"
                  @update:tag-sort-mode="tagSortMode = $event"
                  @update:selected-meta-filter="selectedMetaFilter = $event"
                  @toggle-tag="toggleGlobalTag"
                  @toggle-select-all="toggleSelectAllTags"
                />
              </v-window-item>
              <v-window-item value="media">
                <MediaPanel
                  :items="searchedDisplayItems"
                  :selected-ids="selectedIds"
                  :select-all-media="selectAllMedia"
                  :media-search="mediaSearch"
                  :meta-icon="metaIcon"
                  @update:media-search="mediaSearch = $event"
                  @toggle-media="toggleMedia"
                  @toggle-select-all="toggleSelectAllMedia"
                />
              </v-window-item>
            </v-window>

            <v-row v-else dense class="parse-library-tags-dialog__columns">
              <v-col cols="12" md="5" class="parse-library-tags-dialog__col">
                <TagsPanel
                  :filtered-tags="filteredUniqueNewTags"
                  :selected-keys="selectedGlobalTagKeys"
                  :select-all="selectAllTags"
                  :select-all-indeterminate="selectAllTagsIndeterminate"
                  :tag-search="tagSearch"
                  :tag-sort-mode="tagSortMode"
                  :selected-meta-filter="selectedMetaFilter"
                  :parser-metas="parserMetasInResults"
                  @update:tag-search="tagSearch = $event"
                  @update:tag-sort-mode="tagSortMode = $event"
                  @update:selected-meta-filter="selectedMetaFilter = $event"
                  @toggle-tag="toggleGlobalTag"
                  @toggle-select-all="toggleSelectAllTags"
                />
              </v-col>
              <v-col cols="12" md="7" class="parse-library-tags-dialog__col">
                <MediaPanel
                  :items="searchedDisplayItems"
                  :selected-ids="selectedIds"
                  :select-all-media="selectAllMedia"
                  :media-search="mediaSearch"
                  :meta-icon="metaIcon"
                  @update:media-search="mediaSearch = $event"
                  @toggle-media="toggleMedia"
                  @toggle-select-all="toggleSelectAllMedia"
                />
              </v-col>
            </v-row>
            </div>
          </template>

          <div
            v-else-if="scanFinished"
            class="text-center py-10 text-medium-emphasis"
          >
            <v-icon icon="mdi-tag-off-outline" size="48" class="mb-3 opacity-60"/>
            <div>{{ t('settings_labels.library.parse_library_tags_no_results') }}</div>
          </div>
        </v-card-text>

        <div
          v-if="items.length > 0 && !active"
          class="parse-library-tags-dialog__footer"
        >
          <div class="text-caption text-medium-emphasis">
            {{ t('settings_labels.library.parse_library_tags_selection_summary', {
              tags: selectedGlobalTagKeys.length,
              media: selectedIds.length,
            }) }}
          </div>

          <div class="d-flex flex-wrap ga-2 justify-end">
            <v-btn
              @click="applySelectedGlobalTags"
              :disabled="selectedGlobalTagKeys.length === 0 || applying"
              :loading="applying"
              color="primary"
              rounded
              variant="flat"
            >
              {{ t('settings_labels.library.parse_library_tags_apply_global_tags', {
                count: selectedGlobalAssignmentCount,
              }) }}
            </v-btn>

            <v-btn
              @click="applySelectedMedia"
              :disabled="selectedIds.length === 0 || applying"
              :loading="applying"
              color="secondary"
              rounded
              variant="outlined"
            >
              {{ t('settings_labels.library.parse_library_tags_apply_selected', {
                count: selectedMediaAssignmentCount,
              }) }}
            </v-btn>

            <v-btn
              @click="applyAll"
              :disabled="applying || totalNewAssignmentCount === 0"
              :loading="applying"
              color="success"
              rounded
              variant="tonal"
            >
              {{ t('settings_labels.library.parse_library_tags_apply_all', {
                count: totalNewAssignmentCount,
              }) }}
            </v-btn>
          </div>
        </div>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import TagsPanel from '@/components/settings/library/parseLibraryTags/TagsPanel.vue'
import MediaPanel from '@/components/settings/library/parseLibraryTags/MediaPanel.vue'
import { typedApi } from '@/services/typedApi'
import { setNotification } from '@/services/notificationService'
import { setOption } from '@/services/settingsService'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { useTasksStore } from '@/stores/tasks'
import type {
  ApplyParseLibraryTagsResponse,
  ParseLibraryTagsPreviewItem,
  ParseLibraryTagsSearchEvent,
  ParseLibraryTagsStatus,
  ParseLibraryTagsSummary,
} from '@/types/settings'

type TagSortMode = 'count' | 'alphabet'

type UniqueNewTag = {
  key: string
  tagId: number
  metaId: number
  tagName: string
  metaName: string
  metaIcon: string
  mediaCount: number
}

const assignmentKey = (mediaId: number, metaId: number, tagId: number) => `${mediaId}:${metaId}:${tagId}`
const globalTagKey = (metaId: number, tagId: number) => `${metaId}:${tagId}`

const { t } = useI18n()
const router = useRouter()
const { xs, xl, smAndDown } = useDisplay()
const appStore = useAppStore()
const settingsStore = useSettingsStore()
const tasksStore = useTasksStore()

const status = ref<ParseLibraryTagsStatus>({
  totalMedia: 0,
  parserMetas: [],
  parserTags: 0,
})
const statusLoaded = ref(false)
const statusLoading = ref(false)
const active = ref(false)
const applying = ref(false)
const dialog = ref(false)
const scanFinished = ref(false)
const progress = ref(0)
const currentPath = ref('')
const items = ref<ParseLibraryTagsPreviewItem[]>([])
const selectedIds = ref<number[]>([])
const selectedGlobalTagKeys = ref<string[]>([])
const selectAllMedia = ref(false)
const tagSortMode = ref<TagSortMode>('count')
const selectedMetaFilter = ref<number | null>(null)
const tagSearch = ref('')
const mediaSearch = ref('')
const dialogTab = ref<'tags' | 'media'>('tags')
const lastSummary = ref<ParseLibraryTagsSummary | null>(null)
const counters = ref({
  processed: 0,
  total: 0,
  withNew: 0,
})

let abortController: AbortController | null = null
let taskId: string | null = null

const openParseLibraryTagsDialog = () => {
  if (router.currentRoute.value.path !== '/settings') {
    void router.push({ path: '/settings', query: { tab: 'library' } })
  }
  dialog.value = true
}

const updateParseLibraryTagsTask = (data: {
  subtitle?: string
  progress?: number
  color?: string
  done?: boolean
  action?: () => void
}) => {
  if (!taskId) return
  tasksStore.updateTask(taskId, data)
}

const clearParseLibraryTagsTask = () => {
  if (!taskId) return
  tasksStore.removeTask(taskId)
  taskId = null
}

const hasParserMetas = computed(() => status.value.parserMetas.length > 0)
const parserMetaNames = computed(() => status.value.parserMetas.map((meta) => meta.name).join(', '))
const canStart = computed(() => statusLoaded.value && hasParserMetas.value && !active.value)

type MatchPrecisionPreset = 'strict' | 'balanced' | 'permissive'

const MATCH_PRECISION_VALUES: Record<MatchPrecisionPreset, string> = {
  strict: '0.15',
  balanced: '0.50',
  permissive: '0.85',
}

const matchPrecisionPreset = computed<MatchPrecisionPreset>({
  get() {
    const value = Number(settingsStore['pathParser.matchPrecision'] || 0.5)
    if (value <= 0.25) return 'strict'
    if (value >= 0.75) return 'permissive'
    return 'balanced'
  },
  set(preset) {
    void setOption(MATCH_PRECISION_VALUES[preset], 'pathParser.matchPrecision')
  },
})

const matchPrecisionLabel = computed(() => {
  if (matchPrecisionPreset.value === 'strict') {
    return t('settings_labels.library.parse_library_tags_match_precision_level_strict')
  }
  if (matchPrecisionPreset.value === 'permissive') {
    return t('settings_labels.library.parse_library_tags_match_precision_level_permissive')
  }
  return t('settings_labels.library.parse_library_tags_match_precision_level_balanced')
})

const matchPrecisionDescription = computed(() => {
  if (matchPrecisionPreset.value === 'strict') {
    return t('settings_labels.library.parse_library_tags_match_precision_desc_strict')
  }
  if (matchPrecisionPreset.value === 'permissive') {
    return t('settings_labels.library.parse_library_tags_match_precision_desc_permissive')
  }
  return t('settings_labels.library.parse_library_tags_match_precision_desc_balanced')
})

const matchPrecisionColor = computed(() => {
  if (matchPrecisionPreset.value === 'strict') return 'warning'
  if (matchPrecisionPreset.value === 'permissive') return 'secondary'
  return 'primary'
})

const metaIcon = (metaId: number) => String(appStore.getMetaById(metaId)?.icon || 'tag')

const displayItems = computed(() => items.value.map((item) => ({
  ...item,
  tags: item.tags.filter((tag) => tag.isNew),
})))

const uniqueNewTags = computed(() => {
  const map = new Map<string, UniqueNewTag>()

  for (const item of items.value) {
    for (const tag of item.tags) {
      if (!tag.isNew) continue
      const key = globalTagKey(tag.metaId, tag.tagId)
      const existing = map.get(key)
      if (existing) {
        existing.mediaCount += 1
      } else {
        map.set(key, {
          key,
          tagId: tag.tagId,
          metaId: tag.metaId,
          tagName: tag.tagName,
          metaName: tag.metaName,
          metaIcon: metaIcon(tag.metaId),
          mediaCount: 1,
        })
      }
    }
  }

  return [...map.values()]
})

const parserMetasInResults = computed(() => {
  const metaIds = new Set(uniqueNewTags.value.map((tag) => tag.metaId))
  return appStore.meta
    .filter((meta) => meta.parser && metaIds.has(Number(meta.id)))
    .map((meta) => ({
      id: Number(meta.id),
      name: String(meta.name || ''),
      icon: String(meta.icon || 'tag'),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

const filteredUniqueNewTags = computed(() => {
  let tags = uniqueNewTags.value
  if (selectedMetaFilter.value != null) {
    tags = tags.filter((tag) => tag.metaId === selectedMetaFilter.value)
  }

  const query = tagSearch.value.trim().toLowerCase()
  if (query) {
    tags = tags.filter((tag) => (
      tag.tagName.toLowerCase().includes(query)
      || tag.metaName.toLowerCase().includes(query)
    ))
  }

  if (tagSortMode.value === 'count') {
    return [...tags].sort((a, b) => (
      b.mediaCount - a.mediaCount
      || a.tagName.localeCompare(b.tagName)
      || a.metaName.localeCompare(b.metaName)
    ))
  }

  return [...tags].sort((a, b) => (
    a.tagName.localeCompare(b.tagName)
    || a.metaName.localeCompare(b.metaName)
    || b.mediaCount - a.mediaCount
  ))
})

const searchedDisplayItems = computed(() => {
  const query = mediaSearch.value.trim().toLowerCase()
  if (!query) return displayItems.value

  return displayItems.value.filter((item) => item.path.toLowerCase().includes(query))
})

const filteredGlobalTagKeys = computed(() => filteredUniqueNewTags.value.map((tag) => tag.key))

const totalNewAssignmentCount = computed(() => (
  items.value.reduce((sum, item) => sum + item.tags.filter((tag) => tag.isNew).length, 0)
))

const selectedMediaAssignmentCount = computed(() => {
  const selected = new Set(selectedIds.value)
  return items.value
    .filter((item) => selected.has(item.mediaId))
    .reduce((sum, item) => sum + item.tags.filter((tag) => tag.isNew).length, 0)
})

const selectedGlobalAssignmentCount = computed(() => {
  const selected = new Set(selectedGlobalTagKeys.value)
  let count = 0
  for (const item of items.value) {
    for (const tag of item.tags) {
      if (!tag.isNew) continue
      if (selected.has(globalTagKey(tag.metaId, tag.tagId))) count += 1
    }
  }
  return count
})

const selectAllTags = computed(() => {
  if (!filteredGlobalTagKeys.value.length) return false
  return filteredGlobalTagKeys.value.every((key) => selectedGlobalTagKeys.value.includes(key))
})

const selectAllTagsIndeterminate = computed(() => {
  const selectedCount = filteredGlobalTagKeys.value.filter((key) => (
    selectedGlobalTagKeys.value.includes(key)
  )).length
  return selectedCount > 0 && selectedCount < filteredGlobalTagKeys.value.length
})


const dialogSubheader = computed(() => {
  if (active.value) return ''
  if (!lastSummary.value) return ''
  return t('settings_labels.library.parse_library_tags_complete', lastSummary.value)
})

const dialogButtons = computed(() => {
  if (!active.value) return []
  return [{
    icon: 'mdi-stop',
    color: 'error',
    function: stopParsing,
  }]
})

const fetchStatus = async () => {
  const response = await typedApi.parseLibraryTagsStatus()
  status.value = response.data as ParseLibraryTagsStatus
  statusLoaded.value = true
}

const refreshStatus = async () => {
  statusLoading.value = true
  try {
    await fetchStatus()
  } catch (error) {
    console.error('Failed to load parse library tags status:', error)
  } finally {
    statusLoading.value = false
  }
}

const toggleMedia = (mediaId: number, value: boolean | null) => {
  if (value) {
    if (!selectedIds.value.includes(mediaId)) {
      selectedIds.value = [...selectedIds.value, mediaId]
    }
  } else {
    selectedIds.value = selectedIds.value.filter((id) => id !== mediaId)
  }

  selectAllMedia.value = selectedIds.value.length === searchedDisplayItems.value.length
    && searchedDisplayItems.value.length > 0
}

const toggleSelectAllMedia = (value: boolean | null) => {
  selectedIds.value = value ? searchedDisplayItems.value.map((item) => item.mediaId) : []
  selectAllMedia.value = Boolean(value)
}

const toggleGlobalTag = (key: string, value: boolean | null) => {
  if (value) {
    if (!selectedGlobalTagKeys.value.includes(key)) {
      selectedGlobalTagKeys.value = [...selectedGlobalTagKeys.value, key]
    }
  } else {
    selectedGlobalTagKeys.value = selectedGlobalTagKeys.value.filter((item) => item !== key)
  }
}

const toggleSelectAllTags = (value: boolean | null) => {
  const keys = filteredGlobalTagKeys.value
  if (value) {
    selectedGlobalTagKeys.value = [...new Set([...selectedGlobalTagKeys.value, ...keys])]
    return
  }

  const remove = new Set(keys)
  selectedGlobalTagKeys.value = selectedGlobalTagKeys.value.filter((key) => !remove.has(key))
}

const buildAssignmentsFromMedia = (mediaIds: number[]) => {
  const selected = new Set(mediaIds)
  const assignments: Array<{ mediaId: number; tagId: number; metaId: number }> = []

  for (const item of items.value) {
    if (!selected.has(item.mediaId)) continue
    for (const tag of item.tags) {
      if (!tag.isNew) continue
      assignments.push({
        mediaId: item.mediaId,
        tagId: tag.tagId,
        metaId: tag.metaId,
      })
    }
  }

  return assignments
}

const buildAssignmentsFromGlobalTags = (tagKeys: string[]) => {
  const selected = new Set(tagKeys)
  const assignments: Array<{ mediaId: number; tagId: number; metaId: number }> = []

  for (const item of items.value) {
    for (const tag of item.tags) {
      if (!tag.isNew) continue
      if (!selected.has(globalTagKey(tag.metaId, tag.tagId))) continue
      assignments.push({
        mediaId: item.mediaId,
        tagId: tag.tagId,
        metaId: tag.metaId,
      })
    }
  }

  return assignments
}

const applyAssignments = async (assignments: Array<{ mediaId: number; tagId: number; metaId: number }>) => {
  if (!assignments.length) return

  applying.value = true
  try {
    const response = await typedApi.applyParseLibraryTags({ assignments })
    const result = response.data as ApplyParseLibraryTagsResponse
    setNotification({
      type: 'success',
      title: t('settings_labels.library.parse_library_tags_apply_done'),
      text: t('settings_labels.library.parse_library_tags_apply_done_text', {
        count: result.applied || assignments.length,
      }),
    })

    const appliedKeys = new Set(assignments.map((item) => assignmentKey(item.mediaId, item.metaId, item.tagId)))
    items.value = items.value
      .map((item) => ({
        ...item,
        tags: item.tags.map((tag) => ({
          ...tag,
          isNew: appliedKeys.has(assignmentKey(item.mediaId, tag.metaId, tag.tagId)) ? false : tag.isNew,
        })),
      }))
      .filter((item) => item.tags.some((tag) => tag.isNew))

    selectedIds.value = selectedIds.value.filter((id) => items.value.some((item) => item.mediaId === id))
    selectedGlobalTagKeys.value = selectedGlobalTagKeys.value.filter((key) => (
      items.value.some((item) => item.tags.some((tag) => (
        tag.isNew && globalTagKey(tag.metaId, tag.tagId) === key
      )))
    ))
    selectAllMedia.value = selectedIds.value.length === searchedDisplayItems.value.length
    && searchedDisplayItems.value.length > 0
  } catch (error) {
    console.error('Failed to apply parsed library tags:', error)
    setNotification({
      type: 'error',
      title: t('settings_labels.library.parse_library_tags'),
      text: String(error),
    })
  } finally {
    applying.value = false
  }
}

const applySelectedMedia = async () => {
  await applyAssignments(buildAssignmentsFromMedia(selectedIds.value))
}

const applySelectedGlobalTags = async () => {
  await applyAssignments(buildAssignmentsFromGlobalTags(selectedGlobalTagKeys.value))
}

const applyAll = async () => {
  await applyAssignments(buildAssignmentsFromMedia(items.value.map((item) => item.mediaId)))
}

const closeDialog = () => {
  if (active.value) {
    dialog.value = false
    return
  }
  dialog.value = false
  clearParseLibraryTagsTask()
}

const stopParsing = () => {
  abortController?.abort()
}

const startParsing = async () => {
  if (!canStart.value) return

  dialog.value = true
  active.value = true
  scanFinished.value = false
  progress.value = 0
  currentPath.value = ''
  items.value = []
  selectedIds.value = []
  selectedGlobalTagKeys.value = []
  selectAllMedia.value = false
  tagSortMode.value = 'count'
  selectedMetaFilter.value = null
  tagSearch.value = ''
  mediaSearch.value = ''
  dialogTab.value = 'tags'
  lastSummary.value = null
  counters.value = {
    processed: 0,
    total: status.value.totalMedia,
    withNew: 0,
  }

  abortController = new AbortController()

  taskId = tasksStore.setTask({
    title: t('settings_labels.library.parse_library_tags'),
    subtitle: t('settings_labels.library.parse_library_tags_progress', counters.value),
    icon: 'tag-search-outline',
    progress: 0,
    click: openParseLibraryTagsDialog,
    action: stopParsing,
  })
  const currentTaskId = taskId

  try {
    const response = await fetch(`${appStore.localhost}/api/Task/streamParseLibraryTagsPreview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abortController.signal,
      body: JSON.stringify({}),
    })

    if (!response.ok || !response.body) {
      throw new Error(response.statusText || 'Parse library tags request failed')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    const handleEvent = (event: ParseLibraryTagsSearchEvent) => {
      if (event.type === 'progress') {
        counters.value = {
          processed: event.processed || counters.value.processed,
          total: event.total || counters.value.total,
          withNew: items.value.length,
        }
        currentPath.value = event.current || currentPath.value

        if (event.total) {
          progress.value = Math.min(((event.processed || 0) / event.total) * 100, 99)
        }

        updateParseLibraryTagsTask({
          subtitle: t('settings_labels.library.parse_library_tags_progress', counters.value),
          progress: progress.value,
        })
      }

      if (event.type === 'item' && event.item) {
        items.value = [...items.value, event.item]
        counters.value.withNew = items.value.length
      }

      if (event.type === 'complete') {
        if (Array.isArray(event.items) && event.items.length) {
          items.value = event.items
        }

        lastSummary.value = event.summary || {
          totalMedia: counters.value.total,
          mediaWithNewTags: items.value.length,
          totalNewTags: totalNewAssignmentCount.value,
          totalProposedTags: 0,
          stopped: false,
        }
        progress.value = 100
        scanFinished.value = true

        updateParseLibraryTagsTask({
          subtitle: t('settings_labels.library.parse_library_tags_complete', lastSummary.value),
          progress: 100,
          color: 'success',
          done: true,
          action: () => {},
        })
      }

      if (event.type === 'error') {
        throw new Error(event.message || 'Parse library tags failed')
      }
    }

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        handleEvent(JSON.parse(line) as ParseLibraryTagsSearchEvent)
      }
    }

    if (buffer.trim()) {
      handleEvent(JSON.parse(buffer) as ParseLibraryTagsSearchEvent)
    }
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      console.error('Parse library tags failed:', error)
      setNotification({
        type: 'error',
        title: t('settings_labels.library.parse_library_tags'),
        text: String(error),
      })
      updateParseLibraryTagsTask({
        subtitle: String(error),
        color: 'error',
        done: true,
        action: () => {},
      })
    } else if (currentTaskId) {
      updateParseLibraryTagsTask({
        subtitle: t('common.stop'),
        color: 'warning',
        done: true,
        action: () => {},
      })
    }
    scanFinished.value = true
  } finally {
    active.value = false
    abortController = null
    if (taskId === currentTaskId && !scanFinished.value) {
      updateParseLibraryTagsTask({
        done: true,
        action: () => {},
      })
    }
  }
}

onMounted(() => {
  refreshStatus()
})
</script>

<style scoped lang="scss">
.parse-library-tags-dialog__card {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 48px);
}

.parse-library-tags-dialog__body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.parse-library-tags-dialog__results {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

.parse-library-tags-dialog__columns {
  flex: 1 1 auto;
  min-height: 0;
  align-items: stretch;
}

.parse-library-tags-dialog__col {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.parse-library-tags-dialog__col > .panel-card {
  flex: 1 1 auto;
  min-height: 0;
}

.parse-library-tags-dialog__footer {
  position: sticky;
  bottom: 0;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px 16px;
  background: rgb(var(--v-theme-surface));
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.scan-state__path {
  max-width: 720px;
  margin: 0 auto;
  word-break: break-all;
}

.summary-chips {
  position: sticky;
  top: 0;
  z-index: 1;
  padding-bottom: 4px;
  background: rgb(var(--v-theme-surface));
}

.selectable {
  user-select: text;
}

.match-precision-toggle {
  display: flex;
  width: 100%;
}

.match-precision-toggle__btn {
  flex: 1 1 0;
  min-width: 0;
}

.match-precision-alert {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>
