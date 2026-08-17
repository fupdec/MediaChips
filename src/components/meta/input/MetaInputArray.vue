<template>
  <v-autocomplete
    v-bind="attrs"
    :model-value="val"
    @update:model-value="setVal"
    v-model:search="search"
    :items="listTags"
    :custom-filter="filterTagsForAutocomplete"
    item-title="name"
    item-value="id"
    ref="field"
    :rules="[rules]"
    :menu-props="resolvedMenuProps"
    :label="fieldLabel"
    :hint="meta.hint"
    :disabled="disabled"
    :hide-no-data="purpose === 'filter' ? false : !search"
    hide-selected
    multiple
    auto-select-first
    :autofocus="autofocus"
    :class="{'meta-input-array--filter': purpose === 'filter'}"
    @update:menu="onMenuUpdate"
    @keydown.enter="onEnter"
    @blur="onBlur"
  >
    <template v-slot:no-data>
      <div v-if="purpose == 'filter'" class="pa-3">{{ t('common.no_data') }}</div>
      <v-btn v-else @click="create()" color="success" block size="large" variant="flat">
        <v-icon start>mdi-tag-plus</v-icon>
        {{ t('meta.fields.create_tag', {name: search}) }}
      </v-btn>
    </template>

    <template
      v-if="purpose === 'filter' && selectedMenuTags.length"
      #prepend-item
    >
      <v-list-subheader class="meta-input-array__selected-heading">
        {{ t('common.selected') }} · {{ selectedMenuTags.length }}
      </v-list-subheader>
      <v-list-item
        v-for="tag in selectedMenuTags"
        :key="`selected-${tag.id}`"
        density="compact"
        class="list-item meta-input-array__selected-item"
        @click.stop="removeTag(tag.id)"
        @mouseover.stop="showHoverImage($event, meta.id, Number(tag.id), 'tag', {
          label: tag.name,
          imageAspectRatio: meta.imageAspectRatio,
        })"
        @mouseleave.stop="hideHoverImage"
      >
        <template #prepend>
          <v-icon
            size="16"
            color="primary"
            class="mr-1"
          >
            mdi-check
          </v-icon>
        </template>
        <v-list-item-title>
          <v-chip
            :label="meta?.chipLabel"
            :variant="chipVariant"
            :color="chipColorFor(tag)"
            :style="chipStyleFor(tag)"
            :class="chipClassFor(tag)"
            class="ma-0 filter-form-chip"
            size="x-small"
            closable
            close-icon="mdi-close"
            @click:close.stop="removeTag(tag.id)"
          >
            {{ tag.name }}
          </v-chip>
        </v-list-item-title>
      </v-list-item>
      <v-divider class="my-1"/>
    </template>

    <template v-slot:selection="{ item, index }">
      <!-- Filter: always compact chips; full selection lives in the dropdown. -->
      <template v-if="purpose === 'filter'">
        <v-chip
          v-if="index < filterCollapsedVisible"
          @click:close="removeTag(item.value)"
          @mouseover.stop="showHoverImage($event, meta.id, Number(item.value), 'tag', {
            label: selectionLabel(item),
            imageAspectRatio: meta.imageAspectRatio,
          })"
          @mouseleave.stop="hideHoverImage"
          :label="meta?.chipLabel"
          :variant="chipVariant"
          :color="item.raw ? chipColorFor(item.raw) : undefined"
          :style="item.raw ? chipStyleFor(item.raw) : undefined"
          closable
          close-icon="mdi-close"
          class="ma-0 filter-form-chip"
          :class="item.raw ? chipClassFor(item.raw) : undefined"
          size="x-small"
        >
          <span>{{ selectionLabel(item) }}</span>
        </v-chip>
        <v-chip
          v-else-if="index === filterCollapsedVisible && selectedCount > filterCollapsedVisible"
          class="ma-0 filter-form-chip filter-form-chip--more"
          size="x-small"
          variant="tonal"
          @mousedown.prevent
          @click.stop="focusField"
        >
          (+{{ selectedCount - filterCollapsedVisible }}...)
        </v-chip>
      </template>

      <template v-else>
        <v-chip
          @click:close="removeTag(item.value)"
          @mouseover.stop="showHoverImage($event, meta.id, Number(item.value), 'tag', {
            label: selectionLabel(item),
            imageAspectRatio: meta.imageAspectRatio,
          })"
          @mouseleave.stop="hideHoverImage"
          :label="meta?.chipLabel"
          :variant="chipVariant"
          :color="item.raw ? chipColorFor(item.raw) : undefined"
          :style="item.raw ? chipStyleFor(item.raw) : undefined"
          closable
          close-icon="mdi-close"
          :class="[
            purpose === 'bulk' ? 'ma-0 filter-form-chip' : 'editing-tag-chip',
            item.raw ? chipClassFor(item.raw) : undefined,
          ]"
          :size="purpose === 'bulk' ? 'x-small' : 'small'"
        >
          <span>{{ selectionLabel(item) }}</span>
        </v-chip>
      </template>
    </template>

    <template v-slot:item="{ props, item }">
      <v-list-item
        v-bind="props"
        @click="hideHoverImage"
        @mouseover.stop="showHoverImage($event, meta.id, Number(item.value), 'tag', {
          label: item.raw?.name || item.title,
          imageAspectRatio: meta.imageAspectRatio,
        })"
        @mouseleave.stop="hideHoverImage"
        class="list-item"
      >
        <!-- Убираем v-list-item-title и используем свой контент -->
        <template v-slot:title>
          <div class="d-flex align-center flex-grow-1">
            <div class="d-flex align-center meta-input-array__row-icons">
              <span v-if="meta.favorite" class="meta-input-array__heart">
                <v-icon v-if="item.raw.favorite" color="pink" size="14">
                  mdi-heart
                </v-icon>
                <v-icon v-else size="14">mdi-heart-outline</v-icon>
              </span>
              <span v-if="meta.color">
                <v-icon :color="chipColorFor(item.raw) || ''" size="14">mdi-circle</v-icon>
              </span>
            </div>
            <div class="d-flex align-baseline">
              <span v-html="search ? item.raw.name_parsed || item.raw.name : item.raw.name"/>
              <span
                v-if="meta.synonyms && item.raw.synonyms"
                v-html="search ? item.raw.synonyms_parsed || item.raw.synonyms : item.raw.synonyms"
                class="synonyms"
              />
            </div>
          </div>
        </template>
      </v-list-item>
    </template>

    <template #append-item>
      <div
        v-if="hasMore"
        v-intersect="loadMoreIntersect"
        class="d-flex justify-center pa-2"
      >
        <v-progress-circular
          v-if="loadingMore"
          indeterminate
          size="20"
          width="2"
        />
      </div>
    </template>

    <template v-if="purpose != 'filter' && purpose != 'bulk' && showIcons" v-slot:prepend>
      <v-icon>mdi-{{ meta.icon }}</v-icon>
    </template>

    <template v-if="showSortButton" #append-inner>
      <v-menu location="bottom end" :close-on-content-click="false">
        <template #activator="{ props: menuProps }">
          <v-btn
            v-bind="menuProps"
            class="meta-input-array__sort-btn"
            icon
            variant="text"
            density="compact"
            size="small"
            v-tooltip:top="t('meta.sorting.sort_tags_by')"
            @click.stop
          >
            <v-icon size="18">mdi-sort</v-icon>
          </v-btn>
        </template>

        <v-list density="compact" min-width="220">
          <v-list-subheader>{{ t('meta.sorting.sort_direction') }}</v-list-subheader>
          <v-list-item @click="changeSortDir">
            <v-list-item-title>
              <span v-if="meta?.sortDir === 'asc'">
                <v-icon start>mdi-sort-ascending</v-icon>
                {{ t('meta.sorting.ascending') }}
              </span>
              <span v-else>
                <v-icon start>mdi-sort-descending</v-icon>
                {{ t('meta.sorting.descending') }}
              </span>
            </v-list-item-title>
          </v-list-item>

          <v-list-subheader>{{ t('meta.sorting.sort_tags_by') }}</v-list-subheader>
          <v-list-item
            v-for="s in sortBy"
            :key="s.value"
            :value="s.value"
            :active="s.value == meta.sortBy"
            color="primary"
            @click="changeSortBy(s.value)"
          >
            <v-list-item-title>
              <v-icon start>mdi-{{ s.icon }}</v-icon>
              {{ s.title }}
            </v-list-item-title>
          </v-list-item>

          <v-divider class="my-1"/>
          <v-list-item
            :disabled="selectedCount < 2"
            @click="sortSelectedTags"
          >
            <v-list-item-title>
              <v-icon start>mdi-sort-alphabetical-ascending</v-icon>
              {{ t('meta.sorting.sort_selected') }}
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </template>
  </v-autocomplete>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, onUnmounted, watch, nextTick, useAttrs} from 'vue'
