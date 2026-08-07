<template>
  <div
    class="local-ai-assist"
    :class="{'local-ai-assist--filter': mode === 'filter'}"
  >
    <div
      class="local-ai-assist__bar"
      :class="{'local-ai-assist__bar--filter': mode === 'filter'}"
    >
      <v-text-field
        v-if="mode === 'filter'"
        ref="goalField"
        v-model="goal"
        class="local-ai-assist__goal"
        density="compact"
        variant="outlined"
        rounded="pill"
        hide-details
        clearable
        :placeholder="t('settings_labels.local_ai.assist_filter_goal')"
        :disabled="busy"
        @keyup.enter="runFromEnter"
        @keydown.meta.enter.prevent="runApplyEnter"
        @keydown.ctrl.enter.prevent="runApplyEnter"
      />

      <div class="local-ai-assist__actions d-flex flex-nowrap ga-2 align-center">
        <v-btn
          v-if="!busy"
          size="small"
          color="primary"
          rounded
          class="local-ai-assist__run"
          :class="{'local-ai-assist__run--ready': ready}"
          :variant="ready ? 'flat' : 'outlined'"
          :disabled="runDisabled"
          @click.stop.prevent="run"
        >
          <v-icon icon="mdi-robot-outline" start/>
          {{ t('settings_labels.local_ai.assist') }}
        </v-btn>
        <v-btn
          v-else
          size="small"
          color="error"
          rounded
          variant="flat"
          class="local-ai-assist__run"
          @click.stop.prevent="stop"
        >
          <v-icon icon="mdi-stop" start/>
          {{ t('settings_labels.local_ai.chat_stop') }}
        </v-btn>
        <slot name="actions" />
        <v-btn
          size="small"
          variant="text"
          color="primary"
          class="local-ai-assist__docs-link px-1"
          @click.stop.prevent="openDocs"
        >
          <v-icon icon="mdi-help-circle-outline" start size="16"/>
          {{ docsLinkLabel }}
        </v-btn>
        <span v-if="!ready" class="text-caption text-medium-emphasis local-ai-assist__hint">
          <template v-if="mode === 'filter'">
            {{ t('settings_labels.local_ai.assist_local_hint') }}
          </template>
          <template v-else>
            {{ notReadyText }}
          </template>
          <button
            type="button"
            class="local-ai-assist__settings-link"
            @click="openSettings"
          >
            {{ t('settings_labels.local_ai.open_settings') }}
          </button>
        </span>
        <span v-else-if="runDisabled && runHint" class="text-caption text-medium-emphasis local-ai-assist__hint">
          {{ runHint }}
        </span>
      </div>
    </div>

    <div
      v-if="mode === 'filter' && !busy && !suggestion"
      class="local-ai-assist__examples"
    >
      <button
        v-for="example in filterExamples"
        :key="example"
        type="button"
        class="local-ai-assist__example"
        :title="t('settings_labels.local_ai.assist_ex_hint')"
        @click="runExample(example)"
      >
        {{ example }}
      </button>
      <button
        v-if="canUndo"
        type="button"
        class="local-ai-assist__example local-ai-assist__example--undo"
        @click="emit('undo')"
      >
        {{ t('settings_labels.local_ai.assist_undo') }}
      </button>
    </div>

    <div
      v-else-if="mode === 'filter' && canUndo && !busy"
      class="local-ai-assist__examples"
    >
      <button
        type="button"
        class="local-ai-assist__example local-ai-assist__example--undo"
        @click="emit('undo')"
      >
        {{ t('settings_labels.local_ai.assist_undo') }}
      </button>
    </div>

    <v-alert
      v-if="error"
      type="error"
      variant="tonal"
      density="compact"
      rounded="lg"
      class="mb-2 text-caption"
    >
      {{ error }}
    </v-alert>

    <v-card
      v-if="suggestion || busy"
      variant="outlined"
      rounded="lg"
      class="pa-3 mb-2 local-ai-assist__card"
    >
      <div class="d-flex align-center justify-space-between ga-2 mb-2">
        <div class="d-flex align-center ga-2 min-width-0">
          <div class="text-caption text-medium-emphasis">
            {{ busy ? t('settings_labels.local_ai.assist_busy') : t('settings_labels.local_ai.assist_preview') }}
          </div>
          <span
            v-if="!busy && suggestion?.local && !suggestion?.partial"
            class="local-ai-assist__instant"
          >
            {{ t('settings_labels.local_ai.assist_instant') }}
          </span>
          <span
            v-else-if="!busy && suggestion?.local && suggestion?.partial"
            class="local-ai-assist__instant local-ai-assist__instant--partial"
          >
            {{ t('settings_labels.local_ai.assist_partial') }}
          </span>
        </div>
        <v-btn
          v-if="mode !== 'regex' && suggestion && !busy"
          icon
          size="x-small"
          variant="text"
          :title="t('common.close')"
          @click="discard"
        >
          <v-icon size="16">mdi-close</v-icon>
        </v-btn>
      </div>

      <template v-if="!busy && suggestion">
        <template v-if="mode === 'regex'">
          <div v-if="suggestedPattern" class="mb-2">
            <div class="text-caption text-medium-emphasis">{{ t('settings_labels.local_ai.assist_pattern') }}</div>
            <code class="local-ai-assist__code selectable">{{ suggestedPattern }}</code>
          </div>
          <div v-if="suggestedReplace" class="mb-2">
            <div class="text-caption text-medium-emphasis">{{ t('settings_labels.local_ai.assist_replace') }}</div>
            <code class="local-ai-assist__code selectable">{{ suggestedReplace }}</code>
          </div>
          <div v-if="explanation" class="text-body-2">
            {{ explanation }}
          </div>
          <div v-else class="text-caption text-medium-emphasis">
            {{ t('settings_labels.local_ai.assist_regex_hint') }}
          </div>
        </template>
        <div v-else class="local-ai-assist__response">
          <div
            v-if="resultSummary && !suggestion?.local"
            class="mb-2 selectable"
          >
            {{ resultSummary }}
          </div>

          <div
            v-if="resultFilters.length"
            class="local-ai-assist__filters mb-2"
          >
            <div
              v-for="(item, index) in resultFilters"
              :key="index"
              class="local-ai-assist__filter-chip"
            >
              <code>{{ formatFilterPreview(item) }}</code>
            </div>
          </div>

          <div
            v-if="suggestion?.local && suggestion?.partial && suggestion?.residual"
            class="text-caption text-medium-emphasis mb-2"
          >
            {{ t('settings_labels.local_ai.assist_partial_hint') }}
            <span class="selectable">«{{ suggestion.residual }}»</span>
          </div>

          <ul v-if="resultSuggestions.length && !suggestion?.local" class="local-ai-assist__suggestions mb-2">
            <li v-for="(item, index) in resultSuggestions" :key="index" class="selectable">
              {{ item }}
            </li>
          </ul>
          <div
            v-if="explanation && explanation !== resultSummary && !suggestion?.local"
            class="selectable"
          >
            {{ explanation }}
          </div>
        </div>
      </template>

      <div
        v-if="(mode === 'regex' || mode === 'filter') && suggestion && !busy"
        class="d-flex flex-wrap ga-2 mt-3"
      >
        <v-btn
          v-if="mode === 'filter' && resultFilters.length"
          size="small"
          color="primary"
          rounded
          variant="flat"
          @click="apply(true, true)"
        >
          {{ t('settings_labels.local_ai.assist_apply_run') }}
        </v-btn>
        <v-btn
          size="small"
          color="primary"
          rounded
          :variant="mode === 'filter' && resultFilters.length ? 'tonal' : 'flat'"
          :disabled="mode === 'regex' ? !suggestedPattern : !resultFilters.length"
          @click="apply(false)"
        >
          {{ t('settings_labels.local_ai.assist_apply') }}
        </v-btn>
        <v-btn size="small" rounded variant="text" @click="discard">
          {{ t('settings_labels.local_ai.assist_discard') }}
        </v-btn>
      </div>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRouter} from 'vue-router'
