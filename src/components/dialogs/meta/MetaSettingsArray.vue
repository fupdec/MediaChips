<template>
  <SettingsSection padded>
    <v-switch
      v-model="settings.hidden"
      hide-details
      inset
    >
      <template v-slot:label>
        <div class="d-flex flex-column ml-2">
          <div>{{ t('meta.settings.hide_in_navigation') }}</div>
        </div>
      </template>
    </v-switch>

    <v-switch inset
      v-if="editMode"
      :disabled="!isPinnedToVideos"
      v-model="settings.marks"
      hide-details
      class="mt-2">
      <template v-slot:label>
        <div class="d-flex flex-column ml-2">
          <div>{{ t('meta.settings.marks_in_player') }}</div>
          <div class="text-caption mt-1">
            {{ t('meta.settings.marks_in_player_hint') }}
          </div>
        </div>
      </template>
    </v-switch>

    <v-switch inset
      v-if="editMode"
      :disabled="!isPinnedForMediaParser"
      v-model="settings.parser"
      hide-details
      class="mt-2">
      <template v-slot:label>
        <div class="d-flex flex-column ml-2">
          <div>
            {{ t('meta.settings.parse_media_for_tags') }}
            <button-documentation id="media.parser"></button-documentation>
          </div>
        </div>
      </template>
    </v-switch>

    <v-alert
      v-if="editMode && !isPinnedForMediaParser"
      type="info"
      class="text-caption mt-4 mb-4"
      variant="tonal"
      density="compact"
      rounded="xl"
      closable
    >
      {{ t('meta.settings.active_after_pinning_media') }}
    </v-alert>
  </SettingsSection>

  <SettingsSection padded>
    <settings-category-divider
      icon="shape"
      compact
      :title="t('meta.settings.preset_meta_in_tags')"
    />

    <v-row>
      <v-col cols="12"
        sm="5">
        <v-switch inset
          v-model="settings.rating">
          <template v-slot:label>
            <v-icon color="yellow-darken-2">mdi-star</v-icon>
            <div class=" ml-2">{{ t('meta.types.rating') }}</div>
          </template>
        </v-switch>

        <v-switch inset
          v-model="settings.favorite"
          hide-details>
          <template v-slot:label>
            <v-icon color="pink">mdi-heart</v-icon>
            <div class=" ml-2">{{ t('meta.sorting.favorite') }}</div>
          </template>
        </v-switch>

        <v-switch inset
          v-model="settings.synonyms"
          class="mt-0"
          hide-details>
          <template v-slot:label>
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
      <v-col cols="12"
        sm="7">
        <v-switch inset
          v-model="settings.bookmark"
          class="mt-0"
        >
          <template v-slot:label>
            <div class="d-flex flex-column ml-2">
              <div>
                <v-icon color="red">mdi-bookmark</v-icon>
                {{ t('player.controls.bookmark') }}
              </div>
              <div class="text-caption mt-1">{{ t('meta.settings.bookmark_hint') }}</div>
            </div>
          </template>
        </v-switch>

        <v-switch inset
          v-model="settings.country"
          class="mt-0"
          hide-details>
          <template v-slot:label>
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
          <v-icon v-if="settings.chipVariant == variant"
            start>mdi-check
          </v-icon>
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
      <v-col cols="12"
        sm="5">
        <v-switch v-model="settings.color"
          :label="t('settings_labels.appearance.colors')"
          class="my-0"
          hide-details
          inset/>
      </v-col>

      <v-col cols="12"
        sm="7">
        <v-switch v-model="settings.chipLabel"
          :label="t('meta.settings.label')"
          class="my-0"
          hide-details
          inset/>
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
      icon="mdi-content-save-alert"
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
        <span
          class="aspect-ratio-sample"
          :style="getSampleStyle(preset.value)"
        >
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

    <div
      v-if="selectedPresetId === 'custom'"
      class="aspect-ratio-custom mt-4"
    >
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
      <div
        v-if="customRatioError"
        class="text-caption text-error mt-1"
      >
        {{ customRatioError }}
      </div>
    </div>
  </SettingsSection>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, watch, nextTick} from 'vue'
import type {PropType} from 'vue'
import {useI18n} from 'vue-i18n'
import {isVideoMediaType, isImageMediaType, isAudioMediaType, isTextMediaType} from '@/utils/mediaType'
import {approxAspectRatioParts} from '@/utils/aspectRatioParts'
import {typedApi} from '@/services/typedApi'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import SettingsSection from '@/components/ui/SettingsSection.vue'
import ButtonDocumentation from '@/components/ui/ButtonDocumentation.vue'
import type {Meta} from '@/types/stores'
import type {MediaType} from '@/types/media'

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

const props = defineProps({
  meta: {
    type: Object as PropType<Meta>,
    required: true
  },
  // Режим работы: создание (false) или редактирование (true)
  editMode: {
    type: Boolean,
    default: false
  },
})

// Emits
const emit = defineEmits(['update'])

const {t} = useI18n()

// Refs
const settings = ref<MetaSettings>({
  hidden: false,
  parser: false,
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
  marks: false
})

const selectedPresetId = ref<AspectPresetId>('1:1')
const customWidth = ref(3)
const customHeight = ref(4)
const lastCustomWidth = ref(3)
const lastCustomHeight = ref(4)
const customRatioError = ref('')

const chipVariants: ChipVariant[] = [
  'flat',
  'tonal',
  'outlined',
  'text',
]

const isPinnedToVideos = ref(false)
const isPinnedForMediaParser = ref(false)
const randomColor = ref('#000000')

const BOOLEAN_SETTING_KEYS = new Set<keyof MetaSettings>([
  'hidden',
  'parser',
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
    if (value === undefined) continue

    ;(nextSettings as Record<string, unknown>)[key] = BOOLEAN_SETTING_KEYS.has(key)
      ? Boolean(value)
      : value
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

    isPinnedToVideos.value = pinnedMedia.some((item) => isVideoMediaType(toMediaType(item.mediaType)))
    isPinnedForMediaParser.value = pinnedMedia.some((item) =>
      isVideoMediaType(toMediaType(item.mediaType)) ||
      isImageMediaType(toMediaType(item.mediaType)) ||
      isAudioMediaType(toMediaType(item.mediaType)) ||
      isTextMediaType(toMediaType(item.mediaType))
    )
  } catch (error) {
    console.error('Error checking pinned media:', error)
    isPinnedToVideos.value = false
    isPinnedForMediaParser.value = false
  }
}

// Lifecycle
onMounted(() => {
  nextTick(() => {
    initSettings()
    checkPinnedMediaTypes()
    generateRandomColor()
  })
})

// Watchers
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