import {useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {useAutocompleteMenuInfiniteScroll} from '@/composable/useAutocompleteMenuInfiniteScroll'
import {useSettingsStore} from '@/stores/settings'
import {useAppStore} from '@/stores/app'
import {useNotificationsStore} from '@/stores/notifications'
import {getApiErrorMessage} from '@/types/vue'
import {useEventBus} from "@/utils/eventBus"
import {useItemsListSync} from '@/composable/itemsListSync'
import {onTagsCatalogChanged, reloadTagsCatalog} from '@/composable/appCatalogs'
import {
  foundByChars,
  getTagChipTextColor,
  highlightChars,
} from '@/services/formatUtils'
import {resolveTagAutocompleteSearchMode, matchesTagAutocomplete} from '@shared/tagAutocompleteMatch'
import {resolveTagChipColor} from '@shared/tagChipColor'
import {isNearWhiteColor} from '@/utils/headerColorUtils'
import {hideHoverImage, showHoverImage} from '@/services/hoverService'
import {debounce} from '@/utils/debounce'
import {sortTagsByCategoryPreference} from '@/utils/metaSort'
import type { ArrayMeta, TagListItem } from '@/types/metaInput'

defineOptions({inheritAttrs: false})

const attrs = useAttrs()

const props = withDefaults(defineProps<{
  metaId?: number
  purpose?: string
  modelValue?: number[] | number
  disabled?: boolean
  cond?: string | null
  menuProps?: Record<string, unknown>
  autofocus?: boolean
}>(), {
  cond: null,
  autofocus: false,
  menuProps: () => ({
    contentClass: 'custom-list ac-dropdown meta-input-array-list',
    zIndex: 2800,
  }),
})

const emit = defineEmits<{
  'update:modelValue': [value: number[]]
}>()

const settingsStore = useSettingsStore()
const appStore = useAppStore()
const notificationsStore = useNotificationsStore()
const eventBus = useEventBus()
  const listSync = useItemsListSync()
const router = useRouter()
const {t} = useI18n()

const AUTOCOMPLETE_LIMIT = 50

const meta = ref<ArrayMeta>({} as ArrayMeta)
const val = ref<number[]>([])
const listTags = ref<TagListItem[]>([])
const search = ref('')
const field = ref<unknown>(null)
/** How many tag chips stay visible in filter cards before (+n...). */
const filterCollapsedVisible = 2
const currentPage = ref(1)
const hasMore = ref(false)
const loadingMore = ref(false)
const sentinelIntersecting = ref(false)
let fetchRequestId = 0

const {
  menuProps: infiniteMenuProps,
  intersectOptions: menuIntersectOptions,
  onMenuUpdate,
  maybeFillMenu,
} = useAutocompleteMenuInfiniteScroll({
  canLoadMore: () => hasMore.value,
  isLoading: () => loadingMore.value,
  loadMore: () => loadMoreTags(),
  baseContentClass: computed(() => {
    const fromProps = props.menuProps?.contentClass
    return typeof fromProps === 'string' ? fromProps : 'custom-list ac-dropdown'
  }),
})

const resolvedMenuProps = computed(() => ({
  ...props.menuProps,
  ...infiniteMenuProps.value,
  maxHeight: (
    typeof props.menuProps?.maxHeight === 'string'
    || typeof props.menuProps?.maxHeight === 'number'
  )
    ? props.menuProps.maxHeight
    : infiniteMenuProps.value.maxHeight,
}))

const loadMoreIntersect = computed(() => ({
  handler: onLoadMoreIntersect,
  options: menuIntersectOptions.value,
}))

const sortBy = computed(() => [
  {
    title: t("meta.sorting.name"),
    icon: "alphabetical-variant",
    value: "name",
  },
  {
    title: t("meta.sorting.favorite"),
    icon: "heart",
    value: "favorite",
  },
  {
    title: t("meta.sorting.assignments"),
    icon: "link-variant",
    value: "mediaCount",
  },
  {
    title: t("meta.sorting.video_count"),
    icon: "video-outline",
    value: "videoCount",
  },
  {
    title: t("meta.sorting.image_count"),
    icon: "image-outline",
    value: "imageCount",
  },
  {
    title: t("meta.sorting.tag_count"),
    icon: "tag-multiple-outline",
    value: "tagCount",
  },
  {
    title: t("meta.sorting.date_added"),
    icon: "calendar",
    value: "createdAt",
  },
  {
    title: t("meta.sorting.date_updated"),
    icon: "calendar-edit",
    value: "updatedAt",
  },
])

// Computed properties
const showIcons = computed(() =>
  settingsStore.showIconsOfMetaInEditingDialog === '1'
)

const fieldLabel = computed(() => {
  if (typeof attrs.label === 'string') return attrs.label
  return meta.value?.name ?? ''
})

const showSortButton = computed(() =>
  props.purpose !== 'filter' && props.purpose !== 'bulk',
)

const selectedCount = computed(() => normalizeIds(val.value).length)

const selectedMenuTags = computed((): TagListItem[] => {
  if (props.purpose !== 'filter') return []
  return normalizeIds(val.value).map((id) => {
    const fromList = listTags.value.find((tag) => Number(tag.id) === Number(id))
    if (fromList) return fromList
    return {
      id,
      name: findTagName(id),
    } as TagListItem
  })
})

const chipVariant = computed(() =>
  (meta.value?.chipVariant || 'flat') as 'text' | 'flat' | 'elevated' | 'outlined' | 'plain' | 'tonal'
)

const chipColorFor = (tag?: TagListItem | null) => {
  if (!tag) return undefined
  return resolveTagChipColor(meta.value?.color, tag.color)
}

const chipTextColorFor = (tag?: TagListItem | null) => {
  const color = chipColorFor(tag)
  if (!color) return ''
  return getTagChipTextColor(color, chipVariant.value) || ''
}

const chipStyleFor = (tag?: TagListItem | null) => {
  const textColor = chipTextColorFor(tag)
  return textColor ? {color: textColor} : undefined
}

const chipClassFor = (tag?: TagListItem | null) => {
  const color = chipColorFor(tag)
  if (!color) return undefined
  return [
    'tag-chip--colored',
    isNearWhiteColor(color) ? 'tag-chip--light' : undefined,
  ].filter(Boolean).join(' ')
}

interface TagFilterItem {
  raw: TagListItem
  value: number | string
}

const applyTagHighlight = (tagObj: TagFilterItem, queryText: string) => {
  const tag = {...tagObj.raw}
  const query = queryText.toLowerCase()
  const is_default = settingsStore.typingFiltersDefault == "1"

  const is_name_found = is_default
    ? tag.name.toLowerCase().indexOf(query) > -1
    : foundByChars(tag.name, query)

  if (is_name_found) {
    tagObj.raw.name_parsed = highlightChars(tag.name, queryText, is_default)
    tagObj.raw.synonyms_parsed = tagObj.raw.synonyms
    return
  }

  if (!tag.synonyms) {
    tagObj.raw.name_parsed = tag.name
    tagObj.raw.synonyms_parsed = tag.synonyms
    return
  }

  const synonyms = tag.synonyms.split(',').map((i: string) => i.trim())
  const synonyms_parsed: string[] = []

  for (const i of synonyms) {
    const synonymMatch = is_default
      ? i.toLowerCase().indexOf(query) > -1
      : foundByChars(i, query)

    synonyms_parsed.push(
      synonymMatch ? highlightChars(i, queryText, is_default) : i,
    )
  }

  tagObj.raw.name_parsed = tag.name
  tagObj.raw.synonyms_parsed = synonyms_parsed.join(', ')
}

/** Keep typing-filter semantics even if selected tags were merged into the list. */
const filterTagsForAutocomplete = (
  _value: string,
  query: string,
  item?: TagFilterItem,
) => {
  if (!query || !item?.raw) return true
  const mode = resolveTagAutocompleteSearchMode(settingsStore.typingFiltersDefault)
  if (!matchesTagAutocomplete(item.raw, query, mode)) return false
  applyTagHighlight(item, query)
  return true
}

const normalizeIds = (value: unknown): number[] => {
  if (value == null) return []
  const items = Array.isArray(value) ? value : [value]

  return items
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id))
}

