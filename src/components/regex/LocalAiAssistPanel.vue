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
        v-model="goal"
        class="local-ai-assist__goal"
        density="compact"
        variant="outlined"
        rounded="pill"
        hide-details
        clearable
        :placeholder="t('settings_labels.local_ai.assist_filter_goal')"
        :disabled="busy"
        @keyup.enter="run"
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
          {{ notReadyText }}
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
        <div class="text-caption text-medium-emphasis">
          {{ busy ? t('settings_labels.local_ai.assist_busy') : t('settings_labels.local_ai.assist_preview') }}
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
          <div v-if="resultSummary" class="mb-2 selectable">{{ resultSummary }}</div>

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

          <ul v-if="resultSuggestions.length" class="local-ai-assist__suggestions mb-2">
            <li v-for="(item, index) in resultSuggestions" :key="index" class="selectable">
              {{ item }}
            </li>
          </ul>
          <div
            v-if="explanation && explanation !== resultSummary"
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
          size="small"
          color="primary"
          rounded
          variant="flat"
          :disabled="mode === 'regex' ? !suggestedPattern : !resultFilters.length"
          @click="apply"
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
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRouter} from 'vue-router'
import {typedApi} from '@/services/typedApi'
import {useSettingsStore} from '@/stores/settings'
import {useAppShell} from '@/composable/appShell'

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
}>(), {
  canRun: true,
  active: false,
})

const emit = defineEmits<{
  apply: [value: Record<string, unknown>]
}>()

const {t, locale} = useI18n()
const router = useRouter()
const settingsStore = useSettingsStore()
const appShell = useAppShell()
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

function formatFilterPreview(item: Record<string, unknown>) {
  const param = String(item.param ?? '')
  const cond = String(item.cond ?? '')
  const type = String(item.type ?? '')
  const val = item.val
  if (type === 'boolean') {
    return cond === '!=' ? `${param} = no` : `${param} = yes`
  }
  if (cond === 'is null' || cond === 'not null') return `${param} ${cond}`
  if (Array.isArray(val)) return `${param} ${cond} [${val.join(', ')}]`
  return `${param} ${cond} ${val ?? ''}`.trim()
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

function apply() {
  if (!suggestion.value) return
  if (props.mode === 'regex' && !suggestedPattern.value) {
    error.value = t('settings_labels.local_ai.assist_bad_regex')
    return
  }
  if (props.mode === 'filter' && !resultFilters.value.length) {
    error.value = t('settings_labels.local_ai.assist_bad_filters')
    return
  }
  emit('apply', suggestion.value)
  discard()
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

async function run() {
  if (busy.value || runDisabled.value) return
  // Always re-check: the panel often stays mounted while Local AI is enabled later.
  await refreshReady()
  if (!ready.value) {
    error.value = notReadyText.value
    return
  }
  busy.value = true
  error.value = ''
  suggestion.value = null
  explanation.value = ''
  abortController = new AbortController()

  const goalText = goal.value.trim()
  // Keep context small/plain — large reactive trees can break request validation.
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
})

onBeforeUnmount(() => {
  stop()
  stopReadyPoll()
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
