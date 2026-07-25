<script setup lang="ts">
import {ref, computed, nextTick, onMounted, onBeforeUnmount, watch, triggerRef} from 'vue'
import {useRouter} from 'vue-router'
import {useHotkey} from 'vuetify'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {useEventBus} from '@/utils/eventBus'
import AppBarButton from '@/components/app/appbar/AppBarButton.vue'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {usePlayerStore} from '@/stores/player'
import {useContextMenu} from '@/stores/contextMenu'
import {useImageViewerStore} from '@/stores/imageViewer'
import useItemContextMenu from '@/composable/ItemContextMenu'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import {getDefaultMediaTypeId, isAudioMediaType, isImageMediaType, isTextMediaType, isVideoMediaType} from '@/utils/mediaType'
import {highlightGlobalSearchText, textMatchesGlobalSearchQuery} from '@/services/formatUtils'
import {debounce} from '@/utils/debounce'
import {hideHoverImage, showHoverImage} from '@/services/hoverService'
import {openPath} from '@/services/shellService'
import {checkFileExists} from '@/services/fileService'
import type { ContextMenuEntry, MediaItem, Meta, Tag } from '@/types/stores'

type MatchedSearchTag = {
  id: number
  name: string
  metaId?: number | null
  matchSource?: 'name' | 'synonym' | 'bookmark' | 'both'
  matchedSynonyms?: string[]
  matchedBookmark?: string
}

type GlobalSearchMedia = MediaItem & {
  matchSource?: 'name' | 'tag' | 'bookmark' | 'both'
  matchedTags?: MatchedSearchTag[]
  matchedBookmark?: string
}

type GlobalSearchTag = Tag & {
  matchSource?: 'name' | 'synonym' | 'bookmark' | 'both'
  matchedSynonyms?: string[]
  matchedBookmark?: string
}

type PinnedSearchTag = {
  id: number
  name: string
  metaId?: number | null
}

function groupByKey<T>(items: T[], key: keyof T): Record<string, T[]> {
  const grouped: Record<string, T[]> = {}
  for (const item of items) {
    const groupKey = String(item[key])
    ;(grouped[groupKey] ??= []).push(item)
  }
  return grouped
}

interface SearchGroup {
  data: Array<GlobalSearchMedia | GlobalSearchTag>
  name?: string
  icon?: string
  mediaTypeId?: number
  metaId?: number
  is_media: boolean
  group_id: string
}

type FlatResultRow =
  | { kind: 'section'; section: 'tags' | 'filtered'; title: string; id: string }
  | { kind: 'header'; group: SearchGroup; id: string }
  | { kind: 'item'; group: SearchGroup; item: GlobalSearchMedia | GlobalSearchTag; id: string }
  | { kind: 'show-more'; group: SearchGroup; hiddenCount: number; id: string }

const {t} = useI18n()
const eventBus = useEventBus()
const router = useRouter()

useHotkey('slash', () => {
  if (playerStore.active) return
  showSearch()
})

const app = useAppStore()
const itemsStore = useItemsStore()
const playerStore = usePlayerStore()
const imageViewerStore = useImageViewerStore()
const contextMenuStore = useContextMenu()
const meta = computed(() => app.meta)
const mediaTypes = computed(() => app.mediaTypes)

const dialog = ref(false)
const query = ref('')
const loading = ref(false)
const results = ref<SearchGroup[]>([])
const expandedGroupIds = ref<Set<string>>(new Set())
const searchInput = ref<HTMLInputElement | null>(null)
const resultsScroller = ref<{ scrollToIndex: (index: number) => void } | null>(null)
const selectedIndex = ref(-1)
const pinnedTags = ref<PinnedSearchTag[]>([])
const inputFocused = ref(false)

let abortController: AbortController | null = null
let pendingNavigation: (() => void) | null = null
const RESULT_LIMIT = 50
const GROUP_PREVIEW_LIMIT = 20
const ROW_HEIGHT = 30
const RESULTS_MAX_HEIGHT = 480
const HIGHLIGHT_CACHE_MAX = 512

const highlightCache = new Map<string, string>()
let cachedHighlightQuery = ''

function clearHighlightCache(): void {
  highlightCache.clear()
  cachedHighlightQuery = ''
}