const sameIds = (left: unknown, right: unknown) => {
  const a = normalizeIds(left)
  const b = normalizeIds(right)
  if (a.length !== b.length) return false
  return a.every((id, index) => id === b[index])
}

const findTagName = (tagId: number | string) => {
  const tag = listTags.value.find((t) => String(t.id) === String(tagId))
  if (tag?.name) return tag.name

  const storeTag = appStore.getTagById(Number(tagId))
  return storeTag?.name ?? String(tagId)
}

const selectionLabel = (item: {raw?: TagListItem | null; title?: string; value?: number | string}) => {
  const fromRaw = item.raw?.name
  if (fromRaw) return fromRaw
  const fromTitle = item.title
  if (fromTitle && !/^\d+$/.test(String(fromTitle))) return String(fromTitle)
  return findTagName(item.value ?? '')
}

const mergeTagLists = (...lists: TagListItem[][]) => {
  const byId = new Map<number, TagListItem>()
  for (const list of lists) {
    for (const tag of list) {
      byId.set(Number(tag.id), tag)
    }
  }
  return [...byId.values()]
}

const hydrateSelectedTags = async (ids: number[]) => {
  if (!props.metaId || !ids.length) return

  const missing = ids.filter((id) =>
    !listTags.value.some((tag) => Number(tag.id) === id),
  )
  if (!missing.length) return

  const fromStore = missing
    .map((id) => {
      const storeTag = appStore.getTagById(id) as TagListItem | undefined
      if (!storeTag?.name) return null
      return {
        id,
        name: storeTag.name,
        favorite: Number(storeTag.favorite) || 0,
        color: storeTag.color,
        synonyms: storeTag.synonyms,
        createdAt: storeTag.createdAt,
        updatedAt: storeTag.updatedAt,
      } as TagListItem
    })
    .filter((tag): tag is TagListItem => tag != null)

  if (fromStore.length) {
    listTags.value = mergeTagLists(listTags.value, fromStore)
  }

  const stillMissing = missing.filter((id) =>
    !listTags.value.some((tag) => Number(tag.id) === id),
  )
  if (!stillMissing.length) return

  try {
    const selectedRes = await typedApi.postTagItems({
      metaId: props.metaId,
      ids: stillMissing,
      filters: [],
      skipTotals: true,
    })
    const items = (selectedRes.data.items ?? []) as TagListItem[]
    if (items.length) {
      listTags.value = mergeTagLists(listTags.value, items)
    }
  } catch (error) {
    console.error(error)
  }
}

