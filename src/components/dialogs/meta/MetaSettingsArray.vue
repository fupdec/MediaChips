<template>
  <!-- Basics: hide in nav (create + basics tab) -->
  <SettingsSection v-if="showBasics" padded>
    <LocalAiAssistPanel
      v-if="LOCAL_AI_UI_ENABLED"
      class="mb-4"
      mode="meta"
      :prompt="metaAiPrompt"
      :context="metaAiContext"
    />
    <v-switch
      v-model="settings.hidden"
      hide-details
      inset
    >
      <template #label>
        <div class="d-flex flex-column ml-2">
          <div>{{ t('meta.settings.hide_in_navigation') }}</div>
        </div>
      </template>
    </v-switch>
  </SettingsSection>

  <!-- Capabilities: built-in tag fields -->
  <template v-if="showCapabilities && editMode">
    <SettingsSection padded>
      <settings-category-divider
        icon="shape"
        compact
        :title="t('meta.settings.preset_meta_in_tags')"
      />

      <v-row>
        <v-col cols="12" sm="5">
          <v-switch inset v-model="settings.rating">
            <template #label>
              <v-icon color="yellow-darken-2">mdi-star</v-icon>
              <div class="ml-2">{{ t('meta.types.rating') }}</div>
            </template>
          </v-switch>

          <v-switch inset v-model="settings.favorite" hide-details>
            <template #label>
              <v-icon color="pink">mdi-heart</v-icon>
              <div class="ml-2">{{ t('meta.sorting.favorite') }}</div>
            </template>
          </v-switch>

          <v-switch inset v-model="settings.synonyms" class="mt-6" hide-details>
            <template #label>
              <div class="d-flex flex-column ml-2">
                <div>
                  <v-icon color="grey">mdi-alphabetical</v-icon>
                  {{ t('filters.sort.synonyms') }}
                </div>
                <div class="text-caption mt-1">{{ t('editing.synonyms_hint') }}</div>
              </div>
            </template>
          </v-switch>
        </v-col>
        <v-col cols="12" sm="7">
          <v-switch inset v-model="settings.bookmark" class="mt-0">
            <template #label>
              <div class="d-flex flex-column ml-2">
                <div>
                  <v-icon color="red">mdi-bookmark</v-icon>
                  {{ t('player.controls.bookmark') }}
                </div>
                <div class="text-caption mt-1">{{ t('meta.settings.bookmark_hint') }}</div>
              </div>
            </template>
          </v-switch>

          <v-switch inset v-model="settings.country" class="mt-0" hide-details>
            <template #label>
              <div class="d-flex flex-column ml-2">
                <div>
                  <v-icon color="grey">mdi-flag</v-icon>
                  {{ t('meta.types.country') }}
                </div>
                <div class="text-caption mt-1">{{ t('meta.settings.country_hint') }}</div>
              </div>
            </template>
          </v-switch>
        </v-col>
      </v-row>
    </SettingsSection>
  </template>

  <!-- From path: compact enable + optional pattern -->
  <SettingsSection v-if="showFromPath && editMode" padded>
    <settings-category-divider
      icon="folder-search-outline"
      compact
      :title="t('meta.settings.tags_from_path')"
    >
      <template #actions>
        <button-documentation id="media.parser" />
      </template>
    </settings-category-divider>

    <template v-if="!isPinnedForMediaParser">
      <div class="text-caption text-medium-emphasis mb-3">
        {{ t('meta.settings.assign_before_parser') }}
      </div>
      <v-btn
        size="small"
        variant="tonal"
        color="primary"
        rounded="lg"
        prepend-icon="mdi-plus"
        @click="emit('request-assign')"
      >
        {{ t('meta.settings.add_to_media_type') }}
      </v-btn>
    </template>

    <template v-else>
      <v-switch
        inset
        v-model="settings.parser"
        hide-details
        class="mb-4"
      >
        <template #label>
          <div class="d-flex flex-column ml-2">
            <div>{{ t('meta.settings.parse_media_for_tags') }}</div>
            <div class="text-caption mt-1">
              {{ t('meta.settings.parse_media_for_tags_hint') }}
            </div>
          </div>
        </template>
      </v-switch>

      <template v-if="settings.parser">
        <div class="text-caption text-medium-emphasis mb-4">
          {{ t('meta.settings.path_find_fuzzy_hint') }}
        </div>

        <v-switch
          v-model="settings.pathRegexEnabled"
          inset
          hide-details
          class="mb-4"
        >
          <template #label>
            <div class="d-flex flex-column ml-2">
              <div>{{ t('meta.settings.path_regex_enable') }}</div>
              <div class="text-caption mt-1">
                {{ t('meta.settings.path_regex_enable_hint') }}
              </div>
            </div>
          </template>
        </v-switch>

        <template v-if="settings.pathRegexEnabled">
          <RegexBuilder
            mode="extract"
            preset-kind="path"
            :pattern="settings.pathRegex"
            :replace="settings.pathRegexReplace"
            :sample="pathRegexSamplePath"
            :capture-text="pathRegexCaptureText"
            :show-replace="false"
            :show-extracted-name="!settings.pathRegexCreateTags"
            class="mb-4"
            @update:pattern="settings.pathRegex = $event"
            @update:replace="settings.pathRegexReplace = $event"
            @update:sample="pathRegexSamplePath = $event"
            @update:capture-text="pathRegexCaptureText = $event"
          />

          <v-switch
            v-model="settings.pathRegexCreateTags"
            inset
            hide-details="auto"
            class="mb-4"
          >
            <template #label>
              <div class="d-flex flex-column ml-2">
                <div>{{ t('meta.settings.path_regex_create_tags') }}</div>
                <div class="text-caption mt-1">
                  {{ t('meta.settings.path_regex_create_tags_hint') }}
                </div>
              </div>
            </template>
          </v-switch>

          <RegexReplaceTemplateEditor
            v-if="settings.pathRegexCreateTags"
            :model-value="settings.pathRegexReplace"
            :groups="pathRegexReplaceGroups"
            :label="t('regex_builder.replace')"
            :hint="t('regex_builder.replace_hint')"
            class="mb-4"
            @update:model-value="settings.pathRegexReplace = $event"
          />
        </template>

        <v-btn
          color="primary"
          variant="tonal"
          rounded="lg"
          class="mt-2"
          prepend-icon="mdi-tag-search-outline"
          @click="goToLibraryParser"
        >
          {{ t('meta.settings.run_library_path_scan') }}
        </v-btn>
      </template>
    </template>
  </SettingsSection>

  <!-- Appearance: chips + aspect ratio -->
  <template v-if="showAppearance">
    <SettingsSection padded>
      <settings-category-divider
        icon="tag"
        compact
        :title="t('meta.settings.chips_appearance')"
      />

      <div class="d-flex align-center flex-wrap justify-space-between mt-4 mb-4">
        <div class="text-body-1 text-high-emphasis mr-6">
          <v-icon start>mdi-label</v-icon>
          {{ t('settings_labels.appearance.chip_variant') }}
        </div>

        <v-chip-group column>
          <v-chip
            v-for="variant in chipVariants"
            :key="variant"
            @click="settings.chipVariant = variant"
            :label="settings.chipLabel"
            :variant="variant"
            :base-color="settings.color ? randomColor : ''"
          >
            <v-icon v-if="settings.chipVariant == variant" start>mdi-check</v-icon>
            <span>{{ variant }}</span>
          </v-chip>
        </v-chip-group>

        <v-btn
          v-if="settings.color"
          @click="generateRandomColor"
          color="settings.color"
          icon
        >
          <v-icon>mdi-dice-5</v-icon>
        </v-btn>
      </div>

      <v-row>
        <v-col cols="12" sm="5">
          <v-switch
            v-model="settings.color"
            :label="t('settings_labels.appearance.colors')"
            class="my-0"
            hide-details
            inset
          />
        </v-col>
        <v-col cols="12" sm="7">
          <v-switch
            v-model="settings.chipLabel"
            :label="t('meta.settings.label')"
            class="my-0"
            hide-details
            inset
          />
        </v-col>
      </v-row>

      <v-switch
        v-model="settings.autoColorFromImage"
        :disabled="!settings.color"
        class="mt-2"
        hide-details
        inset
      >
        <template #label>
          <div class="d-flex flex-column ml-2">
            <div>{{ t('meta.settings.auto_color_from_image') }}</div>
            <div class="text-caption mt-1">
              {{ t('meta.settings.auto_color_from_image_hint') }}
            </div>
          </div>
        </template>
      </v-switch>
    </SettingsSection>

    <SettingsSection padded>
      <settings-category-divider
        icon="post"
        compact
        :title="t('meta.settings.cards_appearance')"
      />
      <div class="text-high-emphasis">{{ t('meta.settings.image_aspect_ratio') }}</div>

      <v-alert
        color="info"
        icon="mdi-information-outline"
        class="text-caption mb-4 mt-2"
        variant="tonal"
        rounded="xl"
        density="compact"
        closable
      >
        {{ t('meta.settings.image_aspect_ratio_hint') }}
      </v-alert>

      <div class="aspect-ratio-cards mt-2">
        <button
          v-for="preset in aspectRatioPresets"
          :key="preset.id"
          type="button"
          class="aspect-ratio-card"
          :class="{'aspect-ratio-card--active': selectedPresetId === preset.id}"
          @click="selectPreset(preset.id)"
        >
          <span class="aspect-ratio-sample" :style="getSampleStyle(preset.value)">
            <v-icon size="small">{{ preset.icon }}</v-icon>
          </span>
          <span class="aspect-ratio-card__label">{{ preset.label }}</span>
        </button>

        <button
          type="button"
          class="aspect-ratio-card"
          :class="{'aspect-ratio-card--active': selectedPresetId === 'custom'}"
          @click="selectPreset('custom')"
        >
          <span
            class="aspect-ratio-sample aspect-ratio-sample--custom"
            :style="customSampleStyle"
          >
            <v-icon size="small">mdi-pencil-outline</v-icon>
          </span>
          <span class="aspect-ratio-card__label">
            {{ t('meta.settings.image_aspect_ratio_custom') }}
          </span>
        </button>
      </div>

      <div v-if="selectedPresetId === 'custom'" class="aspect-ratio-custom mt-4">
        <div class="aspect-ratio-custom__inputs">
          <v-text-field
            v-model.number="customWidth"
            type="number"
            min="1"
            step="1"
            density="compact"
            variant="outlined"
            hide-details="auto"
            :label="t('meta.settings.image_aspect_ratio_width')"
            class="aspect-ratio-custom__field"
            @update:model-value="applyCustomRatio"
          />
          <span class="aspect-ratio-custom__sep text-medium-emphasis">:</span>
          <v-text-field
            v-model.number="customHeight"
            type="number"
            min="1"
            step="1"
            density="compact"
            variant="outlined"
            hide-details="auto"
            :label="t('meta.settings.image_aspect_ratio_height')"
            class="aspect-ratio-custom__field"
            @update:model-value="applyCustomRatio"
          />
          <span
            class="aspect-ratio-sample aspect-ratio-sample--live"
            :style="customSampleStyle"
          >
            <v-icon size="small">mdi-image-outline</v-icon>
          </span>
        </div>
        <div class="text-caption text-medium-emphasis mt-2">
          {{ t('meta.settings.image_aspect_ratio_custom_hint') }}
        </div>
        <div v-if="customRatioError" class="text-caption text-error mt-1">
          {{ customRatioError }}
        </div>
      </div>
    </SettingsSection>
  </template>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, watch, nextTick} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute, useRouter} from 'vue-router'
