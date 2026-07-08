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

    <v-radio-group
      v-model="settings.imageAspectRatio"
      inline
      mandatory
      hide-details
      class="mt-2"
    >
      <v-radio :value="1"
        class="mb-4">
        <template v-slot:label>
          1:1
          <span
            class="aspect-ratio-sample"
            :style="`width:${25}px;height:${25}px;`"
          >
            <v-icon size="small">mdi-image-filter-hdr</v-icon>
          </span>
        </template>
      </v-radio>
      <v-radio :value="5 / 8"
        class="mb-4">
        <template v-slot:label>
          5:8
          <span
            class="aspect-ratio-sample"
            :style="`width:${(30 * 5) / 8}px;height:${30}px;`"
          >
            <v-icon size="small">mdi-account</v-icon>
          </span>
        </template>
      </v-radio>
      <v-radio :value="43 / 61"
        class="mb-4">
        <template v-slot:label>
          2:3
          <span
            class="aspect-ratio-sample"
            :style="`width:${(30 * 43) / 61}px;height:${30}px;`"
          >
            <v-icon size="small">mdi-account</v-icon>
          </span>
        </template>
      </v-radio>
      <v-radio :value="16 / 9"
        class="mb-4">
        <template v-slot:label>
          16:9
          <span
            class="aspect-ratio-sample"
            :style="`width:${40}px;height:${(40 / 16) * 9}px;`"
          >
            <v-icon size="small">mdi-image-filter-hdr</v-icon>
          </span>
        </template>
      </v-radio>
    </v-radio-group>
  </SettingsSection>
</template>

<script setup lang="ts">
import {ref, onMounted, watch, nextTick} from 'vue'
import type {PropType} from 'vue'
import {useI18n} from 'vue-i18n'
import {isVideoMediaType, isImageMediaType, isAudioMediaType, isTextMediaType} from '@/utils/mediaType'
import {typedApi} from '@/services/typedApi'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import SettingsSection from '@/components/ui/SettingsSection.vue'
import ButtonDocumentation from '@/components/ui/ButtonDocumentation.vue'
import type {Meta} from '@/types/stores'
import type {MediaType} from '@/types/media'

type ChipVariant = 'flat' | 'tonal' | 'outlined' | 'text'

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
.aspect-ratio-sample {
  border: 1px solid;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 3px;
  margin-right: 20px;
  margin-left: 10px;
  background-color: rgba(121, 121, 121, 0.164);
}
</style>