const getTags = async (
  searchQuery = search.value,
  options: {append?: boolean} = {},
) => {
  const append = Boolean(options.append)

  if (!props.metaId) {
    listTags.value = []
    currentPage.value = 1
    hasMore.value = false
    loadingMore.value = false
    return
  }

  if (append) {
    if (!hasMore.value || loadingMore.value) return
    loadingMore.value = true
  }

  const requestId = append ? fetchRequestId : ++fetchRequestId
  const selectedIds = normalizeIds(val.value)
  const trimmedSearch = String(searchQuery || '').trim()
  const searchMode = resolveTagAutocompleteSearchMode(settingsStore.typingFiltersDefault)
  const page = append ? currentPage.value + 1 : 1

  try {
    const mainPromise = typedApi.postTagItems({
      metaId: props.metaId,
      filters: [],
      sortBy: meta.value?.sortBy || 'name',
      direction: meta.value?.sortDir || 'asc',
      search: trimmedSearch || undefined,
      searchMode: trimmedSearch ? searchMode : undefined,
      page,
      limit: AUTOCOMPLETE_LIMIT,
      skipTotals: true,
    })

    const selectedPromise = (!append && selectedIds.length)
      ? typedApi.postTagItems({
          metaId: props.metaId,
          ids: selectedIds,
          filters: [],
          skipTotals: true,
        })
      : Promise.resolve({data: {items: [] as TagListItem[]}})

    const [mainRes, selectedRes] = await Promise.all([mainPromise, selectedPromise])
    if (requestId !== fetchRequestId) return

    const mainItems = (mainRes.data.items ?? []) as TagListItem[]
    hasMore.value = mainItems.length >= AUTOCOMPLETE_LIMIT
    currentPage.value = page

    if (append) {
      const beforeCount = listTags.value.length
      listTags.value = mergeTagLists(listTags.value, mainItems)
      if (listTags.value.length === beforeCount) {
        hasMore.value = false
      }
    } else {
      listTags.value = mergeTagLists(
        (selectedRes.data.items ?? []) as TagListItem[],
        mainItems,
      )
      await nextTick()
      void maybeFillMenu()
    }
  } catch (e) {
    if (requestId !== fetchRequestId) return
    if (!append) {
      listTags.value = []
      currentPage.value = 1
      hasMore.value = false
    }
    console.error(e)
  } finally {
    if (append) loadingMore.value = false
  }
}