import {typedApi} from '@/services/typedApi'
import {useSettingsStore} from '@/stores/settings'
import {useAppShell} from '@/composable/appShell'
import {buildLocalFilterAssistSuggestion} from '@shared/localAiAssistFilterGoal'
import {isLocalAiFilterExamplePreset} from '@shared/localAiAssistFilterExamples'

const props = withDefaults(defineProps<{
  mode: 'regex' | 'filter' | 'meta'
  prompt: string
  context?: Record<string, unknown>
  /**
   * Optional gate from the parent (e.g. regex builder needs a goal/sample).
   * Default true: Vue Boolean props become false when omitted, which would
   * permanently disable the filters AI button.
   */
  canRun?: boolean
  runHint?: string
  /** When true, re-check Local AI readiness (e.g. filters panel opened). */
  active?: boolean
  /** Parent can restore filters from the last AI apply. */
  canUndo?: boolean
}>(), {
  canRun: true,
  active: false,
  canUndo: false,
})

const emit = defineEmits<{
  apply: [value: Record<string, unknown>]
  undo: []
}>()

const {t, locale} = useI18n()
const router = useRouter()
const settingsStore = useSettingsStore()
const appShell = useAppShell()
const goalField = ref<{focus?: () => void} | null>(null)

function focusGoalField() {
  if (props.mode !== 'filter') return
  void nextTick(() => {
    goalField.value?.focus?.()
  })
}
const assistLocale = computed(() =>
  String(settingsStore.locale || locale.value || 'en'),
)
const ready = ref(false)
const modelOnDisk = ref(false)
const busy = ref(false)
const error = ref('')
const suggestion = ref<Record<string, unknown> | null>(null)
const explanation = ref('')
const goal = ref('')
let abortController: AbortController | null = null

