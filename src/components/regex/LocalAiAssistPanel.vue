<template>
  <div class="local-ai-assist">
    <div class="d-flex flex-wrap ga-2 align-center mb-2">
      <v-btn
        size="small"
        color="primary"
        rounded
        variant="tonal"
        :loading="busy"
        :disabled="!ready || busy || canRun === false"
        @click="run"
      >
        <v-icon icon="mdi-robot-outline" start/>
        {{ t('settings_labels.local_ai.assist') }}
      </v-btn>
      <slot name="actions" />
      <span v-if="!ready" class="text-caption text-medium-emphasis">
        {{ t('settings_labels.local_ai.not_ready') }}
      </span>
      <span v-else-if="canRun === false && runHint" class="text-caption text-medium-emphasis">
        {{ runHint }}
      </span>
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
        <template v-else>
          <div v-if="resultSummary" class="text-body-2 mb-2 selectable">{{ resultSummary }}</div>
          <ul v-if="resultSuggestions.length" class="local-ai-assist__suggestions mb-2">
            <li v-for="(item, index) in resultSuggestions" :key="index" class="selectable">
              {{ item }}
            </li>
          </ul>
          <div
            v-if="explanation && explanation !== resultSummary"
            class="text-body-2 selectable"
          >
            {{ explanation }}
          </div>
        </template>
      </template>

      <div v-if="mode === 'regex' && suggestion && !busy" class="d-flex flex-wrap ga-2 mt-3">
        <v-btn
          size="small"
          color="primary"
          rounded
          variant="flat"
          :disabled="!suggestedPattern"
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
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {
  fetchLocalAiStatus,
  streamLocalAiChat,
} from '@/services/localAiClient'

const props = defineProps<{
  mode: 'regex' | 'filter' | 'meta'
  prompt: string
  context?: Record<string, unknown>
  canRun?: boolean
  runHint?: string
}>()

const emit = defineEmits<{
  apply: [value: Record<string, unknown>]
}>()

const {t, locale} = useI18n()
const ready = ref(false)
const busy = ref(false)
const error = ref('')
const suggestion = ref<Record<string, unknown> | null>(null)
const explanation = ref('')
let abortController: AbortController | null = null

const suggestedPattern = computed(() => String(suggestion.value?.pattern || '').trim())
const suggestedReplace = computed(() => String(suggestion.value?.replace || '').trim())
const resultSummary = computed(() => String(suggestion.value?.summary || '').trim())
const resultSuggestions = computed(() => {
  const items = suggestion.value?.suggestions
  if (!Array.isArray(items)) return [] as string[]
  return items.map((item) => String(item || '').trim()).filter(Boolean)
})

function isStatusReady(status: {enabled?: boolean | string | number; status?: string}) {
  const enabled = status.enabled === true
    || status.enabled === 1
    || status.enabled === '1'
    || status.enabled === 'true'
  return enabled && ['downloaded', 'loaded'].includes(String(status.status || ''))
}

async function refreshReady() {
  try {
    const status = await fetchLocalAiStatus()
    ready.value = isStatusReady(status)
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
  return Boolean(summary || explanationText || suggestions.length)
}

async function run() {
  if (!ready.value || busy.value || props.canRun === false) return
  busy.value = true
  error.value = ''
  suggestion.value = null
  explanation.value = ''
  abortController = new AbortController()

  try {
    await streamLocalAiChat(
      {
        mode: props.mode,
        locale: String(locale.value || 'en'),
        messages: [{role: 'user', content: props.prompt}],
        context: props.context || {},
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

onMounted(() => {
  void refreshReady()
})
</script>

<style scoped>
.local-ai-assist__card {
  background: rgba(var(--v-theme-surface), 1) !important;
  color: rgba(var(--v-theme-on-surface), 0.92);
  border-color: rgba(var(--v-theme-on-surface), 0.14) !important;
}
.local-ai-assist__suggestions {
  margin: 0;
  padding-left: 1.15rem;
  color: rgba(var(--v-theme-on-surface), 0.92);
  font-size: 0.875rem;
  line-height: 1.45;
}
.local-ai-assist__suggestions li + li {
  margin-top: 4px;
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