import {isVideoMediaType, isImageMediaType, isAudioMediaType, isTextMediaType} from '@/utils/mediaType'
import {approxAspectRatioParts} from '@/utils/aspectRatioParts'
import {typedApi} from '@/services/typedApi'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import SettingsSection from '@/components/ui/SettingsSection.vue'
import ButtonDocumentation from '@/components/ui/ButtonDocumentation.vue'
import LocalAiAssistPanel from '@/components/regex/LocalAiAssistPanel.vue'
import {LOCAL_AI_UI_ENABLED} from '@shared/features'
import RegexBuilder from '@/components/regex/RegexBuilder.vue'
import RegexReplaceTemplateEditor from '@/components/regex/RegexReplaceTemplateEditor.vue'
import {getDefaultPathRegexSample} from '@shared/pathParser/regexGenerator'
import {testRegexMatch} from '@shared/pathParser/regexMeta'
import type {Meta} from '@/types/stores'
import type {MediaType} from '@/types/media'

export type MetaArraySection = 'basics' | 'capabilities' | 'appearance' | 'from-path'

type ChipVariant = 'flat' | 'tonal' | 'outlined' | 'text'
type AspectPresetId = '1:1' | '5:8' | '2:3' | '16:9' | 'custom'

interface AspectRatioPreset {
  id: Exclude<AspectPresetId, 'custom'>
  label: string
  value: number
  icon: string
}

