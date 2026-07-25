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

      <div class="markers-toolbar d-flex align-center ga-3 mt-4">
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
        <ItemMarker :mark="mark"/>
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
import {ref, onMounted} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRouter} from 'vue-router'
import {useMarksStore} from '@/stores/marks'
import {useAppStore} from '@/stores/app'
import {getDefaultMediaTypeId} from '@/utils/mediaType'
import {MARK_SORT_PARAMS} from '@/utils/markSort'
import {scrollMainTo} from '@/utils/mainScroll'
import useMarkImageGenerator from '@/composable/GeneratingThumbsForMarks'
import ItemMarker from '@/components/items/ItemMarker.vue'
import Loading from '@/components/elements/Loading.vue'

const {t} = useI18n()
const router = useRouter()
const marksStore = useMarksStore()
const appStore = useAppStore()

useMarkImageGenerator()

const searchInput = ref('')
const showInfiniteLoader = ref(false)

function openLibrary() {
  const id = getDefaultMediaTypeId(appStore.mediaTypes)
  void router.push(id != null ? `/media?mediaTypeId=${id}` : '/media')
}

function clearMarkerFilters() {
  searchInput.value = ''
  marksStore.setSearch('')
  marksStore.setSelectedTypes([])
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

onMounted(async () => {
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