function cacheHighlight(text: string, highlighted: string): void {
  if (highlightCache.has(text)) {
    highlightCache.delete(text)
  }
  highlightCache.set(text, highlighted)

  while (highlightCache.size > HIGHLIGHT_CACHE_MAX) {
    const oldest = highlightCache.keys().next().value
    if (oldest === undefined) break
    highlightCache.delete(oldest)
  }
}

watch(query, (value) => {
  const trimmed = value.trim()
  if (trimmed !== cachedHighlightQuery) {
    clearHighlightCache()
    cachedHighlightQuery = trimmed
  }
})

const totalResults = computed(() =>
  results.value.reduce((sum, group) => sum + group.data.length, 0),
)

const flatResults = computed((): FlatResultRow[] => {
  const flat: FlatResultRow[] = []
  const showSections = pinnedTags.value.length > 0
  const tagGroups = results.value.filter((group) => !group.is_media)
  const mediaGroups = results.value.filter((group) => group.is_media)
  const groupsToRender = showSections
    ? [...tagGroups, ...mediaGroups]
    : results.value

  const appendGroup = (group: SearchGroup) => {
    flat.push({kind: 'header', group, id: `h-${group.group_id}`})

    const isExpanded = expandedGroupIds.value.has(group.group_id)
    const visibleItems = isExpanded || group.data.length <= GROUP_PREVIEW_LIMIT
      ? group.data
      : group.data.slice(0, GROUP_PREVIEW_LIMIT)

    for (const item of visibleItems) {
      flat.push({
        kind: 'item',
        group,
        item,
        id: `${group.group_id}-${item.id}`,
      })
    }

    if (!isExpanded && group.data.length > GROUP_PREVIEW_LIMIT) {
      flat.push({
        kind: 'show-more',
        group,
        hiddenCount: group.data.length - GROUP_PREVIEW_LIMIT,
        id: `more-${group.group_id}`,
      })
    }
  }

  if (showSections) {
    if (tagGroups.length) {
      flat.push({
        kind: 'section',
        section: 'tags',
        title: t('globalSearch.sectionTags'),
        id: 'section-tags',
      })
      for (const group of tagGroups) appendGroup(group)
    }
    if (mediaGroups.length) {
      flat.push({
        kind: 'section',
        section: 'filtered',
        title: t('globalSearch.sectionFiltered'),
        id: 'section-filtered',
      })
      for (const group of mediaGroups) appendGroup(group)
    }
    return flat
  }

  for (const group of groupsToRender) appendGroup(group)
  return flat
})

const resultsScrollHeight = computed(() => {
  const contentHeight = flatResults.value.length * ROW_HEIGHT
  return Math.min(Math.max(contentHeight, 120), RESULTS_MAX_HEIGHT)
})

const navigableIndices = computed(() =>
  flatResults.value.reduce<number[]>((indices, row, index) => {
    if (row.kind === 'item' || row.kind === 'show-more') indices.push(index)
    return indices
  }, []),
)

const hasActiveSearch = computed(() =>
  Boolean(query.value.trim() || pinnedTags.value.length),
)

const selectedIsTag = computed(() => {
  const row = flatResults.value[selectedIndex.value]
  return Boolean(row && row.kind === 'item' && !row.group.is_media)
})

function showSearch() {
  dialog.value = true
  query.value = ''
  pinnedTags.value = []
  results.value = []
  clearHighlightCache()
  focusSearchField()
}

onMounted(() => {
  eventBus.on('showGlobalSearch', showSearch)
})

onBeforeUnmount(() => {
  eventBus.off('showGlobalSearch', showSearch)
  abortController?.abort()
  runSearch.cancel()
})

async function focusSearchField() {
  await nextTick()
  searchInput.value?.focus()
  setTimeout(() => searchInput.value?.focus(), 50)
}

function onInputShellMouseDown(e: MouseEvent) {
  if (e.target === searchInput.value) return
  e.preventDefault()
  focusSearchField()
}

function resetExpandedGroups() {
  expandedGroupIds.value.clear()
  triggerRef(expandedGroupIds)
}

function expandGroup(groupId: string) {
  if (expandedGroupIds.value.has(groupId)) return
  expandedGroupIds.value.add(groupId)
  triggerRef(expandedGroupIds)
}

function resetState() {
  abortController?.abort()
  runSearch.cancel()
  query.value = ''
  pinnedTags.value = []
  results.value = []
  resetExpandedGroups()
  clearHighlightCache()
  loading.value = false
  selectedIndex.value = -1
}

