<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import {
  extractPathRegexTagName,
  testRegexMatch,
  validateRegexPattern,
} from '@shared/pathParser/regexMeta'
import {
  PATH_REGEX_PRESETS,
  generatePathRegexFromSample,
  type PathRegexPreset,
} from '@shared/pathParser/regexGenerator'

export type RegexBuilderMode = 'match' | 'extract'

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
  /** Prefer presets + example generator; tuck raw pattern under Custom */
  presetsFirst?: boolean
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
const customPanel = ref<number[]>(props.pattern?.trim() ? [0] : [])

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

type PresetView = PathRegexPreset & {labelKey: string}
const presets: PresetView[] = PATH_REGEX_PRESETS.map((preset) => ({
  ...preset,
  labelKey: `regex_builder.preset_${preset.id}`,
}))

const patternError = computed(() => {
  const pattern = localPattern.value.trim()
  if (!pattern) return ''
  const result = validateRegexPattern(pattern, regexFlags.value)
  return result.ok ? '' : result.message
})

const canGenerate = computed(() => (
  Boolean(localSample.value.trim() && localCapture.value.trim())
))

const extractedName = computed(() => {
  if (!isExtract.value) return null
  const pattern = localPattern.value.trim()
  if (!pattern || patternError.value) return null
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

const validation = computed(() => {
  const pattern = localPattern.value.trim()
  if (!pattern) {
    return {
      type: 'info' as const,
      title: t('regex_builder.validation_empty_title'),
      text: t('regex_builder.validation_empty_text'),
    }
  }
  if (patternError.value) {
    return {
      type: 'error' as const,
      title: t('regex_builder.validation_invalid_title'),
      text: patternError.value,
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
    if (result.reason === 'no_match') {
      return {
        type: 'warning' as const,
        title: t('regex_builder.validation_no_match_title'),
        text: t('regex_builder.validation_no_match_text'),
      }
    }
    return {
      type: 'error' as const,
      title: t('regex_builder.validation_invalid_title'),
      text: result.message,
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

const isPresetActive = (preset: PresetView) => (
  localPattern.value === preset.pathRegex
  && (!showReplaceField.value || (localReplace.value || '$1') === preset.pathRegexReplace)
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
  setPattern(preset.pathRegex)
  if (showReplaceField.value) setReplace(preset.pathRegexReplace)
  setSample(preset.samplePath)
  setCapture(preset.captureExample)
  generatorMessage.value = {
    type: 'info',
    text: t('regex_builder.preset_applied', {name: t(preset.labelKey)}),
  }
}

function generate() {
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
}

defineExpose({
  pattern: localPattern,
  replace: localReplace,
  isValid: computed(() => Boolean(localPattern.value.trim() && !patternError.value)),
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

    <template v-if="showPresets">
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

    <settings-category-divider
      icon="auto-fix"
      compact
      :title="t('regex_builder.generator')"
      class="mb-2"
    />

    <v-text-field
      :model-value="localSample"
      :label="isExtract ? t('regex_builder.sample_path') : t('regex_builder.sample_text')"
      density="compact"
      variant="outlined"
      rounded="lg"
      hide-details="auto"
      class="mb-3"
      @update:model-value="setSample(String($event ?? ''))"
    />

    <div class="d-flex flex-wrap align-start ga-2 mb-3">
      <v-text-field
        :model-value="localCapture"
        :label="t('regex_builder.capture_text')"
        :hint="presetsFirst ? undefined : t('regex_builder.capture_text_hint')"
        :persistent-hint="!presetsFirst"
        density="compact"
        variant="outlined"
        rounded="lg"
        hide-details="auto"
        class="flex-grow-1 regex-builder__capture"
        @update:model-value="setCapture(String($event ?? ''))"
      />
      <v-btn
        color="primary"
        variant="tonal"
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

    <template v-if="presetsFirst">
      <v-expansion-panels
        v-model="customPanel"
        variant="accordion"
        rounded="lg"
        class="mb-3 regex-builder__custom"
      >
        <v-expansion-panel rounded="lg">
          <v-expansion-panel-title>
            {{ t('regex_builder.custom_pattern') }}
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-text-field
              :model-value="localPattern"
              :label="t('regex_builder.pattern')"
              :error-messages="patternError"
              density="compact"
              variant="outlined"
              rounded="lg"
              hide-details="auto"
              class="mb-3"
              @update:model-value="setPattern(String($event ?? ''))"
            />

            <v-text-field
              v-if="showReplaceField"
              :model-value="localReplace"
              :label="t('regex_builder.replace')"
              density="compact"
              variant="outlined"
              rounded="lg"
              hide-details="auto"
              class="mb-1"
              placeholder="$1"
              @update:model-value="setReplace(String($event ?? ''))"
            />
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </template>

    <template v-else>
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

      <v-text-field
        v-if="showReplaceField"
        :model-value="localReplace"
        :label="t('regex_builder.replace')"
        :hint="t('regex_builder.replace_hint')"
        persistent-hint
        density="compact"
        variant="outlined"
        rounded="lg"
        hide-details="auto"
        class="mb-3"
        placeholder="$1"
        @update:model-value="setReplace(String($event ?? ''))"
      />
    </template>

    <v-alert
      v-if="!presetsFirst || localPattern.trim() || validation.type !== 'info'"
      :type="validation.type"
      variant="tonal"
      density="compact"
      rounded="lg"
      class="text-caption"
    >
      <div class="font-weight-medium">{{ validation.title }}</div>
      <div class="mt-1">{{ validation.text }}</div>
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
</style>
