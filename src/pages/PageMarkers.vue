<template>
  <v-container>
    <div class="my-6">
      <div class="text-md-h2 d-flex align-baseline">
        <v-icon size="42" start>mdi-tooltip-outline</v-icon>
        {{ t('navigation.markers') }}
        <span v-if="!marksStore.isLoading && marksStore.totalFiltered > 0" class="text-h5 ml-2">
          <template v-if="marksStore.totalFiltered !== marksStore.total">
            ({{ marksStore.totalFiltered }} of {{ marksStore.total }})
          </template>
          <template v-else>
            ({{ marksStore.totalFiltered }})
          </template>
        </span>
      </div>

      <div class="markers-toolbar d-flex align-center ga-3 mt-4 flex-wrap">
        <v-text-field
          v-model="searchInput"
          :placeholder="t('markers.search_placeholder')"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          rounded="xl"
          clearable
          hide-details
          class="markers-toolbar__search"
          @click:clear="applySearch('')"
          @keydown.enter="applySearch(searchInput)"
          @blur="applySearch(searchInput)"
        />

        <v-autocomplete
          :model-value="marksStore.sortBy"
          @update:model-value="onSortChange"
          :items="MARK_SORT_PARAMS"
          item-value="param"
          rounded="xl"
          variant="outlined"
          density="compact"
          min-width="200"
          :label="t('filters.sort_by')"
          :placeholder="t('filters.select_parameter')"
          class="markers-toolbar__sort"
          hide-details
          :disabled="marksStore.isLoading"
        >
          <template #prepend>
            <v-btn
              v-tooltip:top="t('filters.change_direction')"
              color="primary"
              variant="tonal"
              size="small"
              icon
              @click="toggleSortDir"
            >
              <v-icon>
                {{ marksStore.sortDir === 'asc' ? 'mdi-sort-ascending' : 'mdi-sort-descending' }}
              </v-icon>
            </v-btn>
          </template>
          <template #selection="{ item }">
            <v-icon :icon="`mdi-${item.raw.icon}`" size="small"/>
            <span class="pl-2">{{ t(item.raw.textKey) }}</span>
          </template>
          <template #item="{ item, props: menuProps }">
            <v-list-item v-bind="menuProps" density="compact">
              <template #title>
                <div class="text-body-2 py-1">
                  <v-icon :icon="`mdi-${item.raw.icon}`" size="small"/>
                  <span class="pl-4">{{ t(item.raw.textKey) }}</span>
                </div>
              </template>
            </v-list-item>
          </template>
        </v-autocomplete>

        <v-btn-toggle
          v-model="clipSort"
          mandatory
          density="compact"
          color="primary"
          rounded="xl"
          class="markers-toolbar__clip-sort"
        >
          <v-btn value="time" size="small" :title="t('tags.play_clips_in_order')">
            <v-icon icon="mdi-sort-clock-ascending-outline"/>
          </v-btn>
          <v-btn value="shuffle" size="small" :title="t('tags.play_clips_shuffle')">
            <v-icon icon="mdi-shuffle-variant"/>
          </v-btn>
        </v-btn-toggle>

        <v-btn
          color="primary"
          variant="flat"
          rounded="xl"
          :disabled="!selectedRangedIds.length || playingClips || exportingClips"
          :loading="playingClips"
          @click="playSelectedClips"
        >
          <v-icon start>mdi-playlist-play</v-icon>
          {{ t('markers.play_selected_clips', {count: selectedRangedIds.length}) }}
        </v-btn>
        <v-btn
          color="secondary"
          variant="tonal"
          rounded="xl"
          :disabled="!selectedRangedIds.length || playingClips || exportingClips"
          :loading="exportingClips"
          @click="exportSelectedClips"
        >
          <v-icon start>mdi-export</v-icon>
          {{ t('markers.export_selected_clips', {count: selectedRangedIds.length}) }}
        </v-btn>
      </div>
      <div class="text-caption text-medium-emphasis mt-2">
        {{ t('markers.select_ranged_hint') }}
      </div>
    </div>

    <v-chip-group
      :model-value="marksStore.selectedTypes"
      @update:model-value="onTypesChange"
      color="primary"
      class="mb-4"
      column
      multiple
    >
      <v-chip value="favorite" size="small">
        <v-icon icon="mdi-heart" size="small" start/>
        {{ t('meta.default_names.favorite') }}
      </v-chip>
      <v-chip value="bookmark" size="small">
        <v-icon icon="mdi-bookmark" size="small" start/>
        {{ t('meta.default_names.bookmark') }}
      </v-chip>
      <v-chip
        v-for="meta in marksStore.filterMetas"
        :key="meta.id"
        :value="String(meta.id)"
        size="small"
        :prepend-icon="`mdi-${String(meta.icon || 'tag')}`"
        :text="String(meta.name ?? '')"
      />
    </v-chip-group>

    <Loading v-if="marksStore.isLoading"/>

    <v-row v-else-if="marksStore.marksOnPage.length">
      <v-col
        v-for="mark in marksStore.marksOnPage"
        :key="mark.id"
        cols="12"
        sm="4"
        md="3"
        xl="2"
      >
        <ItemMarker
          :mark="mark"
          selectable
          :selected="selectedIds.has(Number(mark.id))"
          @update:selected="toggleSelected(Number(mark.id), $event)"
        />
      </v-col>
    </v-row>

    <div
      v-if="marksStore.isLoaded && marksStore.total === 0"
      class="layout-img"
    >
      <v-img
        src="/images/no-data.svg"
        max-height="40vh"
        class="my-4"
        contain
      />
      <div class="text-h6 mb-1">{{ t('markers.no_markers_title') }}</div>
      <div class="text--secondary mb-4">{{ t('markers.no_markers_hint') }}</div>
      <div class="d-flex justify-center">
        <v-btn
          color="success"
          variant="flat"
          rounded="xl"
          size="large"
          @click="openLibrary"
        >
          <v-icon start>mdi-folder-play-outline</v-icon>
          {{ t('markers.open_library') }}
        </v-btn>
      </div>
    </div>

    <div
      v-else-if="marksStore.isLoaded && marksStore.totalFiltered === 0"
      class="layout-img"
    >
      <v-img
        src="/images/filters/filters-no-results-marks.svg"
        max-height="40vh"
        class="my-4"
        contain
      />
      <div class="text--secondary mb-4">{{ t('markers.no_results') }}</div>
      <div class="d-flex justify-center">
        <v-btn
          color="primary"
          variant="flat"
          rounded="xl"
          @click="clearMarkerFilters"
        >
          <v-icon start>mdi-filter-off</v-icon>
          {{ t('markers.clear_filters') }}
        </v-btn>
      </div>
    </div>

    <div
      v-if="marksStore.marksOnPage.length && !marksStore.hasMore && marksStore.totalFiltered > 0"
      class="scroll-top-after-items d-flex justify-center my-8"
    >
      <v-btn
        @click="scrollTop"
        color="primary"
        rounded
        variant="outlined"
      >
        <v-icon start>mdi-format-vertical-align-top</v-icon>
        {{ t('items.scroll_to_top') }}
      </v-btn>
    </div>

    <div
      v-if="marksStore.marksOnPage.length && marksStore.hasMore && (marksStore.isLoadingMore || showInfiniteLoader)"
      class="infinite-loader-full-height"
    >
      <Loading v-intersect="infiniteScrolling"/>
    </div>
  </v-container>
