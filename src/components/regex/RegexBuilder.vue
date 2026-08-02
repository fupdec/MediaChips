<script setup lang="ts">
import {computed, nextTick, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import RegexReplaceTemplateEditor from '@/components/regex/RegexReplaceTemplateEditor.vue'
import LocalAiAssistPanel from '@/components/regex/LocalAiAssistPanel.vue'
import {typedApi} from '@/services/typedApi'
import {useAppStore} from '@/stores/app'
import {
  extractPathRegexTagName,
  testRegexMatch,
  validateRegexPattern,
} from '@shared/pathParser/regexMeta'
import {
  MATCH_REGEX_PRESETS,
  PATH_REGEX_PRESETS,
  REGEX_HELPER_SNIPPETS,
  generateMatchRegexFromSample,
  generatePathRegexFromSample,
  type MatchRegexPreset,
  type PathRegexPreset,
  type RegexHelperSnippet,
} from '@shared/pathParser/regexGenerator'

export type RegexBuilderMode = 'match' | 'extract'
export type RegexPresetKind = 'path' | 'generic' | 'none'

const props = withDefaults(defineProps<{
  mode?: RegexBuilderMode
  pattern?: string
  replace?: string
  sample?: string
  captureText?: string
  intro?: string
  showPresets?: boolean
  showReplace?: boolean
  showIntro?: boolean
  /** @deprecated Always uses example-first layout */
  presetsFirst?: boolean
  presetKind?: RegexPresetKind
  flags?: string
}>(), {
  mode: 'match',
  pattern: '',
  replace: '$1',
  sample: '',
  captureText: '',
  intro: '',
  showPresets: true,
  showReplace: undefined,
  showIntro: false,
  presetsFirst: false,
  presetKind: undefined,
  flags: undefined,
})

const emit = defineEmits<{
  'update:pattern': [value: string]
  'update:replace': [value: string]
  'update:sample': [value: string]
  'update:captureText': [value: string]
}>()

const {t} = useI18n()

const localPattern = ref(props.pattern)
const localReplace = ref(props.replace || '$1')
const localSample = ref(props.sample)
const localCapture = ref(props.captureText)
const flashMessage = ref<{type: 'error' | 'info'; text: string} | null>(null)
const flashTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const randomizingSample = ref(false)
const patternField = ref<{$el?: HTMLElement} | null>(null)
const lastCaret = ref<number | null>(null)

watch(() => props.pattern, (value) => {
  if (value !== localPattern.value) localPattern.value = value || ''
})
watch(() => props.replace, (value) => {
  if ((value || '$1') !== localReplace.value) localReplace.value = value || '$1'
})
watch(() => props.sample, (value) => {
  if (value !== localSample.value) localSample.value = value || ''
})
watch(() => props.captureText, (value) => {
  if (value !== localCapture.value) localCapture.value = value || ''
})

const isExtract = computed(() => props.mode === 'extract')
const showReplaceField = computed(() => (
  props.showReplace === undefined ? isExtract.value : props.showReplace
))
const regexFlags = computed(() => props.flags || (isExtract.value ? 'iu' : 'i'))
const helperSnippets = REGEX_HELPER_SNIPPETS

const resolvedPresetKind = computed<RegexPresetKind>(() => {
  if (props.presetKind) return props.presetKind
  if (!props.showPresets) return 'none'
  return isExtract.value ? 'path' : 'generic'
})

const isPathSample = computed(() => (
  isExtract.value || resolvedPresetKind.value === 'path'
))

type PresetView = {
  id: string
  labelKey: string
  pattern: string
  replace: string
  sample: string
  capture: string
}

function mapPathPreset(preset: PathRegexPreset): PresetView {
  return {
    id: preset.id,
    labelKey: `regex_builder.preset_${preset.id}`,
    pattern: preset.pathRegex,
    replace: preset.pathRegexReplace,
    sample: preset.samplePath,
    capture: preset.captureExample,
  }
}

function mapMatchPreset(preset: MatchRegexPreset): PresetView {
  return {
    id: preset.id,
    labelKey: `regex_builder.preset_${preset.id}`,
    pattern: preset.pattern,
    replace: '$1',
    sample: preset.sampleText,
    capture: preset.captureExample,
  }
}

const presets = computed<PresetView[]>(() => {
  if (resolvedPresetKind.value === 'path') {
    return PATH_REGEX_PRESETS.map(mapPathPreset)
  }
  if (resolvedPresetKind.value === 'generic') {
    return MATCH_REGEX_PRESETS.map(mapMatchPreset)
  }
  return []
})

const patternErrorCode = computed(() => {
  const pattern = localPattern.value.trim()
  if (!pattern) return '' as const
  const result = validateRegexPattern(pattern, regexFlags.value)
  return result.ok ? ('' as const) : result.code
})

const patternError = computed(() => {
  if (!patternErrorCode.value) return ''
  return t('regex_builder.validation_invalid')
})

const canGenerate = computed(() => (
  Boolean(localSample.value.trim() && localCapture.value.trim())
))

const aiPrompt = computed(() => {
  const sample = localSample.value.trim()
  const capture = localCapture.value.trim()
  if (isExtract.value) {
    return [
      'Suggest a path regex for MediaChips tag extraction.',
      sample ? `Sample path: ${sample}` : 'Sample path is empty — invent a typical media path example.',
      capture ? `Capture this text as the tag: ${capture}` : 'Choose a sensible capture group for a studio/name segment.',
      'Return JSON with pattern, replace, explanation.',
    ].join('\n')
  }
  return [
    'Suggest a JavaScript RegExp that matches the sample.',
    sample ? `Sample: ${sample}` : 'Sample is empty — invent a short example.',
    capture ? `Should match/capture: ${capture}` : '',
    'Return JSON with pattern, replace, explanation.',
  ].filter(Boolean).join('\n')
})

const aiContext = computed(() => ({
  mode: props.mode,
  pattern: localPattern.value,
  replace: localReplace.value,
  sample: localSample.value,
  captureText: localCapture.value,
  flags: regexFlags.value,
}))

function onAiApply(value: Record<string, unknown>) {
  if (typeof value.pattern === 'string' && value.pattern.trim()) {
    setPattern(value.pattern.trim())
  }
  if (typeof value.replace === 'string' && showReplaceField.value) {
    setReplace(value.replace)
  }
  showFlash('info', String(value.explanation || t('settings_labels.local_ai.assist_apply')))
}

const extractedName = computed(() => {
  if (!isExtract.value) return null
  const pattern = localPattern.value.trim()
  if (!pattern || patternErrorCode.value) return null
  return extractPathRegexTagName(localSample.value, {
    id: 1,
    type: 'array',
    parser: true,
    pathRegex: localPattern.value,
    pathRegexReplace: localReplace.value || '$1',
  })
})

const activeMatch = computed(() => {
  const pattern = localPattern.value.trim()
  if (!pattern || patternErrorCode.value) return null
  return testRegexMatch(localPattern.value, localSample.value, regexFlags.value)
})

const replaceGroups = computed(() => {
  const result = activeMatch.value
  if (!result || !result.ok) return [] as string[]
  return result.groups
})

type CompactResult = {
  type: 'success' | 'warning' | 'error'
  text: string
} | null

const compactResult = computed<CompactResult>(() => {
  const pattern = localPattern.value.trim()
  if (!pattern) return null

  if (patternErrorCode.value) {
    return {
      type: 'error',
      text: t('regex_builder.validation_invalid'),
    }
  }

  if (isExtract.value) {
    if (!extractedName.value) {
      return {
        type: 'warning',
        text: t('regex_builder.validation_no_match'),
      }
    }
    return {
      type: 'success',
      text: t('regex_builder.validation_extract_ok', {name: extractedName.value}),
    }
  }

  const result = activeMatch.value
  if (!result || !result.ok) {
    return {
      type: 'warning',
      text: t('regex_builder.validation_no_match'),
    }
  }

  return {
    type: 'success',
    text: t('regex_builder.validation_match_ok', {matched: result.matched}),
  }
})

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const highlightHtml = computed(() => {
  const sample = localSample.value
  const result = activeMatch.value
  if (!sample || !result || !result.ok || !result.matched) return ''

  const matched = result.matched
  const index = sample.indexOf(matched)
  if (index < 0) return escapeHtml(sample)

  const before = escapeHtml(sample.slice(0, index))
  const middle = escapeHtml(matched)
  const after = escapeHtml(sample.slice(index + matched.length))
  return `${before}<mark class="regex-builder__mark">${middle}</mark>${after}`
})

const introText = computed(() => (
  props.intro
  || (isExtract.value ? t('regex_builder.intro_extract') : t('regex_builder.intro_match'))
))

const captureLabel = computed(() => (
  isExtract.value
    ? t('regex_builder.capture_text_extract')
    : t('regex_builder.capture_text')
))

const sampleLabel = computed(() => (
  isPathSample.value
    ? t('regex_builder.sample_path')
    : t('regex_builder.sample_text')
))

const sampleTip = computed(() => (
  isPathSample.value
    ? t('regex_builder.sample_path_tip')
    : t('regex_builder.sample_text_tip')
))

const captureTip = computed(() => (
  isExtract.value
    ? t('regex_builder.capture_extract_tip')
    : t('regex_builder.capture_tip')
))

const isPresetActive = (preset: PresetView) => (
  localPattern.value === preset.pattern
  && (!isExtract.value || (localReplace.value || '$1') === preset.replace)
)

function setPattern(value: string) {
  localPattern.value = value
  emit('update:pattern', value)
}

function setReplace(value: string) {
  localReplace.value = value
  emit('update:replace', value)
}

function setSample(value: string) {
  localSample.value = value
  emit('update:sample', value)
}

function setCapture(value: string) {
  localCapture.value = value
  emit('update:captureText', value)
}

function showFlash(type: 'error' | 'info', text: string, ms = 2000) {
  if (flashTimer.value) clearTimeout(flashTimer.value)
  flashMessage.value = {type, text}
  flashTimer.value = setTimeout(() => {
    flashMessage.value = null
    flashTimer.value = null
  }, ms)
}

function applyPreset(preset: PresetView) {
  setPattern(preset.pattern)
  // Always sync replace in extract mode — MetaSettings hides the field but still stores it.
  if (showReplaceField.value || isExtract.value) setReplace(preset.replace)
  setSample(preset.sample)
  setCapture(preset.capture)
}

function generate() {
  if (isExtract.value) {
    const generated = generatePathRegexFromSample(localSample.value, localCapture.value)
    if (!generated) {
      showFlash('error', t('regex_builder.generate_not_found'))
      return
    }
    setPattern(generated.pathRegex)
    setReplace(generated.pathRegexReplace)
    return
  }

  const generated = generateMatchRegexFromSample(localSample.value, localCapture.value)
  if (!generated) {
    showFlash('error', t('regex_builder.generate_not_found'))
    return
  }
  setPattern(generated.pattern)
}

function getPatternInput(): HTMLInputElement | null {
  const root = patternField.value?.$el
  if (!root) return null
  return root.querySelector('input') as HTMLInputElement | null
}

function rememberCaret() {
  const input = getPatternInput()
  if (!input) return
  lastCaret.value = input.selectionStart ?? input.value.length
}

function insertSnippet(snippet: string, at?: number | null) {
  const current = localPattern.value || ''
  const input = getPatternInput()
  let start = at
  if (start == null || start < 0) {
    if (input && document.activeElement === input) {
      start = input.selectionStart ?? current.length
    } else if (lastCaret.value != null) {
      start = lastCaret.value
    } else {
      start = current.length
    }
  }
  start = Math.max(0, Math.min(start, current.length))
  const end = (input && document.activeElement === input)
    ? (input.selectionEnd ?? start)
    : start
  const safeEnd = Math.max(start, Math.min(end, current.length))
  const next = current.slice(0, start) + snippet + current.slice(safeEnd)
  const caret = start + snippet.length
  setPattern(next)
  lastCaret.value = caret
  nextTick(() => {
    const el = getPatternInput()
    if (!el) return
    el.focus()
    el.setSelectionRange(caret, caret)
    lastCaret.value = caret
  })
}

function onHelperClick(snippet: RegexHelperSnippet) {
  insertSnippet(snippet.insert)
}

async function pickRandomSamplePath() {
  if (randomizingSample.value) return
  randomizingSample.value = true
  flashMessage.value = null
  try {
    const appStore = useAppStore()
    let mediaTypes = (appStore.mediaTypes || [])
      .map((item) => Number(item?.id))
      .filter((id) => Number.isFinite(id) && id > 0)

    if (!mediaTypes.length) {
      const {data} = await typedApi.getMediaTypes()
      mediaTypes = (Array.isArray(data) ? data : [])
        .map((item) => Number(item?.id))
        .filter((id) => Number.isFinite(id) && id > 0)
    }

    if (!mediaTypes.length) {
      showFlash('error', t('regex_builder.sample_random_empty'))
      return
    }

    for (let i = mediaTypes.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [mediaTypes[i], mediaTypes[j]] = [mediaTypes[j], mediaTypes[i]]
    }

    for (const mediaTypeId of mediaTypes) {
      const probe = await typedApi.getMediaItems({
        mediaTypeId,
        page: 1,
        limit: 1,
        sortBy: 'id',
        direction: 'asc',
        skipTotals: false,
      })
      const total = Number(probe.data?.totalFiltered ?? 0)
      if (total <= 0) continue

      const page = Math.floor(Math.random() * total) + 1
      const pageRes = page === 1
        ? probe
        : await typedApi.getMediaItems({
            mediaTypeId,
            page,
            limit: 1,
            sortBy: 'id',
            direction: 'asc',
            skipTotals: true,
          })

      const path = String(pageRes.data?.items?.[0]?.path || '').trim()
      if (!path) continue

      setSample(path)
      return
    }

    showFlash('error', t('regex_builder.sample_random_empty'))
  } catch (error) {
    console.error(error)
    showFlash('error', t('regex_builder.sample_random_error'))
  } finally {
    randomizingSample.value = false
  }
}

defineExpose({
  pattern: localPattern,
  replace: localReplace,
  isValid: computed(() => Boolean(localPattern.value.trim() && !patternErrorCode.value)),
  patternError,
})
</script>

<template>
  <div class="regex-builder">
    <v-alert
      v-if="showIntro"
      type="info"
      variant="tonal"
      density="compact"
      rounded="pill"
      class="text-caption"
    >
      {{ introText }}
    </v-alert>

    <div
      v-if="presets.length"
      class="d-flex flex-wrap ga-2"
      :aria-label="t('regex_builder.presets')"
    >
      <v-chip
        v-for="preset in presets"
        :key="preset.id"
        size="small"
        label
        :color="isPresetActive(preset) ? 'primary' : undefined"
        :variant="isPresetActive(preset) ? 'flat' : 'outlined'"
        class="regex-builder__preset"
        @click="applyPreset(preset)"
      >
        {{ t(preset.labelKey) }}
      </v-chip>
    </div>

    <v-text-field
      :model-value="localSample"
      :label="sampleLabel"
      density="compact"
      variant="outlined"
      rounded="pill"
      clearable
      hide-details="auto"
      @update:model-value="setSample(String($event ?? ''))"
    >
      <template v-if="isPathSample" #prepend-inner>
        <v-btn
          icon="mdi-dice-multiple"
          size="x-small"
          variant="text"
          :loading="randomizingSample"
          :disabled="randomizingSample"
          :title="t('regex_builder.sample_random')"
          @click.stop="pickRandomSamplePath"
        />
      </template>
      <template #append-inner>
        <v-tooltip location="top" max-width="280" open-on-hover open-on-click>
          <template #activator="{props: tipProps}">
            <v-btn
              v-bind="tipProps"
              icon="mdi-help-circle-outline"
              size="x-small"
              variant="text"
              class="regex-builder__tip-btn"
              tabindex="-1"
              @click.stop.prevent
            />
          </template>
          <span>{{ sampleTip }}</span>
        </v-tooltip>
      </template>
    </v-text-field>

    <div
      v-if="highlightHtml"
      class="regex-builder__preview text-caption"
      v-html="highlightHtml"
    />

    <div class="regex-builder__pattern-block">
      <div
        class="d-flex flex-wrap align-center ga-2 mb-2"
        :aria-label="t('regex_builder.helpers')"
      >
        <v-tooltip location="top" max-width="280" open-on-hover open-on-click>
          <template #activator="{props: tipProps}">
            <v-btn
              v-bind="tipProps"
              icon="mdi-help-circle-outline"
              size="x-small"
              variant="text"
              class="regex-builder__tip-btn"
              @click.stop.prevent
            />
          </template>
          <span>{{ t('regex_builder.helpers_tip') }}</span>
        </v-tooltip>
        <v-chip
          v-for="snippet in helperSnippets"
          :key="snippet.id"
          size="small"
          label
          variant="outlined"
          class="regex-builder__helper"
          :title="t(`regex_builder.helper_${snippet.id}_tip`)"
          @click="onHelperClick(snippet)"
        >
          {{ t(`regex_builder.helper_${snippet.id}`) }}
        </v-chip>
      </div>

      <v-text-field
        ref="patternField"
        :model-value="localPattern"
        :label="t('regex_builder.pattern')"
        :error-messages="patternError"
        density="compact"
        variant="outlined"
        rounded="pill"
        clearable
        hide-details="auto"
        @update:model-value="setPattern(String($event ?? ''))"
        @click="rememberCaret"
        @keyup="rememberCaret"
        @select="rememberCaret"
        @focus="rememberCaret"
      >
        <template #append-inner>
          <v-tooltip location="top" max-width="280" open-on-hover open-on-click>
            <template #activator="{props: tipProps}">
              <v-btn
                v-bind="tipProps"
                icon="mdi-help-circle-outline"
                size="x-small"
                variant="text"
                class="regex-builder__tip-btn"
                tabindex="-1"
                @click.stop.prevent
              />
            </template>
            <span>{{ t('regex_builder.pattern_tip') }}</span>
          </v-tooltip>
        </template>
      </v-text-field>
    </div>

    <RegexReplaceTemplateEditor
      v-if="showReplaceField"
      :model-value="localReplace"
      :groups="replaceGroups"
      :label="t('regex_builder.replace')"
      :hint="t('regex_builder.replace_hint')"
      @update:model-value="setReplace"
    />

    <v-alert
      v-if="compactResult"
      :type="compactResult.type"
      variant="tonal"
      density="compact"
      rounded="pill"
      class="regex-builder__result text-caption"
    >
      {{ compactResult.text }}
    </v-alert>

    <div class="d-flex flex-wrap align-start ga-2">
      <v-text-field
        :model-value="localCapture"
        :label="captureLabel"
        :placeholder="t('regex_builder.capture_placeholder')"
        density="compact"
        variant="outlined"
        rounded="pill"
        clearable
        hide-details="auto"
        class="flex-grow-1 regex-builder__capture"
        @update:model-value="setCapture(String($event ?? ''))"
      >
        <template #append-inner>
          <v-tooltip location="top" max-width="280" open-on-hover open-on-click>
            <template #activator="{props: tipProps}">
              <v-btn
                v-bind="tipProps"
                icon="mdi-help-circle-outline"
                size="x-small"
                variant="text"
                class="regex-builder__tip-btn"
                tabindex="-1"
                @click.stop.prevent
              />
            </template>
            <span>{{ captureTip }}</span>
          </v-tooltip>
        </template>
      </v-text-field>
      <v-btn
        color="primary"
        variant="flat"
        rounded="pill"
        class="mt-1"
        :disabled="!canGenerate"
        :title="t('regex_builder.generate_tip')"
        @click="generate"
      >
        {{ t('regex_builder.generate') }}
      </v-btn>
    </div>

    <v-alert
      v-if="flashMessage"
      :type="flashMessage.type"
      variant="tonal"
      density="compact"
      rounded="pill"
      class="text-caption"
    >
      {{ flashMessage.text }}
    </v-alert>

    <LocalAiAssistPanel
      mode="regex"
      :prompt="aiPrompt"
      :context="aiContext"
      @apply="onAiApply"
    />
  </div>
</template>

<style scoped>
.regex-builder {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.regex-builder__preset {
  cursor: pointer;
}

.regex-builder__tip-btn {
  opacity: 0.55;
}

.regex-builder__tip-btn:hover,
.regex-builder__tip-btn:focus-visible {
  opacity: 1;
}

.regex-builder__helper {
  cursor: pointer;
  user-select: none;
}

.regex-builder__capture {
  min-width: 220px;
}

.regex-builder__preview {
  padding: 8px 12px;
  border-radius: 20px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  word-break: break-all;
  line-height: 1.45;
}

.regex-builder__preview :deep(.regex-builder__mark) {
  padding: 0 2px;
  border-radius: 4px;
  background: rgba(var(--v-theme-primary), 0.22);
  color: inherit;
}

.regex-builder__result {
  border-width: 1px;
}
</style>