const docsId = computed(() => {
  if (props.mode === 'filter') return 'ui.filters.local_ai'
  return 'settings.general.local_ai'
})

const docsLinkLabel = computed(() => (
  ready.value
    ? t('settings_labels.local_ai.assist_docs')
    : t('settings_labels.local_ai.assist_docs_setup')
))

const notReadyText = computed(() => (
  modelOnDisk.value
    ? t('settings_labels.local_ai.not_ready_enable')
    : t('settings_labels.local_ai.not_ready')
))

const runDisabled = computed(() => props.canRun === false)

function openDocs() {
  // When not ready, open setup article; otherwise open mode-specific help.
  const id = ready.value ? docsId.value : 'settings.general.local_ai'
  appShell.showDocumentation(id)
}

async function openSettings() {
  await router.push({path: '/settings', query: {tab: 'general', section: 'local_ai'}})
}

const RECENT_GOALS_KEY = 'mediachips.localAi.filterGoals'
const RECENT_GOALS_LIMIT = 5

function loadRecentGoals(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_GOALS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => String(item || '').trim()).filter(Boolean).slice(0, RECENT_GOALS_LIMIT)
  } catch {
    return []
  }
}

function rememberGoal(text: string) {
  const goalText = text.trim()
  // Preset chips are locale strings — do not persist them as "recent" (avoids
  // showing Russian examples after switching the UI to English, etc.).
  if (!goalText || isLocalAiFilterExamplePreset(goalText)) return
  const next = [goalText, ...loadRecentGoals().filter((item) => item !== goalText)]
    .slice(0, RECENT_GOALS_LIMIT)
  try {
    localStorage.setItem(RECENT_GOALS_KEY, JSON.stringify(next))
  } catch {
    // ignore quota / private mode
  }
  recentGoals.value = next
}

function sanitizeRecentGoals (): string[] {
  const cleaned = loadRecentGoals().filter((item) => !isLocalAiFilterExamplePreset(item))
  try {
    localStorage.setItem(RECENT_GOALS_KEY, JSON.stringify(cleaned))
  } catch {
    // ignore quota / private mode
  }
  return cleaned
}

const recentGoals = ref<string[]>(sanitizeRecentGoals())

const filterExamples = computed(() => {
  // Recompute when UI language changes so chips follow locales.
  void locale.value

  const fields = Array.isArray(props.context?.availableFields) ? props.context.availableFields : []
  const hasParam = (param: string) => fields.some((field) => {
    if (!field || typeof field !== 'object') return false
    return String((field as Record<string, unknown>).param) === param
  })

  const dynamic: string[] = []
  if (hasParam('time')) dynamic.push(t('settings_labels.local_ai.assist_ex_resume'))
  if (hasParam('createdAt')) dynamic.push(t('settings_labels.local_ai.assist_ex_added'))
  if (hasParam('duration')) dynamic.push(t('settings_labels.local_ai.assist_ex_duration'))
  if (hasParam('height')) dynamic.push(t('settings_labels.local_ai.assist_ex_hd'))
  if (hasParam('views')) dynamic.push(t('settings_labels.local_ai.assist_ex_views'))
  if (hasParam('codec')) dynamic.push(t('settings_labels.local_ai.assist_ex_codec'))
  const tagsField = fields.find((field) => {
    if (!field || typeof field !== 'object') return false
    const row = field as Record<string, unknown>
    return String(row.type) === 'array' && /tags?/i.test(String(row.name || ''))
  }) as Record<string, unknown> | undefined
  if (tagsField?.name) {
    dynamic.push(t('settings_labels.local_ai.assist_ex_empty_meta', {field: String(tagsField.name)}))
  }

  const recentCustom = recentGoals.value.filter((item) => !isLocalAiFilterExamplePreset(item))

  const ordered = [
    ...recentCustom,
    t('settings_labels.local_ai.assist_ex_unwatched'),
    t('settings_labels.local_ai.assist_ex_favorite'),
    ...dynamic,
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean)

  const unique: string[] = []
  for (const item of ordered) {
    if (!unique.includes(item)) unique.push(item)
  }
  return unique.slice(0, 6)
})