</template>

<script setup lang="ts">
import {ref, computed, onMounted} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRouter} from 'vue-router'
import {useMarksStore} from '@/stores/marks'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {usePlayerStore} from '@/stores/player'
import {useTasksStore} from '@/stores/tasks'
import {getDefaultMediaTypeId} from '@/utils/mediaType'
import {MARK_SORT_PARAMS} from '@/utils/markSort'
import {scrollMainTo} from '@/utils/mainScroll'
import useMarkImageGenerator from '@/composable/GeneratingThumbsForMarks'
import ItemMarker from '@/components/items/ItemMarker.vue'
import Loading from '@/components/elements/Loading.vue'
import {typedApi} from '@/services/typedApi'
import {setNotification} from '@/services/notificationService'
import {loadMarkIdClipsForPlayback} from '@/services/tagClipsPlayback'
import {getErrorResponseData} from '@/types/vue'

const {t} = useI18n()
const router = useRouter()
const marksStore = useMarksStore()
const appStore = useAppStore()
const itemsStore = useItemsStore()
const playerStore = usePlayerStore()
const tasksStore = useTasksStore()

useMarkImageGenerator()

const searchInput = ref(marksStore.search || '')
const showInfiniteLoader = ref(false)
const selectedIds = ref<Set<number>>(new Set())
const clipSort = ref<'time' | 'shuffle'>('time')
const playingClips = ref(false)
const exportingClips = ref(false)

const selectedRangedIds = computed(() => {
  const ids: number[] = []
  for (const mark of marksStore.marksOnPage) {
    const id = Number(mark.id)
    if (!selectedIds.value.has(id)) continue
    if (typeof mark.end === 'number') ids.push(id)
  }
  return ids
})

function toggleSelected(id: number, selected: boolean) {
  const next = new Set(selectedIds.value)
  if (selected) next.add(id)
  else next.delete(id)
  selectedIds.value = next
}

function openLibrary() {
  const id = getDefaultMediaTypeId(appStore.mediaTypes)
  void router.push(id != null ? `/media?mediaTypeId=${id}` : '/media')
}

function clearMarkerFilters() {
  searchInput.value = ''
  marksStore.setSearch('')
  marksStore.setSelectedTypes([])
  selectedIds.value = new Set()
}

const onTypesChange = (types: string[]) => {
  marksStore.setSelectedTypes(types || [])
}

const onSortChange = (sortBy: string) => {
  if (marksStore.sortBy === sortBy) {
    toggleSortDir()
    return
  }
  marksStore.setSortBy(sortBy)
}