function closeThenNavigate(action: () => void) {
  hideHoverImage()
  pendingNavigation = action
  dialog.value = false
}

function onDialogClose() {
  resetState()
  const action = pendingNavigation
  pendingNavigation = null
  if (!action) return
  nextTick(() => action())
}

function normalizeSearchMedia(
  items: Array<{
    id: number
    name?: string | null
    path?: string
    mediaTypeId?: number
    width?: number | null
    height?: number | null
    matchSource?: 'name' | 'tag' | 'bookmark' | 'both'
    matchedBookmark?: string
    matchedTags?: MatchedSearchTag[]
  }>,
): GlobalSearchMedia[] {
  return items.map((item) => ({
    ...item,
    name: item.name ?? undefined,
    matchedBookmark: item.matchedBookmark || undefined,
    matchedTags: item.matchedTags?.length ? item.matchedTags : undefined,
  }))
}

function normalizeSearchTags(
  items: Array<{
    id: number
    name?: string | null
    synonyms?: string | null
    metaId?: number | null
    matchSource?: 'name' | 'synonym' | 'bookmark' | 'both'
    matchedSynonyms?: string[]
    matchedBookmark?: string
  }>,
): GlobalSearchTag[] {
  return items.map((item) => ({
    ...item,
    name: item.name ?? undefined,
    synonyms: item.synonyms ?? undefined,
    metaId: item.metaId ?? undefined,
    matchedBookmark: item.matchedBookmark || undefined,
  }))
}

function buildMediaGroups(data: GlobalSearchMedia[]) {
  const grouped = groupByKey(data, 'mediaTypeId')

  return Object.keys(grouped).map(id => {
    const type = mediaTypes.value.find(item => item.id === Number(id))
    if (!type) return null

    return {
      data: grouped[id],
      name: getMediaTypeName(type, t),
      icon: type.icon,
      mediaTypeId: type.id,
      is_media: true,
      group_id: `media-${type.id}`,
    }
  }).filter(Boolean) as SearchGroup[]
}

function buildTagGroups(data: GlobalSearchTag[]) {
  const grouped = groupByKey(data, 'metaId')

  return Object.keys(grouped).map(metaId => {
    const m = meta.value.find(item => item.id === Number(metaId))
    if (!m) return null

    return {
      data: grouped[metaId],
      name: m.name,
      icon: m.icon,
      metaId: m.id,
      is_media: false,
      group_id: `meta-${m.id}`,
    }
  }).filter(Boolean) as SearchGroup[]
}

function sortGroups(groups: SearchGroup[]) {
  return groups.sort((a, b) => {
    if (a.is_media !== b.is_media) return a.is_media ? 1 : -1

    if (a.is_media) {
      const ai = mediaTypes.value.findIndex(item => item.id === a.mediaTypeId)
      const bi = mediaTypes.value.findIndex(item => item.id === b.mediaTypeId)
      return ai - bi
    }

    const ai = meta.value.findIndex(item => item.id === a.metaId)
    const bi = meta.value.findIndex(item => item.id === b.metaId)
    return ai - bi
  })
}

async function search() {
  const q = query.value.trim()
  const tagIds = pinnedTags.value.map((tag) => tag.id)
  if (!q && !tagIds.length) {
    results.value = []
    loading.value = false
    return
  }

  if (!mediaTypes.value.length) {
    loading.value = false
    return
  }

  abortController?.abort()
  abortController = new AbortController()
  const {signal} = abortController

  loading.value = true
  results.value = []
  resetExpandedGroups()
  selectedIndex.value = -1

  try {
    const searchRes = await typedApi.searchGlobal(
      {
        q,
        limit: RESULT_LIMIT,
        ...(tagIds.length ? {tagIds} : {}),
      },
      {signal},
    )

    if (signal.aborted) return

    const mediaGroups = buildMediaGroups(normalizeSearchMedia(searchRes.data.media || []))
    const tagGroups = buildTagGroups(normalizeSearchTags(searchRes.data.tags || []))
    results.value = sortGroups([...mediaGroups, ...tagGroups])
  } catch (e: unknown) {
    const err = e as { code?: string; name?: string }
    if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return
    console.error(e)
  } finally {
    if (!signal.aborted) loading.value = false
  }
}

const runSearch = debounce(search, 250)

function onQueryInput() {
  if (!query.value.trim() && !pinnedTags.value.length) {
    abortController?.abort()
    runSearch.cancel()
    results.value = []
    resetExpandedGroups()
    loading.value = false
    selectedIndex.value = -1
    return
  }

  loading.value = true
  selectedIndex.value = -1
  runSearch()
}