const loadMoreTags = async () => {
  if (!hasMore.value || loadingMore.value) return
  await getTags(search.value, {append: true})
  await nextTick()
  if (hasMore.value && sentinelIntersecting.value) {
    await loadMoreTags()
  }
}

const onLoadMoreIntersect = (isIntersecting: boolean) => {
  sentinelIntersecting.value = isIntersecting
  if (isIntersecting) void loadMoreTags()
}

const refreshTagsFromEvent = async () => {
  await getTags(search.value)
}

const runGetTags = debounce((query: string) => {
  void getTags(query)
}, 200)

const changeSortDir = async () => {
  const sortDir = meta.value.sortDir === 'asc' ? 'desc' : 'asc'

  try {
    await typedApi.updateMeta(meta.value.id, {
      sortDir: sortDir,
    })
    await getMeta()
    listTags.value = sortTags(listTags.value)
    await getTags(search.value)
  } catch (error) {
    console.error(error)
  }
}

const changeSortBy = async (param: string) => {
  try {
    await typedApi.updateMeta(meta.value.id, {
      sortBy: param,
    })
    await getMeta()
    listTags.value = sortTags(listTags.value)
    await getTags(search.value)
  } catch (error) {
    console.error(error)
  }
}

const sortTags = (tags: TagListItem[]) => {
  return sortTagsByCategoryPreference(
    tags,
    meta.value?.sortBy || 'createdAt',
    meta.value?.sortDir || 'asc',
  )
}

