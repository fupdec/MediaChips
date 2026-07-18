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
    :menu-props="menuProps"
    :label="meta.name"
    :hint="meta.hint"
    :disabled="disabled"
    :hide-no-data="!search"
    hide-selected
    multiple
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

    <template v-slot:selection="{ item }">
      <v-chip
        v-if="item.raw"
        @click:close="removeTag(item.value)"
        @mouseover.stop="showHoverImage($event, meta.id, Number(item.value), 'tag', {
          label: item.raw?.name || item.title,
          imageAspectRatio: meta.imageAspectRatio,
        })"
        @mouseleave.stop="hideHoverImage"
        :label="meta?.chipLabel"
        :variant="chipVariant"
        :color="chipColorFor(item.raw)"
        :text-color="chipTextColorFor(item.raw)"
        closable
        class="ma-1"
        size="small"
      >
        <span>{{ item.raw.name || item.title }}</span>
      </v-chip>
      <v-chip
        v-else
        @click:close="removeTag(item.value)"
        class="ma-1"
        closable
      >
        <!-- Если raw недоступен, ищем тег в listTags -->
        <span>{{ findTagName(item.value) }}</span>
      </v-chip>
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
            <div class="d-flex align-center mr-2">
              <span v-if="meta.favorite">
                <v-icon v-if="item.raw.favorite" color="pink" size="small" class="mr-1">
                  mdi-heart
                </v-icon>
                <v-icon v-else size="small" class="mr-1">mdi-heart-outline</v-icon>
              </span>
              <span v-if="meta.color">
                <v-icon :color="chipColorFor(item.raw) || ''" size="14" class="mr-1">mdi-circle</v-icon>
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

    <template v-if="purpose != 'filter' && purpose != 'bulk' && showIcons" v-slot:prepend>
      <v-menu location="top" close-on-click>
        <template v-slot:activator="{ props }">
          <v-btn v-bind="props" icon variant="plain" density="compact">
            <v-icon>mdi-{{ meta.icon }}</v-icon>
          </v-btn>
        </template>

        <v-list density="compact">
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
import orderBy from 'lodash/orderBy'
import {useSettingsStore} from '@/stores/settings'
import {useAppStore} from '@/stores/app'
import {useEventBus} from "@/utils/eventBus"
import {
  foundByChars,
  getTextColor,
  highlightChars,
} from '@/services/formatUtils'
import {resolveTagChipColor} from '@shared/tagChipColor'
import {hideHoverImage, showHoverImage} from '@/services/hoverService'
import {debounce} from '@/utils/debounce'
import type { ArrayMeta, TagListItem } from '@/types/metaInput'

const attrs = useAttrs()

const props = withDefaults(defineProps<{
  metaId?: number
  purpose?: string
  modelValue?: number[] | number
  disabled?: boolean
  cond?: string | null
  menuProps?: Record<string, unknown>
}>(), {
  cond: null,
  menuProps: () => ({
    contentClass: "custom-list",
  }),
})

const emit = defineEmits<{
  'update:modelValue': [value: number[]]
}>()

const settingsStore = useSettingsStore()
const appStore = useAppStore()
const eventBus = useEventBus()
const router = useRouter()
const {t} = useI18n()

const AUTOCOMPLETE_LIMIT = 50

const meta = ref<ArrayMeta>({} as ArrayMeta)
const val = ref<number[]>([])
const listTags = ref<TagListItem[]>([])
const search = ref('')
const field = ref<unknown>(null)
let fetchRequestId = 0

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
  return getTextColor(color, chipVariant.value === 'outlined')
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

/** Server already filtered — keep all items, only apply highlight. */
const filterTagsForAutocomplete = (
  _value: string,
  query: string,
  item?: TagFilterItem,
) => {
  if (item?.raw && query) {
    applyTagHighlight(item, query)
  }
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

const mergeTagLists = (...lists: TagListItem[][]) => {
  const byId = new Map<number, TagListItem>()
  for (const list of lists) {
    for (const tag of list) {
      byId.set(Number(tag.id), tag)
    }
  }
  return [...byId.values()]
}

const getTags = async (searchQuery = search.value) => {
  if (!props.metaId) {
    listTags.value = []
    return
  }

  const requestId = ++fetchRequestId
  const selectedIds = normalizeIds(val.value)
  const trimmedSearch = String(searchQuery || '').trim()

  try {
    const mainPromise = typedApi.postTagItems({
      metaId: props.metaId,
      filters: [],
      sortBy: meta.value?.sortBy || 'name',
      direction: meta.value?.sortDir || 'asc',
      search: trimmedSearch || undefined,
      page: 1,
      limit: AUTOCOMPLETE_LIMIT,
      skipTotals: true,
    })

    const selectedPromise = selectedIds.length
      ? typedApi.postTagItems({
          metaId: props.metaId,
          ids: selectedIds,
          filters: [],
          skipTotals: true,
        })
      : Promise.resolve({data: {items: [] as TagListItem[]}})

    const [mainRes, selectedRes] = await Promise.all([mainPromise, selectedPromise])
    if (requestId !== fetchRequestId) return

    const tags = mergeTagLists(
      (selectedRes.data.items ?? []) as TagListItem[],
      (mainRes.data.items ?? []) as TagListItem[],
    )
    listTags.value = sortTags(tags)
  } catch (e) {
    if (requestId !== fetchRequestId) return
    listTags.value = []
    console.error(e)
  }
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
  const sortByParam = meta.value?.sortBy || 'createdAt'
  const sortDir = (meta.value?.sortDir || 'asc') as 'asc' | 'desc'

  const sorted = orderBy(tags, ['name'], ['asc'])
  return orderBy(sorted, [sortByParam], [sortDir])
}

const create = async () => {
  if (!search.value) return

  const searchText = search.value.trim()
  if (!searchText) return

  const isExists = listTags.value.findIndex(
    i => i.name.toLowerCase() === searchText.toLowerCase()
  ) > -1

  if (isExists) return

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

    eventBus.emit("getTags")

    const routeMetaId = router.currentRoute.value.query.metaId
    if (routeMetaId != null && +routeMetaId === props.metaId) {
      const data = {
        ids: [],
        type: 'tag',
      }

      if (router.currentRoute.value.query.player) {
        window.electronAPI?.send?.("getItemsFromDb", data)
      } else {
        eventBus.emit("getItemsFromDb", data)
      }
    }
  } catch (e) {
    console.error(e)
  }
}

const onEnter = (event: KeyboardEvent) => {
  const searchText = search.value?.trim()
  const isExists = listTags.value.some(
    (i) => i.name.toLowerCase() === searchText?.toLowerCase()
  )

  if (searchText && !isExists) {
    event.preventDefault()
    create()
  }
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

// Lifecycle hooks
onMounted(async () => {
  await getMeta()

  val.value = normalizeIds(props.modelValue)
  await getTags('')
  eventBus.on('getTags', refreshTagsFromEvent)
})

onUnmounted(() => {
  runGetTags.cancel()
  eventBus.off('getTags', refreshTagsFromEvent)
})

// Watchers
watch(() => props.modelValue, (newVal: number[] | number | undefined) => {
  val.value = normalizeIds(newVal)
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

.synonyms {
  font-size: 0.85em;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
</style>