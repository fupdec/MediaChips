<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import RegexReplaceTemplateEditor from '@/components/regex/RegexReplaceTemplateEditor.vue'
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
  generateMatchRegexFromSample,
  generatePathRegexFromSample,
  type MatchRegexPreset,
  type PathRegexPreset,
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
  /** @deprecated Always uses example-first + Advanced accordion */
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
  showIntro: true,
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
const generatorMessage = ref<{type: 'success' | 'error' | 'info'; text: string} | null>(null)
const randomizingSample = ref(false)

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

const resolvedPresetKind = computed<RegexPresetKind>(() => {
  if (props.presetKind) return props.presetKind
  if (!props.showPresets) return 'none'
  return isExtract.value ? 'path' : 'generic'
})

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
  if (patternErrorCode.value === 'empty') return t('regex_builder.validation_empty_title')
  return t('regex_builder.validation_invalid_text')
})

const canGenerate = computed(() => (
  Boolean(localSample.value.trim() && localCapture.value.trim())
))

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

const matchResult = computed(() => {
  if (isExtract.value) return null
  return testRegexMatch(localPattern.value, localSample.value, regexFlags.value)
})

const extractMatchResult = computed(() => {
  if (!isExtract.value) return null
  return testRegexMatch(localPattern.value, localSample.value, regexFlags.value)
})

const replaceGroups = computed(() => {
  const result = extractMatchResult.value
  if (!result || !result.ok) return [] as string[]
  return result.groups
})