interface MetaSettings {
  hidden: boolean
  parser: boolean
  pathRegex: string
  pathRegexReplace: string
  pathRegexCreateTags: boolean
  pathRegexEnabled: boolean
  imageAspectRatio: number
  chipLabel: boolean
  chipVariant: ChipVariant
  color: boolean
  autoColorFromImage: boolean
  favorite: boolean
  rating: boolean
  synonyms: boolean
  bookmark: boolean
  country: boolean
  career: boolean
  scraper: boolean
  nested: boolean
  marks: boolean
}

const ASPECT_RATIO_EPSILON = 0.001
const SAMPLE_MAX_SIZE = 36

const aspectRatioPresets: AspectRatioPreset[] = [
  {id: '1:1', label: '1:1', value: 1, icon: 'mdi-image-filter-hdr'},
  {id: '5:8', label: '5:8', value: 5 / 8, icon: 'mdi-account'},
  {id: '2:3', label: '2:3', value: 43 / 61, icon: 'mdi-account'},
  {id: '16:9', label: '16:9', value: 16 / 9, icon: 'mdi-image-filter-hdr'},
]

const toMediaType = (mediaType: MediaType | string | undefined): MediaType | undefined =>
  typeof mediaType === 'string' ? undefined : mediaType

const props = withDefaults(defineProps<{
  meta: Meta
  editMode?: boolean
  sections?: MetaArraySection[]
}>(), {
  editMode: false,
  sections: () => ['basics', 'capabilities', 'appearance', 'from-path'],
})

