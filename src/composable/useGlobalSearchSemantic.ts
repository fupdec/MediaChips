import {ref, computed, type Ref, type ComputedRef} from 'vue'
import {useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {getDefaultMediaTypeId} from '@/utils/mediaType'
import {useLibraryHealthFixQueue, type LibraryHealthFixStage} from '@/composable/useLibraryHealthFixQueue'
import {VISUAL_SEARCH_QUICK_SAMPLE_SIZE} from '@shared/visualSearchQuick'
import type {Locale} from '@/utils/translate'

export type SemanticHealth = {
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

/** Visual/CLIP search health panel, setup wizard shortcuts, and semantic examples. */
export function useGlobalSearchSemantic(deps: {
  dialog: Ref<boolean>
  query: Ref<string>
  loading: Ref<boolean>
  hasActiveSearch: ComputedRef<boolean>
  searchSemantic: () => void | Promise<void>
}) {
  const {t, locale} = useI18n()
  const router = useRouter()
  const app = useAppStore()
  const itemsStore = useItemsStore()
  const healthFix = useLibraryHealthFixQueue()

  const semanticHealth = ref<SemanticHealth | null>(null)

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
    !deps.loading.value
    && !deps.hasActiveSearch.value
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
    && !deps.hasActiveSearch.value
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
    && !deps.hasActiveSearch.value
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
    deps.query.value = String(example || '').trim()
    if (!deps.query.value) return
    void deps.searchSemantic()
  }

  function resolveSemanticMediaTypeId() {
    const fromEnv = Number(itemsStore.environment?.media_type_id)
    if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv
    return getDefaultMediaTypeId(app.mediaTypes) ?? null
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
    deps.dialog.value = false
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
    deps.dialog.value = false
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

  return {
    healthFix,
    semanticHealth,
    semanticModelReady,
    semanticHasPreviews,
    semanticHasIndex,
    semanticPendingCount,
    semanticIndexComplete,
    semanticChecklist,
    semanticTranslatedCaption,
    semanticEmptyHint,
    semanticExamples,
    semanticSetupIncomplete,
    showSemanticExamples,
    visualSetupHintDismissed,
    showSemanticHealthSetupHint,
    showSemanticHealthSearchStatus,
    showSemanticHealthPanel,
    showVisualSetupHintRestore,
    dismissVisualSetupHint,
    restoreVisualSetupHint,
    runSemanticExample,
    resolveSemanticMediaTypeId,
    refreshSemanticHealth,
    openSemanticSettings,
    resolveVisualSearchSetupStages,
    runVisualSearchSetup,
    setupVisualSearchFull,
    setupVisualSearchQuick,
    enableSceneJump,
    visualSearchQuickSampleSize,
  }
}
