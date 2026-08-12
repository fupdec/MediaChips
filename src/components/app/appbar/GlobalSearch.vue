<script setup lang="ts">
import {ref, computed, nextTick, onMounted, onBeforeUnmount, watch, triggerRef} from 'vue'
import {useRouter} from 'vue-router'
import {useHotkey} from 'vuetify'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {registerAppShellHandler} from '@/composable/appShell'
import AppBarButton from '@/components/app/appbar/AppBarButton.vue'
import GlobalSearchCommands from '@/components/app/appbar/GlobalSearchCommands.vue'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {usePlayerStore} from '@/stores/player'
import {useContextMenu} from '@/stores/contextMenu'
import {useImageViewerStore} from '@/stores/imageViewer'
import {useSettingsStore} from '@/stores/settings'
import {useNotificationsStore} from '@/stores/notifications'
import useItemContextMenu from '@/composable/ItemContextMenu'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import {getDefaultMediaTypeId, isVideoMediaType} from '@/utils/mediaType'
import {resolveOpenMediaKind} from '@/utils/openMediaKind'
import {openTextMedia} from '@/utils/openTextMedia'
import {useOpenMediaList} from '@/utils/openMediaList'
import {highlightGlobalSearchText, textMatchesGlobalSearchQuery} from '@/services/formatUtils'
import {debounce} from '@/utils/debounce'
import {hideHoverImage, showHoverImage} from '@/services/hoverService'
import {checkFileExists} from '@/services/fileService'
import {setNotification} from '@/services/notificationService'
import {
  formatNlMixSeekTime,
  nlMixSourceMessageKey,
  playNlPlaylistMix,
  resolveNlPlaylistMix,
  saveNlPlaylistMix,
} from '@/services/nlPlaylistMix'
import {
  hasUsableSceneSeek,
  pickFirstSeekableInTopN,
} from '@/services/semanticScenePlay'
import {
  useLibraryHealthFixQueue,
  type LibraryHealthFixStage,
} from '@/composable/useLibraryHealthFixQueue'
import {VISUAL_SEARCH_QUICK_SAMPLE_SIZE} from '@shared/visualSearchQuick'
import type { ContextMenuEntry, MediaItem, Meta, Tag } from '@/types/stores'
import type {Locale} from '@/utils/translate'
import type {CommandPaletteCommand} from '@/composable/commandPaletteCommands'

type MatchedSearchTag = {
  id: number
  name: string
  metaId?: number | null
  matchSource?: 'name' | 'synonym' | 'bookmark' | 'both'
  matchedSynonyms?: string[]
  matchedBookmark?: string
}