function pinSelectedTag() {
  const row = flatResults.value[selectedIndex.value]
  if (!row || row.kind !== 'item' || row.group.is_media) return

  const tag = row.item as GlobalSearchTag
  if (!Number.isFinite(tag.id)) return
  if (pinnedTags.value.some((entry) => entry.id === tag.id)) return

  pinnedTags.value = [
    ...pinnedTags.value,
    {
      id: tag.id,
      name: String(tag.name ?? ''),
      metaId: tag.metaId ?? null,
    },
  ]
  query.value = ''
  runSearch.cancel()
  loading.value = true
  selectedIndex.value = -1
  void search()
  focusSearchField()
}

function unpinTag(tagId: number) {
  pinnedTags.value = pinnedTags.value.filter((tag) => tag.id !== tagId)
  runSearch.cancel()
  if (!query.value.trim() && !pinnedTags.value.length) {
    abortController?.abort()
    results.value = []
    resetExpandedGroups()
    loading.value = false
    selectedIndex.value = -1
    return
  }
  loading.value = true
  selectedIndex.value = -1
  void search()
  focusSearchField()
}

watch(query, (value) => {
  if (!value) onQueryInput()
})

watch(
  () => playerStore.active || imageViewerStore.active,
  (active) => {
    if (active && dialog.value) dialog.value = false
  },
)

function openGroup(group: SearchGroup) {
  if (group.is_media) openMediaPage(group.mediaTypeId)
  else openMeta(group.metaId)
}

function openMedia(media: GlobalSearchMedia, mediaTypeId?: number) {
  closeThenNavigate(() => {
    const type = mediaTypes.value.find(item => item.id === Number(mediaTypeId || media.mediaTypeId))

    if (isImageMediaType(type)) {
      itemsStore.viewImage({image: media})
    } else if (isVideoMediaType(type) || isAudioMediaType(type)) {
      itemsStore.playVideo({video: media})
    } else if (isTextMediaType(type) && media.path) {
      openPath(media.path)
    } else {
      router.push(`/media?mediaTypeId=${mediaTypeId || media.mediaTypeId}`)
    }
  })
}

function openMeta(metaId?: number) {
  closeThenNavigate(() => {
    router.push(`/meta?metaId=${metaId}`)
  })
}

function openMediaPage(mediaTypeId?: number) {
  closeThenNavigate(() => {
    router.push(`/media?mediaTypeId=${mediaTypeId}`)
  })
}

function openTag(tag: Tag) {
  closeThenNavigate(() => {
    router.push(`/tag?metaId=${tag.metaId}&tagId=${tag.id}&mediaTypeId=${getDefaultMediaTypeId(mediaTypes.value)}`)
  })
}

function openFirstResult() {
  const row = flatResults.value.find(entry => entry.kind === 'item')
  if (!row) return

  if (row.group.is_media) openMedia(row.item as GlobalSearchMedia, row.group.mediaTypeId)
  else openTag(row.item as Tag)
}

function openSelectedResult() {
  const row = flatResults.value[selectedIndex.value]
  if (!row || row.kind === 'header' || row.kind === 'section') {
    openFirstResult()
    return
  }

  if (row.kind === 'show-more') {
    expandGroup(row.group.group_id)
    return
  }

  if (row.group.is_media) openMedia(row.item as GlobalSearchMedia, row.group.mediaTypeId)
  else openTag(row.item as Tag)
}

function scrollSelectedIntoView() {
  nextTick(() => {
    if (selectedIndex.value >= 0) {
      resultsScroller.value?.scrollToIndex(selectedIndex.value)
    }
  })
}

function moveSelection(direction: number) {
  const indices = navigableIndices.value
  if (!indices.length) return

  if (selectedIndex.value === -1) {
    selectedIndex.value = direction > 0 ? indices[0] : indices[indices.length - 1]
  } else {
    const pos = indices.indexOf(selectedIndex.value)
    const nextPos = (pos === -1 ? 0 : pos) + direction

    if (nextPos >= 0 && nextPos < indices.length) {
      selectedIndex.value = indices[nextPos]
    }
  }

  scrollSelectedIntoView()
}