const fieldLabelByParam = computed(() => {
  const map = new Map<string, string>()
  const fields = Array.isArray(props.context?.availableFields) ? props.context.availableFields : []
  for (const field of fields) {
    if (!field || typeof field !== 'object') continue
    const row = field as Record<string, unknown>
    if (row.param == null) continue
    const label = String(row.name || row.param).trim()
    if (label) map.set(String(row.param), label)
  }
  return map
})

async function runExample(example: string) {
  goal.value = example
  await run({autoApplyRun: true})
}

function stop() {
  abortController?.abort()
  abortController = null
  busy.value = false
}

const suggestedPattern = computed(() => String(suggestion.value?.pattern || '').trim())
const suggestedReplace = computed(() => String(suggestion.value?.replace || '').trim())
const resultSummary = computed(() => String(suggestion.value?.summary || '').trim())
const resultSuggestions = computed(() => {
  const items = suggestion.value?.suggestions
  if (!Array.isArray(items)) return [] as string[]
  return items.map((item) => String(item || '').trim()).filter(Boolean)
})
const resultFilters = computed(() => {
  const items = suggestion.value?.filters
  if (!Array.isArray(items)) return [] as Array<Record<string, unknown>>
  return items.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>
})

function formatBytes(value: number): string {
  if (value >= 1024 ** 3) return `${(value / (1024 ** 3)).toFixed(value % (1024 ** 3) === 0 ? 0 : 1)} GB`
  if (value >= 1024 ** 2) return `${(value / (1024 ** 2)).toFixed(value % (1024 ** 2) === 0 ? 0 : 1)} MB`
  if (value >= 1024) return `${Math.round(value / 1024)} KB`
  return `${value} B`
}