const toggleSortDir = () => {
  marksStore.setSortDir(marksStore.sortDir === 'asc' ? 'desc' : 'asc')
}

const applySearch = (value: string) => {
  const nextValue = value || ''
  if (nextValue === marksStore.search) return
  marksStore.setSearch(nextValue)
}

const infiniteScrolling = (isIntersecting: boolean) => {
  if (isIntersecting === false) return
  marksStore.loadNextPage()
}

const scrollTop = () => {
  scrollMainTo({top: 0, behavior: 'smooth'})
}

const playSelectedClips = async () => {
  if (!selectedRangedIds.value.length || playingClips.value) return
  playingClips.value = true
  try {
    const loaded = await loadMarkIdClipsForPlayback(async (body) => {
      const res = await typedApi.getMarkClips(body)
      return {
        items: res.data?.items || [],
        count: Number(res.data?.count ?? 0),
      }
    }, selectedRangedIds.value, clipSort.value)

    if (loaded.empty || !loaded.first) {
      setNotification({
        type: 'warning',
        title: t('tags.play_clips_empty_title'),
        text: t('tags.play_clips_empty_text'),
      })
      return
    }

    await itemsStore.playVideo({
      video: loaded.first,
      videos: [loaded.first],
      time: loaded.first.segmentStart,
      trustPath: true,
    })
    if (loaded.playlist.length > 1) {
      playerStore.setPlaylistItems(loaded.playlist)
    }
  } catch (error) {
    setNotification({
      type: 'error',
      title: t('tags.play_clips_empty_title'),
      text: getErrorResponseData<{message?: string}>(error)?.message
        || (error instanceof Error ? error.message : String(error)),
    })
  } finally {
    playingClips.value = false
  }
}

const exportSelectedClips = async () => {
  if (!selectedRangedIds.value.length || exportingClips.value) return
  exportingClips.value = true

  let outputPath: string | undefined
  try {
    if (window.electronAPI?.invoke) {
      const result = await window.electronAPI.invoke('dialog:saveFile', {
        defaultPath: `mediachips-clips-${Date.now()}.mp4`,
        content: '',
        filters: [{name: 'MP4', extensions: ['mp4']}],
      }) as {canceled?: boolean; filePath?: string}
      if (result?.canceled || !result?.filePath) {
        exportingClips.value = false
        return
      }
      outputPath = result.filePath
    }
  } catch (error) {
    console.warn('Save dialog unavailable, using default downloads path', error)
  }

  const controller = new AbortController()
  const taskId = tasksStore.setTask({
    title: t('markers.export_selected_clips', {count: selectedRangedIds.value.length}),
    subtitle: t('markers.export_clips_progress', {processed: 0, total: selectedRangedIds.value.length}),
    icon: 'export',
    progress: 0,
    action: () => controller.abort(),
  })

  try {
    let finalPath = outputPath || ''
    await typedApi.exportMarkClips(
      {
        markIds: selectedRangedIds.value,
        outputPath,
        sort: clipSort.value,
      },
      {signal: controller.signal},
      (event) => {
        if (event.type === 'progress') {
          const processed = Number(event.processed || 0)
          const total = Number(event.total || selectedRangedIds.value.length || 1)
          if (typeof event.outputPath === 'string') finalPath = event.outputPath
          tasksStore.updateTask(taskId, {
            subtitle: t('markers.export_clips_progress', {processed, total}),
            progress: total ? Math.min((processed / total) * 100, 100) : 0,
          })
        }
        if (event.type === 'complete') {
          if (typeof event.outputPath === 'string') finalPath = event.outputPath
          tasksStore.updateTask(taskId, {
            subtitle: finalPath,
            progress: 100,
            color: 'success',
            done: true,
            action: undefined,
          })
        }
        if (event.type === 'error') {
          throw new Error(String(event.message || 'Export failed'))
        }
      },
    )
    setNotification({
      type: 'success',
      title: t('markers.export_clips_done'),
      text: t('markers.export_clips_done_text', {path: finalPath}),
    })
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError'
    if (!isAbort) {
      tasksStore.updateTask(taskId, {
        subtitle: t('markers.export_clips_failed'),
        color: 'error',
        done: true,
        action: undefined,
      })
      setNotification({
        type: 'error',
        title: t('markers.export_clips_failed'),
        text: getErrorResponseData<{message?: string}>(error)?.message
          || (error instanceof Error ? error.message : String(error)),
      })
    } else {
      tasksStore.removeTask(taskId)
    }
  } finally {
    exportingClips.value = false
  }
}

onMounted(async () => {
  searchInput.value = marksStore.search || ''
  await marksStore.loadFilterMetas()
  await marksStore.fetchMarks()

  setTimeout(() => {
    showInfiniteLoader.value = true
  }, 500)
})
</script>

<style lang="scss" scoped>
.markers-toolbar {
  &__search {
    flex: 0 1 400px;
    max-width: 400px;
    min-width: 0;
  }

  &__sort {
    flex: 0 0 auto;
    width: min(100%, 280px);
  }
}
</style>