function clearAllSearch() {
  query.value = ''
  pinnedTags.value = []
  abortController?.abort()
  runSearch.cancel()
  results.value = []
  resetExpandedGroups()
  clearHighlightCache()
  loading.value = false
  selectedIndex.value = -1
  focusSearchField()
}

function onSearchKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    moveSelection(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    moveSelection(-1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    openSelectedResult()
  } else if (e.key === 'Tab' && selectedIsTag.value) {
    e.preventDefault()
    pinSelectedTag()
  } else if (e.key === 'Backspace' && !query.value && pinnedTags.value.length) {
    e.preventDefault()
    unpinTag(pinnedTags.value[pinnedTags.value.length - 1].id)
  }
}

function onItemMouseenter(row: FlatResultRow, index: number) {
  if (row.kind === 'header' || row.kind === 'section') return
  selectedIndex.value = index
}

let contextMenuRequestId = 0

async function showResultContextMenu(event: MouseEvent, row: FlatResultRow, index: number) {
  event.preventDefault()
  event.stopPropagation()
  hideHoverImage()

  if (row.kind !== 'item') return

  selectedIndex.value = index

  const requestId = ++contextMenuRequestId
  const isMedia = row.group.is_media
  const item = isMedia
    ? {
        ...row.item,
        mediaTypeId: (row.item as GlobalSearchMedia).mediaTypeId ?? row.group.mediaTypeId,
      } as GlobalSearchMedia
    : row.item
  let fileExists = true

  if (isMedia) {
    const mediaPath = String((item as GlobalSearchMedia).path ?? '')
    if (mediaPath) {
      fileExists = await checkFileExists(mediaPath)
      if (requestId !== contextMenuRequestId) return
    }
  }

  const tagMeta: Meta | null | undefined = isMedia
    ? null
    : meta.value.find((entry) => entry.id === Number((item as GlobalSearchTag).metaId)) ?? null

  const {getContextMenu} = useItemContextMenu(
    item,
    isMedia ? 'media' : 'tag',
    tagMeta,
    fileExists,
    null,
    {singleItem: true},
  )

  contextMenuStore.showContextMenu({
    content: getContextMenu() as ContextMenuEntry[],
    x: event.clientX,
    y: event.clientY,
    tagMeta,
  })
}

function showResultHover(event: MouseEvent, row: FlatResultRow) {
  if (row.kind !== 'item') return
  if (row.group.is_media) {
    const type = mediaTypes.value.find(item => item.id === row.group.mediaTypeId)
    showHoverImage(event, row.group.mediaTypeId ?? null, row.item.id, 'media', {
      width: row.item.width as number | undefined,
      height: row.item.height as number | undefined,
      isVideo: isVideoMediaType(type),
      label: String(row.item.name ?? ''),
    })
    return
  }

  const tagMetaId = (row.item.metaId as number) ?? null
  const tagMeta = tagMetaId
    ? app.meta.find((item) => item.id === tagMetaId)
    : undefined

  showHoverImage(event, tagMetaId, row.item.id, 'tag', {
    label: String(row.item.name ?? ''),
    imageAspectRatio: tagMeta?.imageAspectRatio,
  })
}

function getMatchedSynonymsText(item: GlobalSearchTag): string {
  if (item.matchedSynonyms?.length) {
    return item.matchedSynonyms.join(', ')
  }
  if (item.matchSource === 'synonym' && item.synonyms) {
    return item.synonyms
  }
  return ''
}

function getMatchedBookmarkText(item: GlobalSearchMedia | GlobalSearchTag): string {
  if (item.matchedBookmark) return item.matchedBookmark
  return ''
}

function getMatchedTags(item: GlobalSearchMedia | GlobalSearchTag, isMedia: boolean): MatchedSearchTag[] {
  if (!isMedia) return []
  const media = item as GlobalSearchMedia
  if (!media.matchedTags?.length) return []
  // Show chips whenever backend attached matched tags (tag-only or name+tag).
  return media.matchedTags
}

function openMatchedTag(tag: MatchedSearchTag) {
  openTag({
    id: tag.id,
    name: tag.name,
    metaId: tag.metaId ?? undefined,
  } as Tag)
}

