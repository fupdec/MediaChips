<template>
  <v-autocomplete
    v-bind="attrs"
    :model-value="val"
    @update:model-value="setVal"
    v-model:search="search"
    :items="dropdownItems"
    :custom-filter="() => true"
    item-title="title"
    item-value="key"
    ref="field"
    :label="label === undefined ? t('meta.fields.mixed_tags_label') : label"
    :placeholder="placeholder === undefined ? t('meta.fields.mixed_tags_placeholder') : placeholder"
    :disabled="disabled"
    :hide-no-data="!search.trim()"
    hide-selected
    multiple
    no-filter
    auto-select-first
    :menu-props="resolvedMenuProps"
    @update:menu="onMenuUpdate"
    @keydown.enter="onEnter"
    @blur="onBlur"
  >
    <template #no-data>
      <div
        v-if="search.trim() && createTargets.length"
        class="pa-2 d-flex flex-column ga-1"
      >
        <v-btn
          v-for="target in createTargets"
          :key="target.metaId"
          @click="create(search, target.metaId)"
          :color="target.isDefault ? 'success' : undefined"
          :variant="target.isDefault ? 'flat' : 'tonal'"
          block
          size="large"
        >
          <v-icon start>mdi-{{ target.icon }}</v-icon>
          <span class="text-truncate">
            {{
              t('meta.fields.create_tag_in', {
                name: search.trim(),
                category: target.name,
              })
            }}
          </span>
          <v-chip
            v-if="target.isDefault"
            class="ml-2"
            size="x-small"
            variant="flat"
            color="white"
          >
            {{ t('meta.fields.create_tag_default') }}
          </v-chip>
        </v-btn>
      </div>
      <div
        v-else
        class="pa-3 text-medium-emphasis"
      >
        {{ t('common.no_data') }}
      </div>
    </template>

    <template #selection="{ item }">
      <v-chip
        v-if="item.raw?.kind === 'tag'"
        @click:close="removeKey(item.value)"
        @mouseover.stop="showHoverFor(item.raw, $event)"
        @mouseleave.stop="hideHoverImage"
        :label="metaById(item.raw.metaId)?.chipLabel"
        :variant="chipVariantFor(item.raw.metaId)"
        :color="chipColorFor(item.raw)"
        :style="chipStyleFor(item.raw)"
        :prepend-icon="`mdi-${item.raw.metaIcon}`"
        :title="item.raw.metaName"
        closable
        :class="['editing-tag-chip', chipClassFor(item.raw)]"
        size="small"
      >
        <span>{{ item.raw.name }}</span>
      </v-chip>
      <v-chip
        v-else
        @click:close="removeKey(item.value)"
        class="editing-tag-chip"
        closable
        size="small"
      >
        {{ findKeyLabel(item.value) }}
      </v-chip>
    </template>

    <template #item="{ props: itemProps, item }">
      <div
        v-if="item.raw.kind === 'header'"
        class="mixed-tags__category"
      >
        <v-icon
          size="18"
          class="mixed-tags__category-icon"
        >
          mdi-{{ item.raw.icon || 'tag-multiple-outline' }}
        </v-icon>
        <span class="mixed-tags__category-title">{{ item.raw.title }}</span>
        <v-chip
          size="x-small"
          variant="flat"
          color="primary"
          class="mixed-tags__category-count"
        >
          {{ item.raw.count }}{{ item.raw.hasMore ? '+' : '' }}
        </v-chip>
      </div>
      <v-list-item
        v-else-if="item.raw.kind === 'load-more'"
        v-intersect="{
          handler: (isIntersecting: boolean) => {
            if (item.raw.kind !== 'load-more') return
            onLoadMoreRowIntersect(isIntersecting, item.raw.metaId)
          },
          options: menuIntersectOptions,
        }"
        density="compact"
        class="mixed-tags__load-more-item"
        :disabled="Boolean(metaLoading[item.raw.metaId])"
        @mousedown.prevent
        @click.stop="loadMoreMeta(item.raw.metaId)"
      >
        <template #title>
          <div class="d-flex align-center justify-center ga-2 py-1">
            <v-progress-circular
              v-if="metaLoading[item.raw.metaId]"
              indeterminate
              size="16"
              width="2"
            />
            <v-icon
              v-else
              size="16"
            >
              mdi-chevron-down
            </v-icon>
            <span>{{ t('meta.fields.mixed_tags_show_more') }}</span>
          </div>
        </template>
      </v-list-item>
      <v-list-item
        v-else
        v-bind="itemProps"
        @click="hideHoverImage"
        @mouseover.stop="showHoverFor(item.raw, $event)"
        @mouseleave.stop="hideHoverImage"
        density="compact"
        class="list-item"
        :class="{'mixed-tags__tag--zebra': item.raw.zebra}"
      >
        <template #title>
          <div class="d-flex align-center flex-grow-1">
            <v-icon
              size="14"
              class="mr-2 text-medium-emphasis"
            >
              mdi-{{ item.raw.metaIcon }}
            </v-icon>
            <v-icon
              v-if="item.raw.favorite"
              color="pink"
              size="14"
              class="mr-1"
            >
              mdi-heart
            </v-icon>
            <span
              v-if="metaById(item.raw.metaId)?.color"
              class="mr-1 d-inline-flex"
            >
              <v-icon
                :color="chipColorFor(item.raw) || ''"
                size="12"
              >
                mdi-circle
              </v-icon>
            </span>
            <div class="d-flex align-baseline min-width-0">
              <span v-html="search ? item.raw.name_parsed || item.raw.name : item.raw.name"/>
              <span
                v-if="item.raw.synonyms"
                v-html="search ? item.raw.synonyms_parsed || item.raw.synonyms : item.raw.synonyms"
                class="synonyms"
              />
            </div>
          </div>
        </template>
      </v-list-item>
    </template>
  </v-autocomplete>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, onUnmounted, watch, nextTick, useAttrs} from 'vue'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {useSettingsStore} from '@/stores/settings'