const resolveSelectedTag = (tagId: number): TagListItem => {
  const fromList = listTags.value.find((tag) => Number(tag.id) === tagId)
  if (fromList) return fromList

  const storeTag = appStore.getTagById(tagId)
  if (storeTag) {
    return {
      id: tagId,
      name: storeTag.name || String(tagId),
      favorite: Number(storeTag.favorite) || 0,
      color: storeTag.color,
      synonyms: storeTag.synonyms,
      createdAt: storeTag.createdAt,
      updatedAt: storeTag.updatedAt,
    } as TagListItem
  }

  return {
    id: tagId,
    name: String(tagId),
    favorite: 0,
  } as TagListItem
}

const sortSelectedTags = () => {
  const ids = normalizeIds(val.value)
  if (ids.length < 2) return

  const sorted = sortTags(ids.map((id) => resolveSelectedTag(id)))
  setVal(sorted.map((tag) => Number(tag.id)))
}

const create = async () => {
  if (!search.value) return

  const searchText = search.value.trim()
  if (!searchText) return

  const isExists = listTags.value.findIndex(
    i => i.name.toLowerCase() === searchText.toLowerCase()
  ) > -1

  if (isExists) return

  const existingGlobal = (appStore.tags || []).find(
    (tag) => String(tag.name || '').trim().toLowerCase() === searchText.toLowerCase(),
  )
  if (existingGlobal) {
    notificationsStore.setNotification({
      type: 'warning',
      title: t('meta.dialogs.adding_tags_complete'),
      text: t('notifications_text.duplicates_list', {items: searchText}),
    })
    return
  }

  try {
    const res = await typedApi.createTags([{
      name: searchText,
      metaId: props.metaId,
    }])

    search.value = ''
    let newVal = [res.data[0].id]

    if (Array.isArray(val.value)) {
      newVal = [...normalizeIds(val.value), ...newVal]
    }

    setVal(newVal)
    await getTags('')

    void reloadTagsCatalog()

    const routeMetaId = router.currentRoute.value.query.metaId
    if (routeMetaId != null && +routeMetaId === props.metaId) {
      const data = {
        ids: [],
        type: 'tag',
      }

      if (router.currentRoute.value.query.player) {
        window.electronAPI?.send?.("getItemsFromDb", data)
      } else {
        listSync.getItemsFromDb(data)
      }
    }
  } catch (e) {
    console.error(e)
    notificationsStore.setNotification({
      type: 'error',
      title: t('meta.dialogs.adding_tags_complete'),
      text: getApiErrorMessage(e, t('notifications_text.server_error_logs')),
    })
  }
}