function getMatchedTagChipLabel(tag: MatchedSearchTag): string {
  const query = cachedHighlightQuery
  if (!query) return tag.name

  if (textMatchesGlobalSearchQuery(tag.name, query)) return tag.name

  const synonym = tag.matchedSynonyms?.find((entry) => textMatchesGlobalSearchQuery(entry, query))
  if (synonym) return synonym

  if (tag.matchedBookmark && textMatchesGlobalSearchQuery(tag.matchedBookmark, query)) {
    return tag.matchedBookmark
  }

  if (tag.matchSource === 'synonym' && tag.matchedSynonyms?.[0]) {
    return tag.matchedSynonyms[0]
  }

  return tag.name
}

function shouldShowMatchedSynonyms(item: GlobalSearchMedia | GlobalSearchTag, isMedia: boolean): boolean {
  if (isMedia) return false
  const tag = item as GlobalSearchTag
  return Boolean(tag.matchedSynonyms?.length || tag.matchSource === 'synonym')
}

function shouldShowMatchedBookmark(item: GlobalSearchMedia | GlobalSearchTag): boolean {
  return Boolean(item.matchedBookmark)
}

function getNameHighlighted(text: string) {
  if (!text) return ''

  let cached = highlightCache.get(text)
  if (cached === undefined) {
    cached = highlightGlobalSearchText(text, cachedHighlightQuery)
    cacheHighlight(text, cached)
  }

  return cached
}
</script>