import {useAppStore} from '@/stores/app'
import {onTagsCatalogChanged, reloadTagsCatalog} from '@/composable/appCatalogs'
import {useAutocompleteMenuInfiniteScroll} from '@/composable/useAutocompleteMenuInfiniteScroll'
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
import {getDefaultTagCategoryId} from '@/services/ensureStarterMeta'
import {useNotificationsStore} from '@/stores/notifications'
import {getApiErrorMessage} from '@/types/vue'
import type {ArrayMeta, TagListItem} from '@/types/metaInput'

export type MixedTagKey = string

type TagOption = {
  kind: 'tag'
  key: string
  title: string
  name: string
  tagId: number
  metaId: number
  metaName: string
  metaIcon: string
  synonyms?: string
  color?: string | null
  favorite?: boolean
  name_parsed?: string
  synonyms_parsed?: string
  zebra: boolean
}

type HeaderOption = {
  kind: 'header'
  key: string
  title: string
  icon?: string | null
  count: number
  hasMore: boolean
  disabled: true
}

type LoadMoreOption = {
  kind: 'load-more'
  key: string
  title: string
  metaId: number
  disabled: true
}

type AutocompleteItem = TagOption | HeaderOption | LoadMoreOption

const attrs = useAttrs()

const props = withDefaults(defineProps<{
  metaIds?: number[]
  modelValue?: MixedTagKey[]
  disabled?: boolean
  label?: string
  placeholder?: string
  /** Keep only one tag (marks dialog). */
  single?: boolean
  menuProps?: Record<string, unknown>
}>(), {
  metaIds: () => [],
  modelValue: () => [],
  single: false,
  menuProps: () => ({
    contentClass: 'custom-list mixed-tags-dropdown',
    maxHeight: 360,
    zIndex: 2800,
  }),
})

const emit = defineEmits<{
  'update:modelValue': [value: MixedTagKey[]]
}>()