const validation = computed(() => {
  const pattern = localPattern.value.trim()
  if (!pattern) {
    return {
      type: 'info' as const,
      title: t('regex_builder.validation_empty_title'),
      text: t('regex_builder.validation_empty_text'),
    }
  }
  if (patternErrorCode.value) {
    return {
      type: 'error' as const,
      title: t('regex_builder.validation_invalid_title'),
      text: t('regex_builder.validation_invalid_text'),
    }
  }

  if (isExtract.value) {
    if (!extractedName.value) {
      return {
        type: 'warning' as const,
        title: t('regex_builder.validation_no_match_title'),
        text: t('regex_builder.validation_no_match_extract'),
      }
    }
    return {
      type: 'success' as const,
      title: t('regex_builder.validation_ok_title'),
      text: t('regex_builder.validation_extract_ok', {name: extractedName.value}),
    }
  }

  const result = matchResult.value
  if (!result) {
    return {
      type: 'info' as const,
      title: t('regex_builder.validation_empty_title'),
      text: t('regex_builder.validation_empty_text'),
    }
  }
  if (!result.ok) {
    if (result.code === 'no_match') {
      return {
        type: 'warning' as const,
        title: t('regex_builder.validation_no_match_title'),
        text: t('regex_builder.validation_no_match_text'),
      }
    }
    return {
      type: 'error' as const,
      title: t('regex_builder.validation_invalid_title'),
      text: t('regex_builder.validation_invalid_text'),
    }
  }

  const groupsText = result.groups.filter(Boolean).length
    ? ` (${result.groups.filter(Boolean).join(', ')})`
    : ''
  return {
    type: 'success' as const,
    title: t('regex_builder.validation_ok_title'),
    text: t('regex_builder.validation_match_ok', {matched: result.matched}) + groupsText,
  }
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

const isPresetActive = (preset: PresetView) => (
  localPattern.value === preset.pattern
  && (!showReplaceField.value || (localReplace.value || '$1') === preset.replace)
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

function applyPreset(preset: PresetView) {
  setPattern(preset.pattern)
  if (showReplaceField.value) setReplace(preset.replace)
  setSample(preset.sample)
  setCapture(preset.capture)
  generatorMessage.value = {
    type: 'info',
    text: t('regex_builder.preset_applied', {name: t(preset.labelKey)}),
  }
}

function generate() {
  if (isExtract.value) {
    const generated = generatePathRegexFromSample(localSample.value, localCapture.value)
    if (!generated) {
      generatorMessage.value = {
        type: 'error',
        text: t('regex_builder.generate_not_found'),
      }
      return
    }
    setPattern(generated.pathRegex)
    if (showReplaceField.value) setReplace(generated.pathRegexReplace)
    generatorMessage.value = {
      type: 'success',
      text: t(`regex_builder.generate_kind_${generated.kind}`),
    }
    return
  }

  const generated = generateMatchRegexFromSample(localSample.value, localCapture.value)
  if (!generated) {
    generatorMessage.value = {
      type: 'error',
      text: t('regex_builder.generate_not_found'),
    }
    return
  }
  setPattern(generated.pattern)
  generatorMessage.value = {
    type: 'success',
    text: t('regex_builder.generate_kind_literal'),
  }
}

async function pickRandomSamplePath() {
  if (randomizingSample.value) return
  randomizingSample.value = true
  generatorMessage.value = null
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
      generatorMessage.value = {
        type: 'error',
        text: t('regex_builder.sample_random_empty'),
      }
      return
    }

    // Shuffle types so we don't always pick from the first media type.
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
      generatorMessage.value = {
        type: 'info',
        text: t('regex_builder.sample_random_ok'),
      }
      return
    }

    generatorMessage.value = {
      type: 'error',
      text: t('regex_builder.sample_random_empty'),
    }
  } catch (error) {
    console.error(error)
    generatorMessage.value = {
      type: 'error',
      text: t('regex_builder.sample_random_error'),
    }
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
      rounded="lg"
      class="mb-4 text-caption"
    >
      {{ introText }}
    </v-alert>

    <template v-if="presets.length">
      <div class="text-caption text-medium-emphasis mb-2">
        {{ t('regex_builder.presets') }}
      </div>
      <div class="d-flex flex-wrap ga-2 mb-3">
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
    </template>

    <div class="regex-builder__advanced mb-3">
      <v-text-field
        :model-value="localPattern"
        :label="t('regex_builder.pattern')"
        :hint="t('regex_builder.pattern_hint')"
        :error-messages="patternError"
        persistent-hint
        density="compact"
        variant="outlined"
        rounded="lg"
        hide-details="auto"
        class="mb-3"
        @update:model-value="setPattern(String($event ?? ''))"
      />

      <RegexReplaceTemplateEditor
        v-if="showReplaceField"
        :model-value="localReplace"
        :groups="replaceGroups"
        :label="t('regex_builder.replace')"
        :hint="t('regex_builder.replace_hint')"
        class="mb-1"
        @update:model-value="setReplace"
      />
    </div>

    <settings-category-divider
      icon="auto-fix"
      compact
      :title="t('regex_builder.generator')"
      class="mb-2"
    />
    <div class="text-caption text-medium-emphasis mb-3">
      {{ t('regex_builder.generator_hint') }}
    </div>

    <v-text-field
      :model-value="localSample"
      :label="isExtract ? t('regex_builder.sample_path') : t('regex_builder.sample_text')"
      density="compact"
      variant="outlined"
      rounded="lg"
      hide-details="auto"
      class="mb-3"
      @update:model-value="setSample(String($event ?? ''))"
    >
      <template v-if="isExtract" #append-inner>
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
    </v-text-field>

    <div class="d-flex flex-wrap align-start ga-2 mb-3">
      <v-text-field
        :model-value="localCapture"
        :label="captureLabel"
        :hint="t('regex_builder.capture_text_hint')"
        persistent-hint
        density="compact"
        variant="outlined"
        rounded="lg"
        hide-details="auto"
        class="flex-grow-1 regex-builder__capture"
        @update:model-value="setCapture(String($event ?? ''))"
      />
      <v-btn
        color="primary"
        variant="flat"
        rounded="lg"
        class="mt-1"
        :disabled="!canGenerate"
        @click="generate"
      >
        {{ t('regex_builder.generate') }}
      </v-btn>
    </div>

    <v-alert
      v-if="generatorMessage"
      :type="generatorMessage.type"
      variant="tonal"
      density="compact"
      rounded="lg"
      class="mb-3 text-caption"
    >
      {{ generatorMessage.text }}
    </v-alert>

    <v-alert
      :type="validation.type"
      variant="tonal"
      density="comfortable"
      rounded="lg"
      class="regex-builder__result"
    >
      <div class="font-weight-medium text-body-2">{{ validation.title }}</div>
      <div class="mt-1 text-caption">{{ validation.text }}</div>
    </v-alert>
  </div>
</template>

<style scoped>
.regex-builder__preset {
  cursor: pointer;
}

.regex-builder__capture {
  min-width: 220px;
}

.regex-builder__result {
  border-width: 1px;
}
</style>