const onEnter = (event: KeyboardEvent) => {
  const searchText = search.value?.trim()
  if (!searchText) return

  const lower = searchText.toLowerCase()
  const exact = listTags.value.find((tag) => tag.name.toLowerCase() === lower)
  const mode = resolveTagAutocompleteSearchMode(settingsStore.typingFiltersDefault)
  const match = exact ?? listTags.value.find((tag) =>
    matchesTagAutocomplete(tag, searchText, mode),
  )

  if (match?.id != null) {
    event.preventDefault()
    const next = [...normalizeIds(val.value), Number(match.id)]
    setVal(next)
    search.value = ''
    return
  }

  event.preventDefault()
  create()
}
const setVal = (newVal: unknown, options: {allowClear?: boolean} = {}) => {
  const normalized = [...new Set(normalizeIds(newVal))]
  const previous = normalizeIds(val.value)

  // Block spurious empty updates from autocomplete blur/search reset, but allow
  // intentional clears (e.g. removing the last chip via the close button).
  if (!normalized.length && previous.length && !options.allowClear) {
    const tagsStillExist = previous.every((id) =>
      listTags.value.some((tag) => Number(tag.id) === id)
    )
    if (tagsStillExist) {
      nextTick(() => {
        search.value = ''
      })
      return
    }
  }

  if (sameIds(normalized, previous)) {
    nextTick(() => {
      search.value = ''
    })
    return
  }

  val.value = normalized
  emit('update:modelValue', normalized)

  nextTick(() => {
    search.value = ''
  })
}

const onBlur = () => {
  nextTick(() => {
    search.value = ''
  })
}