type GlobalSearchMedia = MediaItem & {
  matchSource?: 'name' | 'tag' | 'bookmark' | 'content' | 'both'
  matchedTags?: MatchedSearchTag[]
  matchedBookmark?: string
  matchedContent?: string
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

const {t, locale} = useI18n()
const router = useRouter()
const {openMediaList} = useOpenMediaList()

const app = useAppStore()
const itemsStore = useItemsStore()
const playerStore = usePlayerStore()
const imageViewerStore = useImageViewerStore()
const contextMenuStore = useContextMenu()
const settingsStore = useSettingsStore()
const healthFix = useLibraryHealthFixQueue()

type SemanticHealth = {
  modelStatus: string
  indexedCount: number
  previewCandidatesCount: number
  missingEmbeddingsCount: number
  seekableCount?: number
  searched: boolean
  failed: boolean
  translated: boolean
  searchQuery: string
  originalQuery: string
}

const semanticHealth = ref<SemanticHealth | null>(null)
const mixBusy = ref(false)

const semanticModelReady = computed(() =>
  ['downloaded', 'loaded', 'ready'].includes(String(semanticHealth.value?.modelStatus || '')),
)

const semanticHasPreviews = computed(() =>
  Number(semanticHealth.value?.previewCandidatesCount || 0) > 0,
)

const semanticHasIndex = computed(() =>
  Number(semanticHealth.value?.indexedCount || 0) > 0,
)

const semanticPendingCount = computed(() =>
  Math.max(0, Number(semanticHealth.value?.missingEmbeddingsCount || 0)),
)

const semanticIndexComplete = computed(() =>
  semanticHasIndex.value && semanticPendingCount.value === 0,
)

const semanticChecklist = computed(() => {
  const health = semanticHealth.value
  if (!health) return []
  const modelStatus = String(health.modelStatus || '')
  const modelOk = semanticModelReady.value
  const modelText = modelOk
    ? t('globalSearch.health_model_ok')
    : modelStatus === 'error'
      ? t('globalSearch.health_model_error')
      : modelStatus === 'loading'
        ? t('globalSearch.health_model_loading')
        : t('globalSearch.health_model_missing')
  const pending = semanticPendingCount.value
  return [
    {
      id: 'model',
      ok: modelOk,
      text: modelText,
    },
    {
      id: 'previews',
      ok: semanticHasPreviews.value,
      text: semanticHasPreviews.value
        ? t('globalSearch.health_previews_ok', {count: health.previewCandidatesCount})
        : t('globalSearch.health_previews_missing'),
    },
    {
      id: 'index',
      ok: semanticIndexComplete.value,
      text: semanticHasIndex.value
        ? pending > 0
          ? t('globalSearch.health_index_partial', {
            count: health.indexedCount,
            pending,
          })
          : t('globalSearch.health_index_ok', {count: health.indexedCount})
        : t('globalSearch.health_index_missing', {pending}),
    },
    {
      id: 'translate',
      ok: true,
      text: t('globalSearch.health_translate_hint'),
    },
  ]
})

const semanticTranslatedCaption = computed(() => {
  const health = semanticHealth.value
  if (!health?.translated || !health.searchQuery) return ''
  return t('globalSearch.searched_as', {query: health.searchQuery})
})

const semanticEmptyHint = computed(() => {
  if (!semanticHealth.value?.searched) return ''
  if (semanticHealth.value.failed) return t('globalSearch.health_failed')
  if (!semanticModelReady.value) return t('globalSearch.health_hint_model')
  if (!semanticHasPreviews.value) return t('globalSearch.health_hint_previews')
  if (!semanticHasIndex.value) return t('globalSearch.health_hint_index')
  if (semanticPendingCount.value > 0) {
    return t('globalSearch.health_hint_index_partial', {pending: semanticPendingCount.value})
  }
  return t('globalSearch.health_hint_no_match')
})

const semanticExamples = computed(() => [
  t('globalSearch.example_rain'),
  t('globalSearch.example_portrait'),
  t('globalSearch.example_neon'),
])

const semanticSetupIncomplete = computed(() =>
  Boolean(semanticHealth.value)
  && (
    !semanticModelReady.value
    || !semanticHasPreviews.value
    || !semanticHasIndex.value
    || semanticPendingCount.value > 0
  ),
)

const showSemanticExamples = computed(() =>
  !loading.value
  && !hasActiveSearch.value
  && !semanticHealth.value?.searched
  && !semanticSetupIncomplete.value,
)

const VISUAL_SETUP_HINT_DISMISS_KEY = 'mediachips.globalSearch.dismissVisualSetupHint'

function readVisualSetupHintDismissed(): boolean {
  try {
    return localStorage.getItem(VISUAL_SETUP_HINT_DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

const visualSetupHintDismissed = ref(readVisualSetupHintDismissed())

const showSemanticHealthSetupHint = computed(() =>
  semanticSetupIncomplete.value
  && !hasActiveSearch.value
  && !semanticHealth.value?.searched
  && !visualSetupHintDismissed.value,
)

const showSemanticHealthSearchStatus = computed(() =>
  Boolean(semanticChecklist.value.length)
  && Boolean(semanticHealth.value?.searched),
)

const showSemanticHealthPanel = computed(() =>
  showSemanticHealthSearchStatus.value || showSemanticHealthSetupHint.value,
)

const showVisualSetupHintRestore = computed(() =>
  semanticSetupIncomplete.value
  && !hasActiveSearch.value
  && !semanticHealth.value?.searched
  && visualSetupHintDismissed.value,
)

function dismissVisualSetupHint() {
  visualSetupHintDismissed.value = true
  try {
    localStorage.setItem(VISUAL_SETUP_HINT_DISMISS_KEY, '1')
  } catch {
    // ignore quota / private mode
  }
}

function restoreVisualSetupHint() {
  visualSetupHintDismissed.value = false
  try {
    localStorage.removeItem(VISUAL_SETUP_HINT_DISMISS_KEY)
  } catch {
    // ignore
  }
}

function runSemanticExample(example: string) {
  query.value = String(example || '').trim()
  if (!query.value) return
  void searchSemantic()
}

function resolveSemanticMediaTypeId() {
  const fromEnv = Number(itemsStore.environment?.media_type_id)
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv
  return getDefaultMediaTypeId(mediaTypes.value) ?? null
}

async function refreshSemanticHealth(partial?: Partial<SemanticHealth>) {
  const previous = semanticHealth.value
  try {
    // Use CLIP *embedding* backfill status (includes modelStatus), not the
    // video-tagger clipModelStatus endpoint which is a different pipeline.
    const backfillRes = await typedApi.getBackfillStatus('clipEmbedding')
    semanticHealth.value = {
      modelStatus: String(
        backfillRes.data?.modelStatus
        || previous?.modelStatus
        || 'unknown',
      ),
      indexedCount: Number(backfillRes.data?.hashed ?? previous?.indexedCount ?? 0),
      previewCandidatesCount: Number(backfillRes.data?.total ?? previous?.previewCandidatesCount ?? 0),
      missingEmbeddingsCount: Number(backfillRes.data?.pending ?? previous?.missingEmbeddingsCount ?? 0),
      searched: false,
      failed: false,
      translated: false,
      searchQuery: '',
      originalQuery: '',
      ...partial,
      ...(partial?.indexedCount != null ? {indexedCount: partial.indexedCount} : {}),
      ...(partial?.previewCandidatesCount != null
        ? {previewCandidatesCount: partial.previewCandidatesCount}
        : {}),
      ...(partial?.missingEmbeddingsCount != null
        ? {missingEmbeddingsCount: partial.missingEmbeddingsCount}
        : {}),
      ...(partial?.modelStatus != null ? {modelStatus: partial.modelStatus} : {}),
    }
  } catch (error) {
    console.error(error)
    semanticHealth.value = {
      modelStatus: previous?.modelStatus || 'error',
      indexedCount: previous?.indexedCount ?? 0,
      previewCandidatesCount: previous?.previewCandidatesCount ?? 0,
      missingEmbeddingsCount: previous?.missingEmbeddingsCount ?? 0,
      searched: Boolean(partial?.searched ?? previous?.searched),
      failed: partial?.failed ?? true,
      translated: previous?.translated ?? false,
      searchQuery: previous?.searchQuery || '',
      originalQuery: previous?.originalQuery || '',
      ...partial,
    }
  }
}

function openSemanticSettings() {
  dialog.value = false
  void router.push({
    path: '/settings',
    query: {
      tab: 'database',
      section: 'library_health_guide',
      wizardStep: 'search',
    },
  })
}

function resolveVisualSearchSetupStages(): LibraryHealthFixStage[] {
  // Grid generation also writes CLIP embeddings for those videos.
  return ['grid', 'clip']
}

async function runVisualSearchSetup(options: {
  stages: LibraryHealthFixStage[]
  titleKey: string
  doneKey: string
  titleParams?: Record<string, string | number>
  doneParams?: Record<string, string | number>
  mediaIds?: number[]
  doneActions?: Array<{
    id: string
    text: string
    icon?: string
    action: () => void
    hide?: boolean
  }>
}) {
  if (healthFix.state.value.running) return
  dialog.value = false
  const ok = await healthFix.runStages(
    options.stages,
    String(locale.value || 'en') as Locale,
    {
      titleKey: options.titleKey,
      doneKey: options.doneKey,
      titleParams: options.titleParams,
      doneParams: options.doneParams,
      mediaIds: options.mediaIds,
      doneActions: options.doneActions,
    },
  )
  if (ok) await refreshSemanticHealth()
}

async function setupVisualSearchFull() {
  if (!semanticModelReady.value) {
    openSemanticSettings()
    return
  }
  await runVisualSearchSetup({
    stages: resolveVisualSearchSetupStages(),
    titleKey: 'globalSearch.setup_visual_search_full',
    doneKey: 'globalSearch.setup_visual_search_full_done',
  })
}

async function setupVisualSearchQuick() {
  if (!semanticModelReady.value) {
    openSemanticSettings()
    return
  }
  if (healthFix.state.value.running) return

  let mediaIds: number[] = []
  try {
    const sampleRes = await typedApi.getVisualSearchQuickSample(VISUAL_SEARCH_QUICK_SAMPLE_SIZE)
    mediaIds = Array.isArray(sampleRes.data?.ids)
      ? sampleRes.data.ids.map(Number).filter((id) => Number.isFinite(id) && id > 0)
      : []
  } catch (error) {
    console.error(error)
  }

  if (!mediaIds.length) {
    // Nothing pending in the sample — offer full library instead.
    await setupVisualSearchFull()
    return
  }

  const count = mediaIds.length
  await runVisualSearchSetup({
    stages: resolveVisualSearchSetupStages(),
    titleKey: 'globalSearch.setup_visual_search_quick',
    doneKey: 'globalSearch.setup_visual_search_quick_done',
    titleParams: {count},
    doneParams: {count},
    mediaIds,
    doneActions: [
      {
        id: 'visual-search-full',
        text: t('globalSearch.setup_visual_search_full'),
        icon: 'database-sync-outline',
        action: () => { void setupVisualSearchFull() },
        hide: true,
      },
    ],
  })
}

async function enableSceneJump() {
  await setupVisualSearchQuick()
}

const visualSearchQuickSampleSize = VISUAL_SEARCH_QUICK_SAMPLE_SIZE
const meta = computed(() => app.meta)
const mediaTypes = computed(() => app.mediaTypes)

const dialog = ref(false)
const paletteMode = ref<'search' | 'commands'>('search')
const query = ref('')
const loading = ref(false)
const results = ref<SearchGroup[]>([])
const expandedGroupIds = ref<Set<string>>(new Set())
const searchInput = ref<HTMLInputElement | null>(null)
const commandsPanel = ref<{
  moveActive: (delta: number) => void
  runActive: () => Promise<void>
  resetActive: () => void
} | null>(null)
const resultsScroller = ref<{ scrollToIndex: (index: number) => void } | null>(null)
const selectedIndex = ref(-1)
const pinnedTags = ref<PinnedSearchTag[]>([])
const inputFocused = ref(false)
const localAiReady = ref(false)
const aiBusy = ref(false)
const aiExplanation = ref('')
const aiError = ref('')

const isCommandsMode = computed(() => paletteMode.value === 'commands')
const isSearchMode = computed(() => paletteMode.value === 'search')

const inputPlaceholder = computed(() => {
  if (isCommandsMode.value) return t('commandPalette.placeholder')
  return pinnedTags.value.length ? '' : t('globalSearch.enterUnified')
})

const headerTitle = computed(() =>
  isCommandsMode.value ? t('commandPalette.title') : t('appbar.globalSearch'),
)

let abortController: AbortController | null = null
let aiAbortController: AbortController | null = null
let aiCaptionTimer: ReturnType<typeof setTimeout> | null = null
let pendingNavigation: (() => void) | null = null
const RESULT_LIMIT = 50
const SEMANTIC_RESULT_LIMIT = 500
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

const canRunSemanticOnEnter = computed(() =>
  !loading.value
  && Boolean(query.value.trim())
  && !results.value.length
  && !pinnedTags.value.length
  && !semanticHealth.value?.searched,
)

function openInMode(mode: 'search' | 'commands') {
  const switching = dialog.value && paletteMode.value !== mode
  paletteMode.value = mode
  dialog.value = true
  if (!switching) {
    query.value = ''
    pinnedTags.value = []
    results.value = []
    semanticHealth.value = null
    aiExplanation.value = ''
    aiError.value = ''
    clearHighlightCache()
    selectedIndex.value = -1
  }
  commandsPanel.value?.resetActive()
  focusSearchField()
  if (mode === 'search') {
    void refreshSemanticHealth()
    void refreshLocalAiReady()
  }
}

function showSearch() {
  openInMode('search')
}

function showCommands() {
  openInMode('commands')
}

function toggleCommands() {
  if (dialog.value && isCommandsMode.value) {
    dialog.value = false
    return
  }
  showCommands()
}

function setPaletteMode(mode: 'search' | 'commands') {
  if (paletteMode.value === mode) return
  paletteMode.value = mode
  query.value = ''
  pinnedTags.value = []
  results.value = []
  semanticHealth.value = null
  aiExplanation.value = ''
  aiError.value = ''
  clearHighlightCache()
  selectedIndex.value = -1
  commandsPanel.value?.resetActive()
  focusSearchField()
  if (mode === 'search') {
    void refreshSemanticHealth()
    void refreshLocalAiReady()
  }
}

function onModeToggle(mode: unknown) {
  if (mode === 'search' || mode === 'commands') setPaletteMode(mode)
}

function toggleSearch() {
  if (dialog.value && isSearchMode.value) {
    dialog.value = false
    return
  }
  showSearch()
}

async function onCommandRun(command: CommandPaletteCommand) {
  dialog.value = false
  await command.run()
}

useHotkey('slash', () => {
  if (playerStore.active) return
  if (dialog.value && isSearchMode.value) {
    dialog.value = false
    return
  }
  openInMode('search')
})

function isLocalAiStatusReady(status: {
  enabled?: boolean | string | number
  status?: string
}) {
  const enabled = status.enabled === true
    || status.enabled === 1
    || status.enabled === '1'
    || status.enabled === 'true'
  return enabled && ['downloaded', 'loaded'].includes(String(status.status || ''))
}

async function refreshLocalAiReady() {
  try {
    const status = (await typedApi.getLocalAiStatus()).data
    localAiReady.value = isLocalAiStatusReady(status)
  } catch {
    localAiReady.value = false
  }
}

function stripAiPrefix(raw: string): string {
  return String(raw || '').replace(/^(ai|ии)\s*:\s*/i, '').trim()
}

function flashAiCaption(text: string, isError = false) {
  if (aiCaptionTimer != null) {
    clearTimeout(aiCaptionTimer)
    aiCaptionTimer = null
  }
  if (isError) {
    aiError.value = text
    aiExplanation.value = ''
  } else {
    aiExplanation.value = text
    aiError.value = ''
  }
  aiCaptionTimer = setTimeout(() => {
    aiExplanation.value = ''
    aiError.value = ''
    aiCaptionTimer = null
  }, 3500)
}

async function runAiInterpret() {
  const raw = query.value.trim()
  const q = stripAiPrefix(raw)
  if (!q || aiBusy.value) return

  await refreshLocalAiReady()
  if (!localAiReady.value) {
    flashAiCaption(t('globalSearch.ai_not_ready'), true)
    return
  }

  aiBusy.value = true
  aiError.value = ''
  aiExplanation.value = t('globalSearch.ai_loading')
  aiAbortController?.abort()
  aiAbortController = new AbortController()

  try {
    let applied = false
    await typedApi.streamLocalAiChat(
      {
        mode: 'search',
        locale: String(locale.value || 'en'),
        messages: [{role: 'user', content: q}],
        context: {q},
      },
      aiAbortController.signal,
      (event) => {
        if (event.type === 'done') {
          const parsed = event.parsed || null
          const tagIds = Array.isArray(parsed?.tagIds)
            ? parsed.tagIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
            : []
          const tagNames = Array.isArray(parsed?.tags)
            ? parsed.tags.map((name) => String(name || '').trim()).filter(Boolean)
            : []
          const residual = String(parsed?.query ?? '').trim()
          const explanation = String(parsed?.explanation || '').trim()

          if (!tagIds.length && !residual && !explanation) {
            flashAiCaption(t('globalSearch.ai_failed'), true)
            return
          }

          const nextPins: PinnedSearchTag[] = []
          for (let i = 0; i < tagIds.length; i += 1) {
            const id = tagIds[i]!
            if (nextPins.some((pin) => pin.id === id)) continue
            nextPins.push({
              id,
              name: tagNames[i] || `#${id}`,
              metaId: null,
            })
          }
          // Keep previously pinned tags and append new ones.
          const merged = [...pinnedTags.value]
          for (const pin of nextPins) {
            if (!merged.some((entry) => entry.id === pin.id)) merged.push(pin)
          }
          pinnedTags.value = merged
          query.value = residual
          applied = true
          flashAiCaption(explanation || t('globalSearch.ai_applied'))
          void search()
        }
        if (event.type === 'error') {
          flashAiCaption(event.message || t('globalSearch.ai_failed'), true)
        }
        if (event.type === 'aborted' && !applied) {
          aiExplanation.value = ''
        }
      },
    )
  } catch (error) {
    if ((error as Error)?.name !== 'AbortError') {
      flashAiCaption(t('globalSearch.ai_failed'), true)
    }
  } finally {
    aiBusy.value = false
  }
}

let unregisterShowGlobalSearch: (() => void) | null = null
let unregisterShowCommandPalette: (() => void) | null = null
let unregisterToggleCommandPalette: (() => void) | null = null

onMounted(() => {
  unregisterShowGlobalSearch = registerAppShellHandler('showGlobalSearch', showSearch)
  unregisterShowCommandPalette = registerAppShellHandler('showCommandPalette', showCommands)
  unregisterToggleCommandPalette = registerAppShellHandler('toggleCommandPalette', toggleCommands)
})

onBeforeUnmount(() => {
  unregisterShowGlobalSearch?.()
  unregisterShowGlobalSearch = null
  unregisterShowCommandPalette?.()
  unregisterShowCommandPalette = null
  unregisterToggleCommandPalette?.()
  unregisterToggleCommandPalette = null
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
  paletteMode.value = 'search'
  commandsPanel.value?.resetActive()
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
    matchSource?: 'name' | 'tag' | 'bookmark' | 'content' | 'both'
    matchedBookmark?: string
    matchedContent?: string
    matchedTags?: MatchedSearchTag[]
  }>,
): GlobalSearchMedia[] {
  return items.map((item) => ({
    ...item,
    name: item.name ?? undefined,
    matchedBookmark: item.matchedBookmark || undefined,
    matchedContent: item.matchedContent || undefined,
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

async function searchSemantic() {
  const q = query.value.trim()
  if (!q) {
    results.value = []
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
    const mediaTypeId = resolveSemanticMediaTypeId()
    const searchRes = await typedApi.semanticSearch({
      query: q,
      mediaTypeId,
      limit: SEMANTIC_RESULT_LIMIT,
      locale: settingsStore.locale || 'en',
    })

    if (signal.aborted) return

    const ids = Array.isArray(searchRes.data?.ids)
      ? searchRes.data.ids.map(Number).filter((id) => Number.isFinite(id) && id > 0)
      : []

    const hitTimes = new Map<number, number>()
    const hitTiles = new Map<number, number>()
    for (const hit of Array.isArray(searchRes.data?.hits) ? searchRes.data.hits : []) {
      const id = Number(hit?.id)
      if (!Number.isFinite(id) || id <= 0) continue
      const time = Number(hit?.time)
      if (Number.isFinite(time) && time >= 0) {
        hitTimes.set(id, time)
      }
      const tileIndex = Number(hit?.tileIndex)
      if (Number.isFinite(tileIndex) && tileIndex >= 0) {
        hitTiles.set(id, tileIndex)
      }
    }

    const seekableCount = Number(
      searchRes.data?.seekableCount
      ?? [...hitTimes.values()].filter((time) => hasUsableSceneSeek(time)).length,
    )

    semanticHealth.value = {
      modelStatus: String(searchRes.data?.modelStatus || semanticHealth.value?.modelStatus || 'unknown'),
      indexedCount: Number(searchRes.data?.indexedCount ?? semanticHealth.value?.indexedCount ?? 0),
      previewCandidatesCount: Number(
        searchRes.data?.previewCandidatesCount
        ?? semanticHealth.value?.previewCandidatesCount
        ?? 0,
      ),
      missingEmbeddingsCount: Number(
        searchRes.data?.missingEmbeddingsCount
        ?? semanticHealth.value?.missingEmbeddingsCount
        ?? 0,
      ),
      seekableCount,
      searched: true,
      failed: Boolean(searchRes.data?.error),
      translated: Boolean(searchRes.data?.translated),
      searchQuery: String(searchRes.data?.searchQuery || q),
      originalQuery: String(searchRes.data?.originalQuery || q),
    }

    if (searchRes.data?.error) {
      console.error('Semantic search error:', searchRes.data.error)
      return
    }

    if (!ids.length) return

    dialog.value = false
    const scopeLabel = String(
      searchRes.data?.translated
        ? (searchRes.data?.originalQuery || q)
        : (searchRes.data?.searchQuery || q),
    ).trim()

    const basicsRes = await typedApi.getMediaBasics({ids})
    if (signal.aborted) return

    const basicsById = new Map<number, MediaItem>()
    for (const item of Array.isArray(basicsRes.data?.items) ? basicsRes.data.items : []) {
      const id = Number(item?.id)
      if (Number.isFinite(id) && id > 0) basicsById.set(id, item as MediaItem)
    }

    const playlist = ids
      .map((id) => {
        const item = basicsById.get(id)
        if (!item) return null
        const type = mediaTypes.value.find((entry) => entry.id === Number(item.mediaTypeId))
        if (!isVideoMediaType(type)) return null
        const time = hitTimes.get(id)
        const tileIndex = hitTiles.get(id)
        return {
          ...item,
          ...(time != null ? {segmentStart: time} : {}),
          ...(tileIndex != null ? {semanticTileIndex: tileIndex} : {}),
        } as MediaItem
      })
      .filter((item): item is MediaItem => Boolean(item?.path))

    const showAllMatches = () => {
      void openMediaList({
        mediaTypeId: mediaTypeId ?? undefined,
        ids,
        scope: {
          kind: 'semantic',
          label: scopeLabel || q,
        },
      })
    }

    if (!playlist.length) {
      await openMediaList({
        mediaTypeId: mediaTypeId ?? undefined,
        ids,
        scope: {
          kind: 'semantic',
          label: scopeLabel || q,
        },
      })
      return
    }

    const first = pickFirstSeekableInTopN(playlist, 5).item || playlist[0]
    const seekTime = Number(first.segmentStart)
    const hasSeek = hasUsableSceneSeek(seekTime)
    const queryLabel = scopeLabel || q

    const playMatchingScene = async () => {
      const ok = await itemsStore.playVideo({
        video: first,
        time: hasSeek ? seekTime : 0,
        videos: playlist,
        trustPath: true,
        player: 'builtin',
      })
      // Same file already open: force an explicit seek in the builtin player.
      if (ok && hasSeek && Number(playerStore.media?.id) === Number(first.id)) {
        await nextTick()
        playerStore.playerJumpTo(seekTime)
      }
      return ok
    }

    const markSceneJumpDone = (notificationId?: number) => {
      if (notificationId == null || !hasSeek) return
      useNotificationsStore().updateNotification(notificationId, {
        title: t('globalSearch.scene_play_jumped_title'),
        text: t('globalSearch.scene_play_jumped_query', {
          time: formatSceneSeekTime(seekTime),
          query: queryLabel,
        }),
        icon: 'check-circle-outline',
      })
    }

    const played = await playMatchingScene()

    const notificationActions = [
      ...(hasSeek
        ? [{
          id: 'jump-to-scene',
          text: t('globalSearch.scene_play_jump', {time: formatSceneSeekTime(seekTime)}),
          icon: 'skip-forward',
          action: async (notification: {id?: number}) => {
            const ok = await playMatchingScene()
            if (ok) markSceneJumpDone(notification?.id)
          },
          hide: false,
        }]
        : []),
      {
        id: 'show-semantic-matches',
        text: t('globalSearch.scene_play_show_all'),
        icon: 'view-grid-outline',
        action: showAllMatches,
        hide: true,
      },
    ]
    if (!hasSeek || seekableCount <= 0) {
      notificationActions.push({
        id: 'enable-scene-jump',
        text: t('globalSearch.enable_scene_jump'),
        icon: 'image-multiple-outline',
        action: () => { void enableSceneJump() },
        hide: true,
      })
    }

    const notificationId = setNotification({
      type: 'success',
      title: played && hasSeek
        ? t('globalSearch.scene_play_jumped_title')
        : t('globalSearch.scene_play_title'),
      text: hasSeek
        ? (
          played
            ? t('globalSearch.scene_play_jumped_query', {
              time: formatSceneSeekTime(seekTime),
              query: queryLabel,
            })
            : t('globalSearch.scene_play_text_at_query', {
              time: formatSceneSeekTime(seekTime),
              query: queryLabel,
            })
        )
        : (
          seekableCount <= 0
            ? t('globalSearch.scene_play_text_no_seek')
            : t('globalSearch.scene_play_text')
        ),
      icon: played && hasSeek ? 'check-circle-outline' : 'play-circle-outline',
      timeout: 12000,
      click: async () => {
        const ok = await playMatchingScene()
        if (ok) markSceneJumpDone(notificationId)
      },
      actions: notificationActions,
    })
  } catch (e: unknown) {
    const err = e as {code?: string; name?: string}
    if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return
    console.error(e)
    await refreshSemanticHealth({searched: true, failed: true})
  } finally {
    if (!signal.aborted) loading.value = false
  }
}

async function playAsMix() {
  const q = query.value.trim()
  if (!q || mixBusy.value) return

  mixBusy.value = true
  try {
    const mix = await resolveNlPlaylistMix(q, {
      mediaTypeId: resolveSemanticMediaTypeId(),
    })
    if (!mix.videos.length) {
      setNotification({
        type: 'info',
        title: t('globalSearch.play_mix'),
        text: t('playlists.mix_empty'),
      })
      return
    }

    dialog.value = false

    const {played, seekTime} = await playNlPlaylistMix(mix)
    if (!played) {
      setNotification({
        type: 'error',
        title: t('globalSearch.play_mix'),
        text: t('playlists.preparing_playback_failed'),
      })
      return
    }

    setNotification({
      type: 'success',
      title: t('globalSearch.play_mix'),
      text: [
        t(`playlists.${nlMixSourceMessageKey(mix.source)}`),
        seekTime > 0
          ? t('playlists.mix_playing_at', {count: mix.videos.length, time: formatNlMixSeekTime(seekTime)})
          : t('playlists.mix_playing', {count: mix.videos.length}),
      ].join(' · '),
      icon: 'playlist-music',
      timeout: 10000,
      actions: [
        {
          id: 'nl-mix-show-list',
          text: t('playlists.mix_show_list'),
          icon: 'view-grid-outline',
          action: () => {
            void openMediaList({
              mediaTypeId: resolveSemanticMediaTypeId() ?? undefined,
              ids: mix.ids,
              filters: mix.filters.length ? mix.filters : undefined,
              scope: {kind: 'semantic', label: mix.phrase},
            })
          },
          hide: true,
        },
        {
          id: 'nl-mix-save',
          text: t('playlists.mix_save'),
          icon: 'content-save-outline',
          action: async () => {
            try {
              const saved = await saveNlPlaylistMix(mix)
              setNotification({
                type: 'success',
                title: t('playlists.mix_save'),
                text: saved.kind === 'smart'
                  ? t('playlists.mix_saved_smart', {name: saved.name})
                  : t('playlists.mix_saved_static', {name: saved.name}),
              })
            } catch (error) {
              setNotification({
                type: 'error',
                title: t('playlists.mix_save'),
                text: error instanceof Error ? error.message : String(error),
              })
            }
          },
          hide: true,
        },
      ],
    })
  } catch (error) {
    console.error('Play as mix failed:', error)
    setNotification({
      type: 'error',
      title: t('globalSearch.play_mix'),
      text: error instanceof Error ? error.message : String(error),
    })
  } finally {
    mixBusy.value = false
  }
}

function formatSceneSeekTime(seconds: number): string {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
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
  if (isCommandsMode.value) return

  if (semanticHealth.value?.searched) {
    semanticHealth.value = {
      ...semanticHealth.value,
      searched: false,
      failed: false,
    }
  }

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
    const kind = resolveOpenMediaKind(type, {path: media.path})

    if (kind === 'view-image') {
      itemsStore.viewImage({image: media})
    } else if (kind === 'play-av') {
      itemsStore.playVideo({video: media})
    } else if (kind === 'preview-text' || kind === 'open-path') {
      openTextMedia(media)
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
  aiAbortController?.abort()
  aiBusy.value = false
  aiExplanation.value = ''
  aiError.value = ''
  runSearch.cancel()
  results.value = []
  resetExpandedGroups()
  clearHighlightCache()
  loading.value = false
  selectedIndex.value = -1
  focusSearchField()
}

function onSearchKeydown(e: KeyboardEvent) {
  if (isCommandsMode.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      commandsPanel.value?.moveActive(1)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      commandsPanel.value?.moveActive(-1)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      void commandsPanel.value?.runActive()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      setPaletteMode('search')
      return
    }
    return
  }

  if (e.key === 'Escape' && aiBusy.value) {
    e.preventDefault()
    e.stopPropagation()
    aiAbortController?.abort()
    aiBusy.value = false
    aiExplanation.value = ''
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    moveSelection(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    moveSelection(-1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    // Explicit AI prefix: interpret then search (does not use debounce).
    if (/^(ai|ии)\s*:/i.test(query.value.trim())) {
      void runAiInterpret()
      return
    }
    // ⌘/Ctrl+Enter always runs semantic search.
    if (e.metaKey || e.ctrlKey) {
      void searchSemantic()
      return
    }
    // Shift+Enter plays a hybrid NL mix (filters + CLIP).
    if (e.shiftKey && query.value.trim()) {
      void playAsMix()
      return
    }
    // No text hits — Enter runs semantic search on the query.
    if (
      !loading.value
      && query.value.trim()
      && !results.value.length
      && !pinnedTags.value.length
    ) {
      void searchSemantic()
      return
    }
    openSelectedResult()
  } else if (e.key === 'Tab') {
    e.preventDefault()
    if (selectedIsTag.value) {
      pinSelectedTag()
      return
    }
    // Switch to commands when no tag to pin.
    if (!query.value.trim()) {
      setPaletteMode('commands')
      return
    }
    // No tag to pin — semantic search on the current query.
    if (query.value.trim()) void searchSemantic()
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
    targetItemId: Number(item.id) || null,
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

function getMatchedContentText(item: GlobalSearchMedia | GlobalSearchTag): string {
  if (!('matchedContent' in item)) return ''
  const content = (item as GlobalSearchMedia).matchedContent
  return typeof content === 'string' ? content : ''
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

function shouldShowMatchedContent(item: GlobalSearchMedia | GlobalSearchTag): boolean {
  return Boolean(getMatchedContentText(item))
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
            <div class="text-h6 text-truncate">{{ headerTitle }}</div>
            <v-chip
              v-if="isSearchMode && hasActiveSearch && !loading && totalResults > 0"
              size="small"
              variant="tonal"
              color="primary"
              class="flex-shrink-0"
            >
              {{ totalResults }}
            </v-chip>
          </div>
          <div class="d-flex align-center ga-2 flex-shrink-0">
            <v-btn-toggle
              :model-value="paletteMode"
              mandatory
              density="compact"
              variant="outlined"
              divided
              class="global-search__mode-toggle"
              @update:model-value="onModeToggle"
            >
              <v-btn value="search" size="small">
                <v-icon start size="16">mdi-magnify</v-icon>
                {{ t('globalSearch.modeSearch') }}
              </v-btn>
              <v-btn value="commands" size="small">
                <v-icon start size="16">mdi-console-line</v-icon>
                {{ t('globalSearch.modeCommands') }}
              </v-btn>
            </v-btn-toggle>
            <v-hotkey :keys="isCommandsMode ? 'meta+k' : 'slash'" variant="flat"/>
          </div>
        </div>

        <div
          class="global-search__input"
          :class="{'global-search__input--focused': inputFocused}"
          @mousedown="onInputShellMouseDown"
        >
          <v-icon class="global-search__input-icon text-medium-emphasis" size="20">
            {{ isCommandsMode ? 'mdi-console-line' : 'mdi-magnify' }}
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
              :placeholder="inputPlaceholder"
              @input="onQueryInput"
              @keydown="onSearchKeydown"
              @focus="inputFocused = true"
              @blur="inputFocused = false"
            >
          </div>

          <v-btn
            v-if="isSearchMode && query.trim()"
            class="global-search__input-semantic"
            variant="tonal"
            color="primary"
            density="compact"
            size="small"
            rounded="pill"
            tabindex="-1"
            prepend-icon="mdi-brain"
            @mousedown.prevent
            @click.stop="searchSemantic"
          >
            {{ t('globalSearch.findScene') }}
            <v-tooltip activator="parent" location="top">
              {{ t('globalSearch.findSceneTip') }}
            </v-tooltip>
          </v-btn>

          <v-btn
            v-if="isSearchMode && (localAiReady || aiBusy)"
            class="global-search__input-ai"
            icon
            variant="text"
            density="compact"
            size="small"
            :loading="aiBusy"
            :disabled="aiBusy || !query.trim()"
            tabindex="-1"
            @mousedown.prevent
            @click.stop="runAiInterpret"
          >
            <v-icon size="18">mdi-creation-outline</v-icon>
            <v-tooltip activator="parent" location="top">
              {{ t('globalSearch.ai_tip') }}
            </v-tooltip>
          </v-btn>

          <v-btn
            v-if="isSearchMode && query.trim()"
            class="global-search__input-mix"
            icon
            variant="text"
            density="compact"
            size="small"
            :loading="mixBusy"
            :disabled="mixBusy"
            tabindex="-1"
            @mousedown.prevent
            @click.stop="playAsMix"
          >
            <v-icon size="18">mdi-playlist-music</v-icon>
            <v-tooltip activator="parent" location="top">
              {{ t('globalSearch.play_mix') }}
            </v-tooltip>
          </v-btn>

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

        <div
          v-if="isSearchMode && (aiExplanation || aiError)"
          class="global-search__ai-caption text-caption px-1 pt-2"
          :class="aiError ? 'text-error' : 'text-medium-emphasis'"
        >
          {{ aiError || aiExplanation }}
        </div>
      </div>

      <v-divider/>

      <GlobalSearchCommands
        v-if="isCommandsMode"
        ref="commandsPanel"
        :query="query"
        @run="onCommandRun"
      />

      <v-card-text v-else class="global-search__body pa-0">
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
            {{
              semanticHealth?.searched
                ? 'mdi-brain'
                : (hasActiveSearch ? 'mdi-file-search-outline' : 'mdi-text-search')
            }}
          </v-icon>
          <div class="text-caption mb-3">
            <template v-if="semanticHealth?.searched">
              {{ semanticEmptyHint || t('globalSearch.noResult') }}
            </template>
            <template v-else>
              {{
                hasActiveSearch
                  ? t('globalSearch.noResult')
                  : t('globalSearch.startTypingUnified')
              }}
            </template>
          </div>
          <div
            v-if="semanticTranslatedCaption"
            class="text-caption text-medium-emphasis mb-3"
          >
            {{ semanticTranslatedCaption }}
          </div>

          <div
            v-if="showSemanticExamples"
            class="global-search__examples mb-3"
          >
            <div class="text-caption text-medium-emphasis mb-2">
              {{ t('globalSearch.examples_label') }}
            </div>
            <div class="global-search__examples-row">
              <v-chip
                v-for="example in semanticExamples"
                :key="example"
                size="small"
                variant="tonal"
                color="primary"
                class="global-search__example-chip"
                prepend-icon="mdi-brain"
                @click="runSemanticExample(example)"
              >
                {{ example }}
              </v-chip>
            </div>
          </div>

          <div
            v-if="query.trim() && !semanticHealth?.searched"
            class="mb-3 d-flex flex-wrap justify-center ga-2"
          >
            <v-btn
              size="small"
              color="primary"
              variant="tonal"
              prepend-icon="mdi-brain"
              @click="searchSemantic"
            >
              {{ t('globalSearch.findScene') }}
            </v-btn>
            <v-btn
              size="small"
              color="primary"
              variant="flat"
              prepend-icon="mdi-playlist-music"
              :loading="mixBusy"
              :disabled="mixBusy"
              @click="playAsMix"
            >
              {{ t('globalSearch.play_mix') }}
            </v-btn>
          </div>

          <div
            v-if="showVisualSetupHintRestore"
            class="global-search__health-restore text-center mt-2"
          >
            <v-btn
              size="x-small"
              variant="text"
              color="primary"
              prepend-icon="mdi-brain"
              @click="restoreVisualSetupHint"
            >
              {{ t('globalSearch.health_setup_show') }}
            </v-btn>
          </div>

          <div
            v-if="showSemanticHealthPanel"
            class="global-search__health text-left mx-auto"
          >
            <div
              v-if="!semanticHealth?.searched"
              class="global-search__health-title-row"
            >
              <div class="global-search__health-title text-caption font-weight-medium">
                {{ t('globalSearch.health_setup_title') }}
              </div>
              <v-btn
                class="global-search__health-dismiss"
                icon
                variant="text"
                density="compact"
                size="x-small"
                tabindex="-1"
                :aria-label="t('globalSearch.health_setup_dismiss')"
                @click="dismissVisualSetupHint"
              >
                <v-icon size="16">mdi-close</v-icon>
                <v-tooltip activator="parent" location="top">
                  {{ t('globalSearch.health_setup_dismiss') }}
                </v-tooltip>
              </v-btn>
            </div>
            <div class="global-search__health-list">
              <div
                v-for="item in semanticChecklist"
                :key="item.id"
                class="global-search__health-row"
              >
                <v-icon
                  size="14"
                  :color="item.ok ? 'success' : 'warning'"
                >
                  {{ item.ok ? 'mdi-check-circle' : 'mdi-alert-circle-outline' }}
                </v-icon>
                <span class="text-caption">{{ item.text }}</span>
              </div>
            </div>
            <div
              v-if="!semanticHasIndex || !semanticModelReady || !semanticHasPreviews || semanticPendingCount > 0"
              class="global-search__health-actions"
            >
              <v-btn
                size="x-small"
                color="primary"
                variant="flat"
                :loading="healthFix.state.value.running"
                :disabled="healthFix.state.value.running"
                @click="setupVisualSearchQuick"
              >
                {{ t('globalSearch.setup_visual_search_quick', {count: visualSearchQuickSampleSize}) }}
              </v-btn>
              <v-btn
                size="x-small"
                color="primary"
                variant="tonal"
                :loading="healthFix.state.value.running"
                :disabled="healthFix.state.value.running"
                @click="setupVisualSearchFull"
              >
                {{ t('globalSearch.setup_visual_search_full') }}
              </v-btn>
              <v-btn
                size="x-small"
                variant="text"
                @click="openSemanticSettings"
              >
                {{ t('globalSearch.open_semantic_settings') }}
              </v-btn>
            </div>
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
                  <span
                    v-if="shouldShowMatchedContent(row.item)"
                    class="global-search__synonyms text-medium-emphasis ml-1"
                  >
                    <span class="global-search__synonyms-label">{{ t('globalSearch.viaContent') }}</span>
                    <span v-html="getNameHighlighted(getMatchedContentText(row.item))"/>
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
        <template v-if="isCommandsMode">
          <v-hotkey keys="esc" variant="flat"/>
          <span class="ml-1">{{ t('commandPalette.footer_close') }}</span>
          <v-spacer/>
          <v-hotkey keys="up" variant="flat"/>
          <v-hotkey keys="down" variant="flat" class="ml-2"/>
          <span class="ml-1">{{ t('commandPalette.footer_nav') }}</span>
          <v-spacer/>
          <v-hotkey keys="enter" variant="flat"/>
          <span class="ml-1">{{ t('commandPalette.footer_run') }}</span>
          <v-spacer/>
          <v-hotkey keys="tab" variant="flat"/>
          <span class="ml-1">{{ t('globalSearch.hintSwitchSearch') }}</span>
        </template>
        <template v-else>
          <v-hotkey keys="esc" variant="flat"/>
          <span class="ml-1">{{ t('globalSearch.hintEsc') }}</span>
          <v-spacer/>
          <v-hotkey keys="up" variant="flat"/>
          <v-hotkey keys="down" variant="flat" class="ml-2"/>
          <span class="ml-1">{{ t('globalSearch.hintArrows') }}</span>
          <v-spacer/>
          <v-hotkey keys="enter" variant="flat"/>
          <span class="ml-1">{{
            canRunSemanticOnEnter
              ? t('globalSearch.hintEnterSemantic')
              : t('globalSearch.hintEnter')
          }}</span>
          <template v-if="selectedIsTag">
            <v-spacer/>
            <v-hotkey keys="tab" variant="flat"/>
            <span class="ml-1">{{ t('globalSearch.hintTab') }}</span>
          </template>
          <template v-else-if="query.trim() && !canRunSemanticOnEnter">
            <v-spacer/>
            <v-hotkey keys="meta+enter" variant="flat"/>
            <span class="ml-1">{{ t('globalSearch.hintEnterSemantic') }}</span>
            <v-spacer/>
            <v-hotkey keys="tab" variant="flat"/>
            <span class="ml-1">{{ t('globalSearch.hintTabSemantic') }}</span>
            <v-spacer/>
            <v-hotkey keys="shift+enter" variant="flat"/>
            <span class="ml-1">{{ t('globalSearch.hintPlayMix') }}</span>
          </template>
          <template v-else-if="canRunSemanticOnEnter">
            <v-spacer/>
            <v-hotkey keys="shift+enter" variant="flat"/>
            <span class="ml-1">{{ t('globalSearch.hintPlayMix') }}</span>
          </template>
          <template v-else-if="!query.trim()">
            <v-spacer/>
            <v-hotkey keys="tab" variant="flat"/>
            <span class="ml-1">{{ t('globalSearch.hintSwitchCommands') }}</span>
          </template>
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

.global-search__mode-toggle {
  flex: 0 0 auto;
}

.global-search__health {
  max-width: 420px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.global-search__health-title {
  margin-bottom: 4px;
  line-height: 1.25;
}

.global-search__health-title-row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin-bottom: 4px;
}

.global-search__health-title-row .global-search__health-title {
  flex: 1 1 auto;
  margin-bottom: 0;
  min-width: 0;
}

.global-search__health-dismiss {
  flex: 0 0 auto;
  margin-top: -2px;
  margin-right: -4px;
  opacity: 0.65;
}

.global-search__health-dismiss:hover {
  opacity: 1;
}

.global-search__health-restore {
  margin-inline: auto;
}

.global-search__health-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.global-search__health-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  line-height: 1.25;
}

.global-search__health-row .v-icon {
  flex: 0 0 auto;
  margin-top: 1px;
}

.global-search__health-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
}

.global-search__input-semantic {
  border-radius: 999px !important;
  flex: 0 0 auto;
}

.global-search__examples {
  max-width: 440px;
  margin-inline: auto;
}

.global-search__examples-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}

.global-search__example-chip {
  max-width: 100%;
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