function formatDuration(seconds: number): string {
  if (seconds >= 3600) {
    const hours = seconds / 3600
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`
  }
  if (seconds >= 60) {
    const mins = seconds / 60
    return `${Number.isInteger(mins) ? mins : mins.toFixed(1)} min`
  }
  return `${seconds} s`
}

function formatResumeTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatFilterPreview(item: Record<string, unknown>) {
  const paramKey = String(item.param ?? '')
  const label = fieldLabelByParam.value.get(paramKey) || paramKey
  const cond = String(item.cond ?? '')
  const type = String(item.type ?? '')
  const val = item.val
  if (type === 'boolean') {
    return cond === '!=' ? `${label} = no` : `${label} = yes`
  }
  if (cond === 'is null' || cond === 'not null') return `${label} ${cond}`
  if (Array.isArray(val)) return `${label} ${cond} [${val.join(', ')}]`
  if (paramKey === 'filesize' && typeof val === 'number') {
    return `${label} ${cond} ${formatBytes(val)}`
  }
  if (paramKey === 'duration' && typeof val === 'number') {
    return `${label} ${cond} ${formatDuration(val)}`
  }
  if (paramKey === 'time' && typeof val === 'number') {
    if (val === 0 && (cond === '>' || cond === '=')) {
      return cond === '>' ? `${label} > 0` : `${label} = 0`
    }
    return `${label} ${cond} ${formatResumeTime(val)}`
  }
  if (paramKey === 'bitrate' && typeof val === 'number') {
    if (val >= 1000) return `${label} ${cond} ${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)} Mbps`
    return `${label} ${cond} ${val} kbps`
  }
  return `${label} ${cond} ${val ?? ''}`.trim()
}

function isStatusReady(status: {
  enabled?: boolean | string | number
  status?: string
  downloaded?: boolean
}) {
  const enabled = status.enabled === true
    || status.enabled === 1
    || status.enabled === '1'
    || status.enabled === 'true'
  // When Local AI is off the API reports status "disabled" even if the file exists.
  return enabled && ['downloaded', 'loaded'].includes(String(status.status || ''))
}

function isModelOnDisk(status: {
  status?: string
  downloaded?: boolean
}) {
  if (status.downloaded === true) return true
  return ['downloaded', 'loaded', 'error'].includes(String(status.status || ''))
}

async function refreshReady() {
  try {
    const status = (await typedApi.getLocalAiStatus()).data
    ready.value = isStatusReady(status)
    modelOnDisk.value = isModelOnDisk(status)
  } catch {
    ready.value = false
  }
}

function discard() {
  suggestion.value = null
  explanation.value = ''
  error.value = ''
}

function buildAssistContext(goalText = goal.value.trim()): Record<string, unknown> {
  const rawContext = props.context || {}
  let context: Record<string, unknown> = {}
  try {
    context = JSON.parse(JSON.stringify(rawContext)) as Record<string, unknown>
  } catch {
    context = {
      pageType: rawContext.pageType,
      mediaKind: rawContext.mediaKind,
      today: rawContext.today,
      availableFields: rawContext.availableFields,
      conditionsByType: rawContext.conditionsByType,
      currentFilters: rawContext.currentFilters,
    }
  }
  if (goalText) context.goal = goalText
  return context
}

function updateLiveLocalPreview(goalText: string) {
  if (props.mode !== 'filter' || busy.value) return
  const text = goalText.trim()
  if (!text) {
    if (suggestion.value?.local) discard()
    return
  }
  // Don't overwrite a model result the user is reviewing.
  if (suggestion.value && !suggestion.value.local) return

  const local = buildLocalFilterAssistSuggestion(buildAssistContext(text), {allowPartial: true})
  if (local) {
    suggestion.value = local
    explanation.value = String(local.explanation || '').trim()
    error.value = ''
  } else if (suggestion.value?.local) {
    discard()
  }
}

let livePreviewTimer: ReturnType<typeof setTimeout> | null = null
watch(goal, (value) => {
  if (props.mode !== 'filter') return
  if (livePreviewTimer != null) clearTimeout(livePreviewTimer)
  livePreviewTimer = setTimeout(() => {
    livePreviewTimer = null
    updateLiveLocalPreview(String(value || ''))
  }, 180)
})

async function runFromEnter() {
  if (props.mode === 'filter' && goal.value.trim()) {
    const local = buildLocalFilterAssistSuggestion(buildAssistContext())
    if (local && !local.partial) {
      await run({autoApplyRun: true})
      return
    }
  }
  await run()
}

async function runApplyEnter() {
  if (props.mode !== 'filter' || busy.value) return
  if (resultFilters.value.length) {
    apply(true, true)
    return
  }
  await runFromEnter()
}

function apply(run = false, replace = false) {
  if (!suggestion.value) return
  if (props.mode === 'regex' && !suggestedPattern.value) {
    error.value = t('settings_labels.local_ai.assist_bad_regex')
    return
  }
  if (props.mode === 'filter' && !resultFilters.value.length) {
    error.value = t('settings_labels.local_ai.assist_bad_filters')
    return
  }
  if (props.mode === 'filter' && goal.value.trim()) {
    rememberGoal(goal.value)
  }
  emit('apply', {
    ...suggestion.value,
    ...(props.mode === 'filter' && run ? {run: true} : {}),
    ...(props.mode === 'filter' && replace ? {replace: true} : {}),
  })
  if (props.mode === 'filter' && run) {
    goal.value = ''
  }
  discard()
}

async function run(options: {autoApplyRun?: boolean} = {}) {
  if (busy.value || runDisabled.value) return

  error.value = ''
  explanation.value = ''

  const goalText = goal.value.trim()
  const context = buildAssistContext(goalText)

  // Instant local path — full goals work even before the model is ready.
  if (props.mode === 'filter' && goalText) {
    const localFull = buildLocalFilterAssistSuggestion(context)
    if (localFull && !localFull.partial) {
      suggestion.value = localFull
      explanation.value = String(localFull.explanation || '').trim()
      if (options.autoApplyRun) {
        apply(true, true)
      }
      return
    }

    const localPartial = buildLocalFilterAssistSuggestion(context, {allowPartial: true})
    if (localPartial) {
      suggestion.value = localPartial
      explanation.value = String(localPartial.explanation || '').trim()
    } else {
      suggestion.value = null
    }
  } else {
    suggestion.value = null
  }

  // Always re-check: the panel often stays mounted while Local AI is enabled later.
  await refreshReady()
  if (!ready.value) {
    if (suggestion.value?.local && suggestion.value?.partial) {
      error.value = t('settings_labels.local_ai.assist_partial_hint')
      return
    }
    error.value = notReadyText.value
    return
  }
  busy.value = true
  abortController = new AbortController()

  const userContent = props.mode === 'filter' && goalText
    ? goalText
    : props.prompt

  try {
    await typedApi.streamLocalAiChat(
      {
        mode: props.mode,
        locale: assistLocale.value,
        messages: [{role: 'user', content: userContent || 'Help me with filters.'}],
        context,
      },
      abortController.signal,
      (event) => {
        if (event.type === 'done') {
          const parsed = event.parsed || null
          if (props.mode === 'regex' && looksLikeEchoedContext(parsed)) {
            suggestion.value = null
            error.value = t('settings_labels.local_ai.assist_bad_regex')
            explanation.value = String(parsed?.explanation || '')
            return
          }
          if (props.mode !== 'regex' && !hasAdvisoryResult(parsed)) {
            suggestion.value = null
            error.value = t('settings_labels.local_ai.assist_bad_result')
            return
          }
          suggestion.value = parsed
          explanation.value = String(parsed?.explanation || '').trim()
          if (options.autoApplyRun && props.mode === 'filter' && Array.isArray(parsed?.filters) && parsed.filters.length) {
            apply(true, true)
          }
        }
        if (event.type === 'error') {
          error.value = event.message || t('common.error')
        }
      },
    )
  } catch (err) {
    if ((err as Error)?.name !== 'AbortError') {
      error.value = err instanceof Error ? err.message : String(err)
    }
  } finally {
    busy.value = false
    abortController = null
  }
}

function looksLikeEchoedContext(parsed: Record<string, unknown> | null): boolean {
  if (!parsed) return true
  const pattern = String(parsed.pattern || '').trim()
  if (!pattern) return true
  // Absolute paths / full path templates are not usable short regex sources.
  if (/^(\/Users\/|\/home\/|[A-Za-z]:[\\/])/.test(pattern)) return true
  if (/^\/Media\//.test(pattern)) return true
  const unescaped = pattern.replace(/\\(.)/g, '$1')
  if (/^(\/Users\/|\/home\/|\/Media\/|[A-Za-z]:[\\/])/.test(unescaped)) return true
  const slashCount = (unescaped.match(/\//g) || []).length
  if (slashCount >= 2 && unescaped.length > 24) return true
  return false
}

function hasAdvisoryResult(parsed: Record<string, unknown> | null): boolean {
  if (!parsed) return false
  const summary = String(parsed.summary || '').trim()
  const explanationText = String(parsed.explanation || '').trim()
  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions.map((item) => String(item || '').trim()).filter(Boolean)
    : []
  const filters = Array.isArray(parsed.filters) ? parsed.filters : []
  return Boolean(summary || explanationText || suggestions.length || filters.length)
}

let readyPollTimer: ReturnType<typeof setInterval> | null = null

function stopReadyPoll() {
  if (readyPollTimer != null) {
    clearInterval(readyPollTimer)
    readyPollTimer = null
  }
}

function startReadyPoll() {
  if (readyPollTimer != null || ready.value) return
  readyPollTimer = setInterval(() => {
    void refreshReady()
  }, 2500)
}

function onWindowFocus() {
  void refreshReady()
}

onMounted(() => {
  busy.value = false
  void refreshReady()
  window.addEventListener('focus', onWindowFocus)
  if (props.active !== false) focusGoalField()
})

onBeforeUnmount(() => {
  stop()
  stopReadyPoll()
  if (livePreviewTimer != null) clearTimeout(livePreviewTimer)
  window.removeEventListener('focus', onWindowFocus)
})

watch(ready, (isReady) => {
  if (isReady) stopReadyPoll()
  else startReadyPoll()
}, {immediate: true})

watch(
  () => props.active,
  (isActive) => {
    if (isActive === false) {
      stop()
      return
    }
    busy.value = false
    void refreshReady()
    focusGoalField()
  },
)
</script>

<style scoped>
.local-ai-assist {
  position: relative;
  z-index: 2;
  pointer-events: auto;
  min-width: 0;
}
.local-ai-assist__bar {
  margin-bottom: 8px;
}
.local-ai-assist__bar--filter {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin-bottom: 0;
}
.local-ai-assist__examples {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0 0;
}
.local-ai-assist__example {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  background: rgba(var(--v-theme-surface), 1);
  color: rgba(var(--v-theme-on-surface), 0.72);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 0.7rem;
  line-height: 1.4;
  cursor: pointer;
}
.local-ai-assist__example:hover {
  border-color: rgba(var(--v-theme-primary), 0.35);
  color: rgb(var(--v-theme-primary));
}
.local-ai-assist__example--undo {
  border-color: rgba(var(--v-theme-warning), 0.35);
  color: rgb(var(--v-theme-warning));
}
.local-ai-assist__instant {
  display: inline-flex;
  align-items: center;
  padding: 0 7px;
  border-radius: 999px;
  background: rgba(var(--v-theme-success), 0.12);
  color: rgb(var(--v-theme-success));
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.local-ai-assist__instant--partial {
  background: rgba(var(--v-theme-warning), 0.14);
  color: rgb(var(--v-theme-warning));
}
.local-ai-assist__goal {
  flex: 1 1 auto;
  min-width: 0;
}
.local-ai-assist__goal :deep(.v-field) {
  --v-input-control-height: 28px;
  border-radius: 999px !important;
  font-size: 0.75rem;
}
.local-ai-assist__goal :deep(.v-field__outline) {
  --v-field-border-radius: 999px;
}
.local-ai-assist__goal :deep(.v-field__input) {
  min-height: 28px !important;
  max-height: 28px !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  padding-inline: 12px 8px !important;
  font-size: 0.75rem !important;
  line-height: 1.2 !important;
  align-items: center;
}
.local-ai-assist__goal :deep(.v-field__input input) {
  font-size: 0.75rem !important;
}
.local-ai-assist__goal :deep(.v-field__append-inner) {
  padding-top: 0 !important;
  align-self: center;
}
.local-ai-assist__goal :deep(.v-field__clearable .v-icon) {
  font-size: 16px !important;
}
.local-ai-assist__actions {
  flex: 0 0 auto;
  min-width: 0;
}
.local-ai-assist__hint {
  white-space: nowrap;
}
.local-ai-assist__run {
  text-transform: none;
  letter-spacing: normal;
  font-weight: 400;
  pointer-events: auto;
}
.local-ai-assist__run :deep(.v-btn__content) {
  font-weight: 400;
}
.local-ai-assist__run--ready {
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}
.local-ai-assist__docs-link {
  text-transform: none;
  letter-spacing: normal;
  font-weight: 400;
  flex-shrink: 0;
}
.local-ai-assist__settings-link {
  margin-inline-start: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgb(var(--v-theme-primary));
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.local-ai-assist__card {
  margin-top: 12px;
  background: rgba(var(--v-theme-surface), 1) !important;
  color: rgba(var(--v-theme-on-surface), 0.92);
  border-color: rgba(var(--v-theme-on-surface), 0.14) !important;
  max-height: min(36vh, 320px);
  overflow: auto;
}
.local-ai-assist__response {
  font-size: 0.75rem;
  line-height: 1.4;
  color: rgba(var(--v-theme-on-surface), 0.88);
}
.local-ai-assist__suggestions {
  margin: 0;
  padding-left: 1.1rem;
  color: inherit;
  font-size: inherit;
  line-height: inherit;
}
.local-ai-assist__suggestions li + li {
  margin-top: 3px;
}
.local-ai-assist__filters {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.local-ai-assist__filter-chip code {
  display: block;
  padding: 4px 8px;
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.08);
  border: 1px solid rgba(var(--v-theme-primary), 0.16);
  font-size: 0.72rem;
  word-break: break-word;
}
.local-ai-assist__code {
  display: block;
  margin-top: 2px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.06);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  color: rgba(var(--v-theme-on-surface), 0.92);
  font-size: 0.85rem;
  word-break: break-all;
}
</style>