const emit = defineEmits<{
  update: [settings: MetaSettings]
  'request-assign': []
  'pin-state-changed': [state: {parser: boolean}]
  close: []
}>()

const {t} = useI18n()

const settings = ref<MetaSettings>({
  hidden: false,
  parser: false,
  pathRegex: '',
  pathRegexReplace: '$1',
  pathRegexCreateTags: true,
  pathRegexEnabled: false,
  imageAspectRatio: 1,
  chipLabel: false,
  chipVariant: 'flat',
  color: false,
  autoColorFromImage: false,
  favorite: false,
  rating: false,
  synonyms: false,
  bookmark: false,
  country: false,
  career: false,
  scraper: false,
  nested: false,
  marks: false,
})

const defaultPathRegexSample = getDefaultPathRegexSample()
const pathRegexSamplePath = ref(defaultPathRegexSample.samplePath)
const pathRegexCaptureText = ref(defaultPathRegexSample.captureText)

const metaAiPrompt = computed(() => (
  'Suggest how to configure this MediaChips metadata category (chips). Return JSON with summary, suggestions, explanation.'
))
const metaAiContext = computed(() => ({
  name: props.meta?.name,
  type: props.meta?.type,
  settings: settings.value,
}))

const pathRegexReplaceGroups = computed(() => {
  const result = testRegexMatch(settings.value.pathRegex, pathRegexSamplePath.value, 'iu')
  return result.ok ? result.groups : []
})