<template>
  <v-dialog
    v-model="dialog"
    max-width="720"
    @after-leave="onDialogClose"
  >
    <template #activator="{ props: activatorProps }">
      <AppBarButton
        v-bind="activatorProps"
        :action="showSearch"
        :text="t('appbar.buttons.search')"
        icon="magnify"
        hotkey="slash"
      />
    </template>

    <v-card class="global-search" rounded="xl">
      <div class="global-search__header pa-4 pb-2">
        <div class="d-flex align-center justify-space-between mb-3">
          <div class="d-flex align-center ga-3 min-w-0">
            <div class="text-h6 text-truncate">{{ t('appbar.globalSearch') }}</div>
            <v-chip
              v-if="hasActiveSearch && !loading && totalResults > 0"
              size="small"
              variant="tonal"
              color="primary"
              class="flex-shrink-0"
            >
              {{ totalResults }}
            </v-chip>
          </div>
          <v-hotkey keys="slash" variant="flat"/>
        </div>

        <div
          class="global-search__input"
          :class="{'global-search__input--focused': inputFocused}"
          @mousedown="onInputShellMouseDown"
        >
          <v-icon class="global-search__input-icon text-medium-emphasis" size="20">
            mdi-magnify
          </v-icon>

          <div class="global-search__input-body">
            <v-chip
              v-for="tag in pinnedTags"
              :key="tag.id"
              size="small"
              variant="tonal"
              color="primary"
              closable
              prepend-icon="mdi-tag"
              class="global-search__input-chip"
              @mousedown.stop
              @click:close="unpinTag(tag.id)"
            >
              {{ tag.name }}
            </v-chip>

            <input
              ref="searchInput"
              v-model="query"
              class="global-search__input-text"
              type="text"
              autocomplete="off"
              spellcheck="false"
              :placeholder="pinnedTags.length ? '' : t('globalSearch.enterText')"
              @input="onQueryInput"
              @keydown="onSearchKeydown"
              @focus="inputFocused = true"
              @blur="inputFocused = false"
            >
          </div>

          <v-btn
            v-if="query || pinnedTags.length"
            class="global-search__input-clear"
            icon
            variant="text"
            density="compact"
            size="small"
            tabindex="-1"
            @mousedown.prevent
            @click.stop="clearAllSearch"
          >
            <v-icon size="18">mdi-close</v-icon>
          </v-btn>
        </div>
      </div>

      <v-divider/>

      <v-card-text class="global-search__body pa-0">
        <v-progress-linear
          v-if="loading"
          color="primary"
          indeterminate
          height="2"
        />

        <div
          v-if="!loading && (!hasActiveSearch || !results.length)"
          class="global-search__status text-center text-medium-emphasis py-6 px-4"
        >
          <v-icon
            class="mb-2"
            size="32"
            color="medium-emphasis"
          >
            {{ hasActiveSearch ? 'mdi-file-search-outline' : 'mdi-text-search' }}
          </v-icon>
          <div class="text-caption">
            {{ hasActiveSearch ? t('globalSearch.noResult') : t('globalSearch.startTyping') }}
          </div>
        </div>

        <v-virtual-scroll
          v-if="flatResults.length"
          ref="resultsScroller"
          :items="flatResults"
          :item-height="ROW_HEIGHT"
          :height="resultsScrollHeight"
          :bench="10"
          item-key="id"
          class="virtual-scroller global-search__results"
        >
          <template #default="{ item: row, index }">
            <div
              v-if="row.kind === 'section'"
              class="global-search__section"
              :class="`global-search__section--${row.section}`"
            >
              <div class="global-search__category">
                <v-icon
                  size="16"
                  class="global-search__category-icon"
                >
                  {{ row.section === 'tags' ? 'mdi-tag-multiple-outline' : 'mdi-filter-outline' }}
                </v-icon>
                <span class="global-search__category-title">{{ row.title }}</span>
              </div>
            </div>

            <div
              v-else-if="row.kind === 'header'"
              class="global-search__group-header"
              @click="openGroup(row.group)"
            >
              <div class="global-search__category global-search__category--clickable">
                <v-icon
                  size="16"
                  class="global-search__category-icon"
                >
                  mdi-{{ row.group.icon }}
                </v-icon>
                <span class="global-search__category-title">{{ row.group.name }}</span>
                <v-chip
                  class="ml-2"
                  size="x-small"
                  variant="tonal"
                  color="primary"
                >
                  {{ row.group.data.length }}
                </v-chip>
                <v-spacer/>
                <v-icon
                  size="14"
                  class="text-medium-emphasis"
                >
                  mdi-chevron-right
                </v-icon>
              </div>
            </div>

            <div
              v-else-if="row.kind === 'show-more'"
              class="global-search__show-more d-flex align-center px-3 text-caption"
              :class="{'global-search__item--active': index === selectedIndex}"
              @mouseenter="onItemMouseenter(row, index)"
              @click.stop="expandGroup(row.group.group_id)"
            >
              <v-icon size="14" class="text-medium-emphasis mr-2">mdi-dots-horizontal</v-icon>
              <span>{{ t('globalSearch.showMore', {count: row.hiddenCount}) }}</span>
            </div>

            <div
              v-else
              class="global-search__item d-flex align-center px-3 text-caption"
              :class="{'global-search__item--active': index === selectedIndex}"
              @mouseenter="onItemMouseenter(row, index); showResultHover($event, row)"
              @mouseleave.stop="hideHoverImage"
              @contextmenu="showResultContextMenu($event, row, index)"
              @click="row.group.is_media
                ? openMedia(row.item as GlobalSearchMedia, row.group.mediaTypeId)
                : openTag(row.item as Tag)"
            >
              <template
                v-for="matchedTags in [getMatchedTags(row.item, row.group.is_media)]"
                :key="`${row.id}-matched`"
              >
                <v-icon size="14" class="text-medium-emphasis mr-2">
                  mdi-{{ row.group.is_media ? 'file-outline' : 'tag-outline' }}
                </v-icon>

                <div class="global-search__item-title">
                  <span v-if="matchedTags.length">{{ row.item.name }}</span>
                  <span v-else v-html="getNameHighlighted(row.item.name ?? '')"/>
                  <span
                    v-if="shouldShowMatchedSynonyms(row.item, row.group.is_media)"
                    class="global-search__synonyms text-medium-emphasis ml-1"
                  >
                    <span class="global-search__synonyms-label">{{ t('globalSearch.viaSynonym') }}</span>
                    <span v-html="getNameHighlighted(getMatchedSynonymsText(row.item as GlobalSearchTag))"/>
                  </span>
                  <span
                    v-if="shouldShowMatchedBookmark(row.item)"
                    class="global-search__synonyms text-medium-emphasis ml-1"
                  >
                    <span class="global-search__synonyms-label">{{ t('globalSearch.viaBookmark') }}</span>
                    <span v-html="getNameHighlighted(getMatchedBookmarkText(row.item))"/>
                  </span>
                </div>

                <div
                  v-if="matchedTags.length"
                  class="global-search__matched-tags ml-2"
                >
                  <v-chip
                    size="x-small"
                    variant="tonal"
                    color="primary"
                    prepend-icon="mdi-tag-outline"
                    class="global-search__matched-tag"
                    @click.stop="openMatchedTag(matchedTags[0])"
                  >
                    <span v-html="getNameHighlighted(getMatchedTagChipLabel(matchedTags[0]))"/>
                  </v-chip>
                  <v-chip
                    v-if="matchedTags.length > 1"
                    size="x-small"
                    variant="text"
                    class="global-search__matched-tag-more px-1"
                  >
                    +{{ matchedTags.length - 1 }}
                  </v-chip>
                </div>
              </template>
            </div>
          </template>
        </v-virtual-scroll>
      </v-card-text>

      <v-divider/>

      <v-card-actions class="global-search__footer px-4 py-2 text-caption text-medium-emphasis">
        <v-hotkey keys="esc" variant="flat"/>
        <span class="ml-1">{{ t('globalSearch.hintEsc') }}</span>
        <v-spacer/>
        <v-hotkey keys="up" variant="flat"/>
        <v-hotkey keys="down" variant="flat" class="ml-2"/>
        <span class="ml-1">{{ t('globalSearch.hintArrows') }}</span>
        <v-spacer/>
        <v-hotkey keys="enter" variant="flat"/>
        <span class="ml-1">{{ t('globalSearch.hintEnter') }}</span>
        <template v-if="selectedIsTag">
          <v-spacer/>
          <v-hotkey keys="tab" variant="flat"/>
          <span class="ml-1">{{ t('globalSearch.hintTab') }}</span>
        </template>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.global-search__header {
  position: sticky;
  top: 0;
  z-index: 2;
  background: rgb(var(--v-theme-surface));
}