const settingsStore = useSettingsStore()
const appStore = useAppStore()
const notificationsStore = useNotificationsStore()
const {t} = useI18n()

const AUTOCOMPLETE_LIMIT = 50

const val = ref<MixedTagKey[]>([])
const search = ref('')
const field = ref<unknown>(null)
const tagOptions = ref<TagOption[]>([])
const metaPage = ref<Record<number, number>>({})
const metaHasMore = ref<Record<number, boolean>>({})
const metaLoading = ref<Record<number, boolean>>({})
let fetchRequestId = 0

async function loadMoreNextCategory() {
  for (const id of normalizedMetaIds.value) {
    if (!metaHasMore.value[id] || metaLoading.value[id]) continue
    await loadMoreMeta(id)
    return
  }
}

const {
  menuProps: infiniteMenuProps,
  intersectOptions: menuIntersectOptions,
  onMenuUpdate,
  maybeFillMenu,
} = useAutocompleteMenuInfiniteScroll({
  canLoadMore: () => Object.values(metaHasMore.value).some(Boolean),
  isLoading: () => Object.values(metaLoading.value).some(Boolean),
  loadMore: () => loadMoreNextCategory(),
  baseContentClass: computed(() => {
    const fromProps = props.menuProps?.contentClass
    return typeof fromProps === 'string' ? fromProps : 'custom-list mixed-tags-dropdown'
  }),
  maxHeight: 360,
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

function onLoadMoreRowIntersect(isIntersecting: boolean, metaId: number) {
  if (isIntersecting) void loadMoreMeta(metaId)
}

function makeKey(metaId: number, tagId: number): MixedTagKey {
  return `${metaId}:${tagId}`
}

function parseKey(key: string): {metaId: number; tagId: number} | null {
  const [metaPart, tagPart] = String(key).split(':')
  const metaId = Number(metaPart)
  const tagId = Number(tagPart)
  if (!metaId || !tagId) return null
  return {metaId, tagId}
}

function metaIconName(icon: unknown): string {
  const value = String(icon || '').replace(/^mdi-/, '').trim()
  return value || 'tag-multiple-outline'
}

const normalizedMetaIds = computed(() =>
  [...new Set(
    (props.metaIds || [])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0),
  )],
)

const metas = computed((): ArrayMeta[] =>
  normalizedMetaIds.value
    .map((id) => appStore.getMetaById(id) as ArrayMeta | undefined)
    .filter((meta): meta is ArrayMeta => Boolean(meta)),
)

function metaById(metaId: number): ArrayMeta | undefined {
  return metas.value.find((meta) => Number(meta.id) === metaId)
    || (appStore.getMetaById(metaId) as ArrayMeta | undefined)
}

function normalizeName(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

const defaultMetaId = computed(() => {
  const ids = normalizedMetaIds.value
  if (!ids.length) return null
  const preferred = getDefaultTagCategoryId(appStore.meta, settingsStore.defaultTagCategoryId)
  if (preferred != null && ids.includes(preferred)) return preferred
  return ids[0]
})

const createTargets = computed(() => {
  const defaultId = defaultMetaId.value
  return metas.value
    .filter((meta) => meta.id != null)
    .map((meta) => {
      const metaId = Number(meta.id)
      return {
        metaId,
        name: String(meta.name || metaId),
        icon: metaIconName(meta.icon),
        isDefault: metaId === defaultId,
      }
    })
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
})

const tagByKey = computed(() => {
  const map = new Map<string, TagOption>()
  for (const option of tagOptions.value) map.set(option.key, option)
  return map
})

const dropdownItems = computed((): AutocompleteItem[] => {
  const selected = new Set(val.value)
  const items: AutocompleteItem[] = []
  let tagIndex = 0

  for (const meta of metas.value) {
    const metaId = Number(meta.id)
    const tags = tagOptions.value
      .filter((option) => {
        if (option.metaId !== metaId) return false
        return !selected.has(option.key)
      })
      .sort(compareTagOptions)
    const categoryHasMore = Boolean(metaHasMore.value[metaId])
    if (!tags.length && !categoryHasMore) continue

    items.push({
      kind: 'header',
      key: `header:${metaId}`,
      title: String(meta.name || metaId),
      icon: metaIconName(meta.icon),
      count: tags.length,
      hasMore: categoryHasMore,
      disabled: true,
    })
    for (const tag of tags) {
      items.push({
        ...tag,
        zebra: tagIndex % 2 === 1,
      })
      tagIndex += 1
    }
    if (categoryHasMore) {
      items.push({
        kind: 'load-more',
        key: `load-more:${metaId}`,
        title: t('meta.fields.mixed_tags_show_more'),
        metaId,
        disabled: true,
      })
    }
  }

  return items
})

function chipVariantFor(metaId: number) {
  const meta = metaById(metaId)
  return (meta?.chipVariant || 'flat') as 'text' | 'flat' | 'elevated' | 'outlined' | 'plain' | 'tonal'
}

function chipColorFor(tag?: TagOption | null) {
  if (!tag) return undefined
  const meta = metaById(tag.metaId)
  return resolveTagChipColor(meta?.color, tag.color)
}

function chipTextColorFor(tag?: TagOption | null) {
  if (!tag) return ''
  const color = chipColorFor(tag)
  if (!color) return ''
  return getTagChipTextColor(color, chipVariantFor(tag.metaId)) || ''
}

function chipStyleFor(tag?: TagOption | null) {
  const textColor = chipTextColorFor(tag)
  return textColor ? {color: textColor} : undefined
}

function chipClassFor(tag?: TagOption | null) {
  const color = chipColorFor(tag)
  if (!color) return undefined
  return [
    'tag-chip--colored',
    isNearWhiteColor(color) ? 'tag-chip--light' : undefined,
  ].filter(Boolean).join(' ')
}

function findKeyLabel(key: string) {
  const option = tagByKey.value.get(key)
  if (option?.name) return option.name
  const parsed = parseKey(key)
  if (!parsed) return key
  const storeTag = appStore.getTagById(parsed.tagId)
  return storeTag?.name ?? key
}

function showHoverFor(tag: TagOption, event: MouseEvent) {
  const meta = metaById(tag.metaId)
  showHoverImage(event, tag.metaId, tag.tagId, 'tag', {
    label: tag.name,
    imageAspectRatio: meta?.imageAspectRatio,
  })
}

function normalizeKeys(value: unknown): MixedTagKey[] {
  if (value == null) return []
  const items = Array.isArray(value) ? value : [value]
  const keys: MixedTagKey[] = []
  for (const item of items) {
    const key = String(item)
    if (!parseKey(key)) continue
    if (!keys.includes(key)) keys.push(key)
  }
  return keys
}

function sameKeys(left: unknown, right: unknown) {
  const a = normalizeKeys(left)
  const b = normalizeKeys(right)
  if (a.length !== b.length) return false
  return a.every((key, index) => key === b[index])
}

function applyHighlight(tag: TagOption, queryText: string) {
  const query = queryText.toLowerCase()
  const isDefault = settingsStore.typingFiltersDefault === '1'

  const nameFound = isDefault
    ? tag.name.toLowerCase().includes(query)
    : foundByChars(tag.name, query)

  if (nameFound) {
    tag.name_parsed = highlightChars(tag.name, queryText, isDefault)
    tag.synonyms_parsed = tag.synonyms
    return
  }

  if (!tag.synonyms) {
    tag.name_parsed = tag.name
    tag.synonyms_parsed = tag.synonyms
    return
  }

  const synonyms = tag.synonyms.split(',').map((i) => i.trim())
  const synonymsParsed: string[] = []
  for (const synonym of synonyms) {
    const match = isDefault
      ? synonym.toLowerCase().includes(query)
      : foundByChars(synonym, query)
    synonymsParsed.push(match ? highlightChars(synonym, queryText, isDefault) : synonym)
  }
  tag.name_parsed = tag.name
  tag.synonyms_parsed = synonymsParsed.join(', ')
}

function isFavoriteTag(tag: {favorite?: unknown} | null | undefined): boolean {
  const value = tag?.favorite
  return value === true || value === 1 || value === '1'
}

function compareTagOptions(a: TagOption, b: TagOption): number {
  const favA = a.favorite ? 1 : 0
  const favB = b.favorite ? 1 : 0
  if (favA !== favB) return favB - favA
  return a.name.localeCompare(b.name, undefined, {sensitivity: 'base'})
}

function toTagOption(tag: TagListItem, metaId: number): TagOption | null {
  const tagId = Number(tag.id)
  if (!tagId) return null
  const meta = metaById(metaId)
  const metaName = String(meta?.name || metaId)
  const storeTag = appStore.getTagById(tagId) as TagListItem | undefined
  const option: TagOption = {
    kind: 'tag',
    key: makeKey(metaId, tagId),
    title: `${metaName}: ${tag.name}`,
    name: String(tag.name || tagId),
    tagId,
    metaId,
    metaName,
    metaIcon: metaIconName(meta?.icon),
    synonyms: tag.synonyms,
    color: tag.color ?? null,
    favorite: isFavoriteTag(tag) || isFavoriteTag(storeTag),
    zebra: false,
  }
  if (search.value.trim()) applyHighlight(option, search.value.trim())
  return option
}

function mergeOptions(...lists: TagOption[][]) {
  const byKey = new Map<string, TagOption>()
  for (const list of lists) {
    for (const option of list) byKey.set(option.key, option)
  }
  return [...byKey.values()]
}

async function getTags(searchQuery = search.value) {
  const metaIds = normalizedMetaIds.value

  if (!metaIds.length) {
    tagOptions.value = []
    metaPage.value = {}
    metaHasMore.value = {}
    metaLoading.value = {}
    return
  }

  const requestId = ++fetchRequestId
  const trimmedSearch = String(searchQuery || '').trim()
  const searchMode = resolveTagAutocompleteSearchMode(settingsStore.typingFiltersDefault)
  const selectedParsed = normalizeKeys(val.value)
    .map(parseKey)
    .filter((entry): entry is {metaId: number; tagId: number} => Boolean(entry))

  metaPage.value = {}
  metaHasMore.value = {}

  try {
    const mainPromises = metaIds.map((metaId) =>
      typedApi.postTagItems({
        metaId,
        filters: [],
        // Favorites first across pages, then name within the same favorite flag.
        sortBy: 'favorite',
        direction: 'desc',
        search: trimmedSearch || undefined,
        searchMode: trimmedSearch ? searchMode : undefined,
        page: 1,
        limit: AUTOCOMPLETE_LIMIT,
        skipTotals: true,
      }).then((res) => ({
        metaId,
        items: (res.data.items ?? []) as TagListItem[],
      })),
    )

    const selectedByMeta = new Map<number, number[]>()
    for (const entry of selectedParsed) {
      const list = selectedByMeta.get(entry.metaId) || []
      list.push(entry.tagId)
      selectedByMeta.set(entry.metaId, list)
    }

    const selectedPromises = selectedByMeta.size
      ? [...selectedByMeta.entries()].map(([metaId, ids]) =>
          typedApi.postTagItems({
            metaId,
            ids,
            filters: [],
            skipTotals: true,
          }).then((res) => ({
            metaId,
            items: (res.data.items ?? []) as TagListItem[],
          })),
        )
      : []

    const [mainResults, selectedResults] = await Promise.all([
      Promise.all(mainPromises),
      Promise.all(selectedPromises),
    ])
    if (requestId !== fetchRequestId) return

    const mainOptions: TagOption[] = []
    const nextPage: Record<number, number> = {}
    const nextHasMore: Record<number, boolean> = {}
    for (const result of mainResults) {
      nextPage[result.metaId] = 1
      nextHasMore[result.metaId] = result.items.length >= AUTOCOMPLETE_LIMIT
      for (const tag of result.items) {
        const option = toTagOption(tag, result.metaId)
        if (option) mainOptions.push(option)
      }
    }
    metaPage.value = nextPage
    metaHasMore.value = nextHasMore

    const selectedOptions: TagOption[] = []
    for (const result of selectedResults) {
      for (const tag of result.items) {
        const option = toTagOption(tag, result.metaId)
        if (option) selectedOptions.push(option)
      }
    }

    // Also hydrate selected tags from the in-memory catalog when API misses them.
    for (const entry of selectedParsed) {
      const key = makeKey(entry.metaId, entry.tagId)
      if (selectedOptions.some((option) => option.key === key)) continue
      const storeTag = appStore.getTagById(entry.tagId) as TagListItem | undefined
      if (!storeTag) continue
      const option = toTagOption(storeTag, entry.metaId)
      if (option) selectedOptions.push(option)
    }

    tagOptions.value = mergeOptions(selectedOptions, mainOptions)
    await nextTick()
    void maybeFillMenu()
  } catch (error) {
    if (requestId !== fetchRequestId) return
    tagOptions.value = []
    metaPage.value = {}
    metaHasMore.value = {}
    console.error(error)
  }
}

async function loadMoreMeta(metaId: number) {
  const id = Number(metaId)
  if (!Number.isFinite(id) || id <= 0) return
  if (!metaHasMore.value[id] || metaLoading.value[id]) return

  metaLoading.value = {...metaLoading.value, [id]: true}
  const page = (metaPage.value[id] || 1) + 1
  const trimmedSearch = String(search.value || '').trim()
  const searchMode = resolveTagAutocompleteSearchMode(settingsStore.typingFiltersDefault)
  const beforeCount = tagOptions.value.filter((option) => option.metaId === id).length

  try {
    const response = await typedApi.postTagItems({
      metaId: id,
      filters: [],
      sortBy: 'favorite',
      direction: 'desc',
      search: trimmedSearch || undefined,
      searchMode: trimmedSearch ? searchMode : undefined,
      page,
      limit: AUTOCOMPLETE_LIMIT,
      skipTotals: true,
    })
    const items = (response.data.items ?? []) as TagListItem[]
    const options = items
      .map((tag) => toTagOption(tag, id))
      .filter((option): option is TagOption => option != null)

    // Re-merge then keep favorites above non-favorites for this category.
    const merged = mergeOptions(tagOptions.value, options)
    const others = merged.filter((option) => option.metaId !== id)
    const forMeta = merged.filter((option) => option.metaId === id).sort(compareTagOptions)
    tagOptions.value = [...others, ...forMeta]
    metaPage.value = {...metaPage.value, [id]: page}

    const afterCount = tagOptions.value.filter((option) => option.metaId === id).length
    metaHasMore.value = {
      ...metaHasMore.value,
      [id]: items.length >= AUTOCOMPLETE_LIMIT && afterCount > beforeCount,
    }
  } catch (error) {
    console.error(error)
  } finally {
    metaLoading.value = {...metaLoading.value, [id]: false}
  }
}

const runGetTags = debounce((query: string) => {
  void getTags(query)
}, 200)

function setVal(newVal: unknown, options: {allowClear?: boolean} = {}) {
  let normalized = normalizeKeys(newVal)
  if (props.single && normalized.length > 1) {
    normalized = normalized.slice(-1)
  }
  const previous = normalizeKeys(val.value)

  if (!normalized.length && previous.length && !options.allowClear) {
    const tagsStillExist = previous.every((key) => tagByKey.value.has(key))
    if (tagsStillExist) {
      nextTick(() => {
        search.value = ''
      })
      return
    }
  }

  if (sameKeys(normalized, previous)) {
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

function removeKey(key: string | number) {
  setVal(
    normalizeKeys(val.value).filter((entry) => entry !== String(key)),
    {allowClear: true},
  )
  hideHoverImage()
}

function onBlur() {
  nextTick(() => {
    search.value = ''
  })
}

async function create(name?: string, metaId?: number) {
  const searchText = String(name ?? search.value ?? '').trim()
  if (!searchText) return

  const targetMetaId = Number(metaId ?? defaultMetaId.value)
  if (!targetMetaId) return

  const normalized = normalizeName(searchText)
  const existingGlobal = (appStore.tags || []).find(
    (tag) => normalizeName(tag.name) === normalized,
  )
  if (existingGlobal?.id != null) {
    const existingMetaId = Number(existingGlobal.metaId) || targetMetaId
    if (idsIncludeMeta(existingMetaId)) {
      const key = makeKey(existingMetaId, Number(existingGlobal.id))
      if (!normalizeKeys(val.value).includes(key)) {
        setVal([...normalizeKeys(val.value), key])
      }
      search.value = ''
      return
    }
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
      metaId: targetMetaId,
    }])
    const created = res.data?.[0]
    const tagId = Number(created?.id)
    if (!tagId) return

    search.value = ''
    const key = makeKey(targetMetaId, tagId)
    setVal([...normalizeKeys(val.value), key])
    await getTags('')
    void reloadTagsCatalog()
  } catch (error) {
    console.error(error)
    notificationsStore.setNotification({
      type: 'error',
      title: t('meta.dialogs.adding_tags_complete'),
      text: getApiErrorMessage(error, t('notifications_text.server_error_logs')),
    })
  }
}

function idsIncludeMeta(metaId: number): boolean {
  return normalizedMetaIds.value.includes(metaId)
}

function onEnter(event: KeyboardEvent) {
  const searchText = search.value?.trim()
  if (!searchText) return

  const lower = searchText.toLowerCase()
  const exact = tagOptions.value.find((option) => option.name.toLowerCase() === lower)
  const mode = resolveTagAutocompleteSearchMode(settingsStore.typingFiltersDefault)
  const match = exact ?? tagOptions.value.find((option) =>
    matchesTagAutocomplete(option, searchText, mode),
  )

  if (match) {
    event.preventDefault()
    if (!normalizeKeys(val.value).includes(match.key)) {
      setVal([...normalizeKeys(val.value), match.key])
    }
    search.value = ''
    return
  }

  event.preventDefault()
  void create(searchText)
}

async function focusField() {
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

let unsubscribeTagsCatalog: (() => void) | null = null

onMounted(async () => {
  val.value = normalizeKeys(props.modelValue)
  await getTags('')
  unsubscribeTagsCatalog = onTagsCatalogChanged(() => {
    void getTags(search.value)
  })
})

onUnmounted(() => {
  runGetTags.cancel()
  unsubscribeTagsCatalog?.()
  unsubscribeTagsCatalog = null
})

watch(() => props.modelValue, (newVal) => {
  val.value = normalizeKeys(newVal)
})

watch(() => props.metaIds?.join(','), () => {
  void getTags(search.value)
})

watch(search, (query) => {
  runGetTags(query)
})

defineExpose({
  focus: focusField,
  create,
})
</script>

<style scoped>
.list-item {
  display: flex;
  align-items: center;
  width: 100%;
}

.synonyms {
  font-size: 0.85em;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin-left: 0.35rem;
}

.mixed-tags__category {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 8px 4px;
  padding: 7px 10px;
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.1);
  border: 1px solid rgba(var(--v-theme-primary), 0.2);
  pointer-events: none;
  user-select: none;
}

.mixed-tags__category-icon {
  flex-shrink: 0;
  color: rgb(var(--v-theme-primary));
  opacity: 0.95;
}

.mixed-tags__category-title {
  flex: 1;
  min-width: 0;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.85);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mixed-tags__category-count {
  flex-shrink: 0;
  font-weight: 700;
}

.mixed-tags__tag--zebra {
  background: rgba(var(--v-theme-on-surface), 0.03);
}

.mixed-tags__load-more-item {
  opacity: 0.9;
  color: rgb(var(--v-theme-primary));
  cursor: pointer;
}
</style>