const selectedPresetId = ref<AspectPresetId>('1:1')
const customWidth = ref(3)
const customHeight = ref(4)
const lastCustomWidth = ref(3)
const lastCustomHeight = ref(4)
const customRatioError = ref('')

const chipVariants: ChipVariant[] = ['flat', 'tonal', 'outlined', 'text']

const isPinnedForMediaParser = ref(false)
const randomColor = ref('#000000')

const showBasics = computed(() => props.sections.includes('basics'))
const showCapabilities = computed(() => props.sections.includes('capabilities'))
const showAppearance = computed(() => props.sections.includes('appearance'))
const showFromPath = computed(() => props.sections.includes('from-path'))

const parseLibraryLink = {
  path: '/settings',
  query: {
    tab: 'library',
    section: 'parse_library_tags',
  },
}

const route = useRoute()
const router = useRouter()

async function goToLibraryParser() {
  emit('close')
  await nextTick()

  const alreadyThere = route.path === '/settings'
    && String(route.query.tab || '') === 'library'
    && String(route.query.section || '') === 'parse_library_tags'

  if (alreadyThere) {
    // Same URL: force PageSettings to re-apply expand + scroll.
    await router.replace({path: '/settings', query: {tab: 'library'}})
    await nextTick()
  }

  await router.push(parseLibraryLink)
}

const BOOLEAN_SETTING_KEYS = new Set<keyof MetaSettings>([
  'hidden',
  'parser',
  'pathRegexCreateTags',
  'pathRegexEnabled',
  'chipLabel',
  'color',
  'autoColorFromImage',
  'favorite',
  'rating',
  'synonyms',
  'bookmark',
  'country',
  'career',
  'scraper',
  'nested',
  'marks',
])

const findMatchingPreset = (ratio: number): AspectRatioPreset | undefined =>
  aspectRatioPresets.find((preset) => Math.abs(preset.value - ratio) < ASPECT_RATIO_EPSILON)

const getSampleStyle = (ratio: number) => {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1
  if (safeRatio >= 1) {
    return {
      width: `${SAMPLE_MAX_SIZE}px`,
      height: `${Math.max(12, Math.round(SAMPLE_MAX_SIZE / safeRatio))}px`,
    }
  }
  return {
    width: `${Math.max(12, Math.round(SAMPLE_MAX_SIZE * safeRatio))}px`,
    height: `${SAMPLE_MAX_SIZE}px`,
  }
}

const customSampleStyle = computed(() => {
  const width = Number(customWidth.value)
  const height = Number(customHeight.value)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return getSampleStyle(settings.value.imageAspectRatio || 1)
  }
  return getSampleStyle(width / height)
})

const syncAspectRatioUi = (ratio: number) => {
  const matched = findMatchingPreset(ratio)
  if (matched) {
    selectedPresetId.value = matched.id
    customRatioError.value = ''
    return
  }

  selectedPresetId.value = 'custom'
  const parts = approxAspectRatioParts(ratio)
  customWidth.value = parts.width
  customHeight.value = parts.height
  lastCustomWidth.value = parts.width
  lastCustomHeight.value = parts.height
  customRatioError.value = ''
}

const selectPreset = (id: AspectPresetId) => {
  selectedPresetId.value = id
  if (id === 'custom') {
    customWidth.value = lastCustomWidth.value
    customHeight.value = lastCustomHeight.value
    applyCustomRatio()
    return
  }

  const preset = aspectRatioPresets.find((item) => item.id === id)
  if (!preset) return
  customRatioError.value = ''
  settings.value.imageAspectRatio = preset.value
}

