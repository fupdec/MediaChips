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
    :label="label || t('meta.fields.mixed_tags_label')"
    :placeholder="t('meta.fields.mixed_tags_placeholder')"
    :disabled="disabled"
    :hide-no-data="!search.trim()"
    hide-selected
    multiple
    no-filter
    :menu-props="menuProps"
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
        :text-color="chipTextColorFor(item.raw)"
        :prepend-icon="`mdi-${item.raw.metaIcon}`"
        :title="item.raw.metaName"
        closable
        class="ma-1"
        size="small"
      >
        <span>{{ item.raw.name }}</span>
      </v-chip>
      <v-chip
        v-else
        @click:close="removeKey(item.value)"
        class="ma-1"
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
          size="16"
          class="mixed-tags__category-icon"
        >
          mdi-{{ item.raw.icon || 'tag-multiple-outline' }}
        </v-icon>
        <span class="mixed-tags__category-title">{{ item.raw.title }}</span>
        <v-chip
          size="x-small"
          variant="tonal"
          color="primary"
          class="ml-2"
        >
          {{ item.raw.count }}
        </v-chip>
      </div>
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

    <template #append-item>
      <div
        v-if="hasMore"
        v-intersect="onLoadMoreIntersect"
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
  </v-autocomplete>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, onUnmounted, watch, nextTick, useAttrs} from 'vue'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {useSettingsStore} from '@/stores/settings'
import {useAppStore} from '@/stores/app'
import {onTagsCatalogChanged, reloadTagsCatalog} from '@/composable/appCatalogs'
import {
  foundByChars,
  getTextColor,
  highlightChars,
} from '@/services/formatUtils'
import {resolveTagChipColor} from '@shared/tagChipColor'
import {hideHoverImage, showHoverImage} from '@/services/hoverService'
import {debounce} from '@/utils/debounce'
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
  disabled: true
}

type AutocompleteItem = TagOption | HeaderOption

const attrs = useAttrs()

const props = withDefaults(defineProps<{
  metaIds?: number[]
  modelValue?: MixedTagKey[]
  disabled?: boolean
  label?: string
  menuProps?: Record<string, unknown>
}>(), {
  metaIds: () => [],
  modelValue: () => [],
  menuProps: () => ({
    contentClass: 'custom-list mixed-tags-dropdown',
    maxHeight: 360,
  }),
})

const emit = defineEmits<{
  'update:modelValue': [value: MixedTagKey[]]
}>()

const settingsStore = useSettingsStore()
const appStore = useAppStore()
const {t} = useI18n()

const AUTOCOMPLETE_LIMIT = 50

const val = ref<MixedTagKey[]>([])
const search = ref('')
const field = ref<unknown>(null)
const tagOptions = ref<TagOption[]>([])
const currentPage = ref(1)
const hasMore = ref(false)
const loadingMore = ref(false)
const sentinelIntersecting = ref(false)
let fetchRequestId = 0

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
  const list = metas.value
  const parser = list.find((meta) => Boolean(meta.parser))
  if (parser?.id != null) return Number(parser.id)
  const named = list.find((meta) => normalizeName(meta.name) === 'tags')
  if (named?.id != null) return Number(named.id)
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
    const tags = tagOptions.value.filter((option) => {
      if (option.metaId !== metaId) return false
      return !selected.has(option.key)
    })
    if (!tags.length) continue

    items.push({
      kind: 'header',
      key: `header:${metaId}`,
      title: String(meta.name || metaId),
      icon: metaIconName(meta.icon),
      count: tags.length,
      disabled: true,
    })
    for (const tag of tags) {
      items.push({
        ...tag,
        zebra: tagIndex % 2 === 1,
      })
      tagIndex += 1
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
  return getTextColor(color, chipVariantFor(tag.metaId) === 'outlined')
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

function toTagOption(tag: TagListItem, metaId: number): TagOption | null {
  const tagId = Number(tag.id)
  if (!tagId) return null
  const meta = metaById(metaId)
  const metaName = String(meta?.name || metaId)
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

async function getTags(searchQuery = search.value, options: {append?: boolean} = {}) {
  const append = Boolean(options.append)
  const metaIds = normalizedMetaIds.value

  if (!metaIds.length) {
    tagOptions.value = []
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
  const trimmedSearch = String(searchQuery || '').trim()
  const page = append ? currentPage.value + 1 : 1
  const selectedParsed = normalizeKeys(val.value)
    .map(parseKey)
    .filter((entry): entry is {metaId: number; tagId: number} => Boolean(entry))

  try {
    const mainPromises = metaIds.map((metaId) =>
      typedApi.postTagItems({
        metaId,
        filters: [],
        sortBy: metaById(metaId)?.sortBy || 'name',
        direction: metaById(metaId)?.sortDir || 'asc',
        search: trimmedSearch || undefined,
        page,
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

    const selectedPromises = (!append && selectedByMeta.size)
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
    let anyFullPage = false
    for (const result of mainResults) {
      if (result.items.length >= AUTOCOMPLETE_LIMIT) anyFullPage = true
      for (const tag of result.items) {
        const option = toTagOption(tag, result.metaId)
        if (option) mainOptions.push(option)
      }
    }

    hasMore.value = anyFullPage
    currentPage.value = page

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

    if (append) {
      const beforeCount = tagOptions.value.length
      tagOptions.value = mergeOptions(tagOptions.value, mainOptions)
      if (tagOptions.value.length === beforeCount) hasMore.value = false
    } else {
      tagOptions.value = mergeOptions(selectedOptions, mainOptions)
    }
  } catch (error) {
    if (requestId !== fetchRequestId) return
    if (!append) {
      tagOptions.value = []
      currentPage.value = 1
      hasMore.value = false
    }
    console.error(error)
  } finally {
    if (append) loadingMore.value = false
  }
}

async function loadMoreTags() {
  if (!hasMore.value || loadingMore.value) return
  await getTags(search.value, {append: true})
  await nextTick()
  if (hasMore.value && sentinelIntersecting.value) {
    await loadMoreTags()
  }
}

function onLoadMoreIntersect(isIntersecting: boolean) {
  sentinelIntersecting.value = isIntersecting
  if (isIntersecting) void loadMoreTags()
}

const runGetTags = debounce((query: string) => {
  void getTags(query)
}, 200)

function setVal(newVal: unknown, options: {allowClear?: boolean} = {}) {
  const normalized = normalizeKeys(newVal)
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

  const existsInTarget = tagOptions.value.some(
    (option) =>
      option.metaId === targetMetaId
      && option.name.toLowerCase() === searchText.toLowerCase(),
  )
  if (existsInTarget) return

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
  }
}

function onEnter(event: KeyboardEvent) {
  const searchText = search.value?.trim()
  if (!searchText) return

  const existsAnywhere = tagOptions.value.some(
    (option) => option.name.toLowerCase() === searchText.toLowerCase(),
  )
  if (!existsAnywhere) {
    event.preventDefault()
    void create(searchText)
  }
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
  padding: 8px 16px 4px;
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.7);
  pointer-events: none;
}

.mixed-tags__category-icon {
  margin-right: 6px;
}

.mixed-tags__tag--zebra {
  background: rgba(var(--v-theme-on-surface), 0.03);
}
</style>