const removeTag = (tagId: number | string) => {
  if (Array.isArray(val.value)) {
    const newVal = normalizeIds(val.value).filter((id) => String(id) !== String(tagId))
    setVal(newVal, {allowClear: true})
  } else if (String(val.value) === String(tagId)) {
    setVal([], {allowClear: true})
  }
  hideHoverImage()
}

const rules = () => {
  if (props.purpose !== "filter") return true
  if (val.value !== null && val.value.length > 0) return true
  else if (props.cond === "is null" || props.cond === "null") return true
  else return t("validation.value_required")
}

const getMeta = async () => {
  try {
    if (!props.metaId) return
    const res = await typedApi.getMetaById(props.metaId)
    meta.value = res.data
  } catch (e) {
    console.error(e)
  }
}

const focusField = async () => {
  await nextTick()
  const input = field.value as {
    focus?: () => void
    $el?: HTMLElement
  } | null
  if (input?.focus) {
    input.focus()
    return
  }
  const el = input?.$el?.querySelector?.('input') as HTMLInputElement | null | undefined
  el?.focus?.()
}

// Lifecycle hooks
let unsubscribeTagsCatalog: (() => void) | null = null

onMounted(async () => {
  await getMeta()

  val.value = normalizeIds(props.modelValue)
  await getTags('')
  unsubscribeTagsCatalog = onTagsCatalogChanged(() => {
    void refreshTagsFromEvent()
  })

  if (props.autofocus) {
    // Wait for parent menu/dialog transition so focus sticks.
    window.setTimeout(() => {
      void focusField()
    }, 50)
  }
})

onUnmounted(() => {
  runGetTags.cancel()
  unsubscribeTagsCatalog?.()
  unsubscribeTagsCatalog = null
})

defineExpose({focus: focusField})

// Watchers
watch(() => props.modelValue, (newVal: number[] | number | undefined) => {
  const next = normalizeIds(newVal)
  val.value = next
  void hydrateSelectedTags(next)
})

watch(() => props.metaId, async (metaId) => {
  if (!metaId) return
  await getMeta()
  await getTags(search.value)
})

watch(search, (query) => {
  runGetTags(query)
})
</script>

<style scoped>
.list-item {
  display: flex;
  align-items: center;
  width: 100%;
}

.meta-input-array__row-icons {
  gap: 2px;
  margin-right: 14px;
}

.meta-input-array__heart {
  margin-right: 6px;
}

:deep(.meta-input-array-list .list-item) {
  padding: 0 4px !important;
}

:deep(.meta-input-array-list .v-list-item) {
  min-height: 12px !important;
  font-size: 0.24em !important;
}

:deep(.meta-input-array-list .v-list-item__spacer) {
  width: 4px !important;
}

.meta-input-array__sort-btn {
  margin-inline-end: 2px;
}

.synonyms {
  font-size: 0.85em;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.filter-form-chip {
  :deep(.v-chip__close) {
    width: 12px !important;
    height: 12px !important;
    min-width: 12px !important;
    margin-inline: 0 2px !important;
    padding: 0 !important;
    color: currentColor !important;
    opacity: 1 !important;

    .v-icon {
      font-size: 10px !important;
      width: 10px !important;
      height: 10px !important;
      color: currentColor !important;
    }
  }

  &--more {
    flex: 0 0 auto;
    cursor: pointer;
    font-variant-numeric: tabular-nums;
  }
}

.meta-input-array--filter {
  :deep(.v-field__input) {
    flex-wrap: nowrap !important;
    overflow: hidden !important;
    align-content: center !important;
    align-items: center !important;
    max-height: 28px !important;
    min-height: 28px !important;
  }

  :deep(.v-autocomplete__selection) {
    margin-inline-end: 2px !important;
    max-width: min(42%, 110px);
    min-width: 0;
  }

  :deep(.v-field__input input) {
    min-width: 40px !important;
    flex: 1 1 40px;
  }
}

.meta-input-array__selected-heading {
  font-size: 0.7rem;
  opacity: 0.7;
}

.meta-input-array__selected-item {
  min-height: 32px !important;
}
</style>