const applyCustomRatio = () => {
  if (selectedPresetId.value !== 'custom') return

  const width = Number(customWidth.value)
  const height = Number(customHeight.value)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    customRatioError.value = t('meta.settings.image_aspect_ratio_custom_invalid')
    return
  }

  customRatioError.value = ''
  lastCustomWidth.value = width
  lastCustomHeight.value = height
  settings.value.imageAspectRatio = width / height
}

const initSettings = () => {
  if (!props.meta) return

  const nextSettings = {...settings.value}

  for (const key of Object.keys(nextSettings) as Array<keyof MetaSettings>) {
    const value = props.meta[key]
    if (value === undefined || value === null) continue

    ;(nextSettings as Record<string, unknown>)[key] = BOOLEAN_SETTING_KEYS.has(key)
      ? Boolean(value)
      : value
  }

  if (!nextSettings.pathRegexReplace) {
    nextSettings.pathRegexReplace = '$1'
  }
  if (props.meta.pathRegexCreateTags === undefined || props.meta.pathRegexCreateTags === null) {
    nextSettings.pathRegexCreateTags = true
  }
  if (props.meta.pathRegexEnabled === undefined || props.meta.pathRegexEnabled === null) {
    // Legacy: pattern present means extract was on.
    nextSettings.pathRegexEnabled = Boolean(String(nextSettings.pathRegex || '').trim())
  }

  settings.value = nextSettings
  syncAspectRatioUi(Number(nextSettings.imageAspectRatio) || 1)
}

const generateRandomColor = () => {
  const letters = '0123456789ABCDEF'
  let color = '#'
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)]
  }
  randomColor.value = color
  return color
}

const checkPinnedMediaTypes = async () => {
  try {
    const response = await typedApi.getAssignedMetaForMeta(props.meta.id)
    const pinnedMedia = response.data || []

    isPinnedForMediaParser.value = pinnedMedia.some((item) =>
      isVideoMediaType(toMediaType(item.mediaType)) ||
      isImageMediaType(toMediaType(item.mediaType)) ||
      isAudioMediaType(toMediaType(item.mediaType)) ||
      isTextMediaType(toMediaType(item.mediaType))
    )
    emit('pin-state-changed', {
      parser: isPinnedForMediaParser.value,
    })
  } catch (error) {
    console.error('Error checking pinned media:', error)
    isPinnedForMediaParser.value = false
  }
}

const refreshPinState = () => checkPinnedMediaTypes()

onMounted(() => {
  nextTick(() => {
    initSettings()
    checkPinnedMediaTypes()
    generateRandomColor()
  })
})

watch(settings, () => {
  emit('update', settings.value)
}, {deep: true})

watch(() => settings.value.color, (enabled) => {
  if (!enabled) {
    settings.value.autoColorFromImage = false
  }
})

watch(() => props.meta?.id, () => {
  initSettings()
  checkPinnedMediaTypes()
}, {immediate: true})

defineExpose({refreshPinState})
</script>

<style scoped>
.aspect-ratio-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.aspect-ratio-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 72px;
  padding: 10px 12px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.aspect-ratio-card:hover {
  border-color: rgb(var(--v-theme-primary));
}

.aspect-ratio-card--active {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.08);
}

.aspect-ratio-card__label {
  font-size: 0.8125rem;
  line-height: 1.2;
  white-space: nowrap;
}

.aspect-ratio-sample {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 4px;
  background-color: rgba(121, 121, 121, 0.164);
  flex-shrink: 0;
}

.aspect-ratio-sample--custom {
  min-width: 20px;
  min-height: 20px;
}

.aspect-ratio-custom__inputs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.aspect-ratio-custom__field {
  max-width: 110px;
}

.aspect-ratio-custom__sep {
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1;
}

.aspect-ratio-sample--live {
  margin-left: 4px;
}
</style>