.global-search__input {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 6px 8px 6px 12px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 999px;
  background: transparent;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  cursor: text;
}

.global-search__input--focused {
  border-color: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 1px rgb(var(--v-theme-primary));
}

.global-search__input-icon {
  flex: 0 0 auto;
}

.global-search__input-body {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.global-search__input-chip {
  max-width: 100%;
}

.global-search__input-chip :deep(.v-chip__content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.global-search__input-text {
  flex: 1 1 120px;
  min-width: 80px;
  height: 28px;
  margin: 0;
  padding: 0 2px;
  border: 0;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: 28px;
}

.global-search__input-clear {
  flex: 0 0 auto;
  align-self: center;
}

.global-search__body {
  min-height: 120px;
}

.global-search__results {
  border-top: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.global-search__results :deep(.v-virtual-scroll__item) {
  border-bottom: thin solid rgba(var(--v-border-color), calc(var(--v-border-opacity) * 0.5));
}

.global-search__section,
.global-search__group-header {
  height: 30px;
  display: flex;
  align-items: center;
  padding: 0 4px;
  background: transparent;
}

.global-search__group-header {
  cursor: pointer;
}

.global-search__category {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 26px;
  margin: 0 4px;
  padding: 0 8px;
  border-radius: 6px;
  background: rgba(var(--v-theme-primary), 0.08);
  border: 1px solid rgba(var(--v-theme-primary), 0.16);
  user-select: none;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.global-search__category--clickable:hover {
  background: rgba(var(--v-theme-primary), 0.14);
  border-color: rgba(var(--v-theme-primary), 0.28);
}

.global-search__category-icon {
  color: rgb(var(--v-theme-primary));
  opacity: 0.9;
}

.global-search__category-title {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.78);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.global-search__item {
  height: 30px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.global-search__item:hover {
  background: rgba(var(--v-theme-primary), 0.06);
}

.global-search__item--active {
  background: rgba(var(--v-theme-primary), 0.12);
}

.global-search__item--active:hover {
  background: rgba(var(--v-theme-primary), 0.14);
}

.global-search__show-more {
  height: 30px;
  font-size: 0.75rem;
  cursor: pointer;
  color: rgb(var(--v-theme-primary));
  transition: background-color 0.15s ease;
}

.global-search__show-more:hover {
  background: rgba(var(--v-theme-primary), 0.06);
}

.global-search__item-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.global-search__matched-tags {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  max-width: 42%;
}

.global-search__matched-tag {
  max-width: 100%;
}

.global-search__matched-tag :deep(.v-chip__content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.global-search__matched-tag-more {
  min-width: 0;
  opacity: 0.8;
}

.global-search__item-title :deep(.global-search__hl) {
  background: rgba(var(--v-theme-primary), 0.22);
  color: inherit;
  font-weight: 700;
  border-radius: 2px;
  padding: 0 1px;
}

.global-search__matched-tag :deep(.global-search__hl) {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  font-weight: 700;
  border-radius: 3px;
  padding: 0 3px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

.global-search__synonyms-label {
  opacity: 0.72;
  margin-right: 0.25rem;
}

.global-search__footer {
  position: sticky;
  bottom: 0;
  background: rgb(var(--v-theme-surface));
}
</style>
