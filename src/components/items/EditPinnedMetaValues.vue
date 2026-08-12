<template>
  <div
    class="editing"
    :class="{
      'show-icons': showIcons,
      'editing--hero': layout === 'hero',
      'editing--inspector': layout === 'inspector',
    }"
  >
    <div v-if="layout === 'hero'" class="edit-dialog-hero mb-1">
      <div class="edit-dialog-hero__media">
        <slot name="media"/>
      </div>
      <div class="edit-dialog-hero__overview">
        <EditPinnedOverview
          :item="overviewItem"
          :is-media="isMedia"
          :completion-status="completionStatus"
          :preset-meta="preset_meta"
          @media-path-update="onMediaPathUpdate"
        />
      </div>
    </div>

    <template v-else-if="showOverview">
      <div class="editing-overview">
        <EditPinnedOverview
          :item="overviewItem"
          :is-media="isMedia"
          :completion-status="completionStatus"
          :preset-meta="preset_meta"
          @media-path-update="onMediaPathUpdate"
        />
      </div>
    </template>

    <!-- Main form -->
    <v-form v-model="valid" ref="form" @submit.prevent>
      <v-container fluid class="px-0 editing-form">
        <div v-if="showFieldToolbar" class="editing-section__toolbar">
          <v-text-field
            v-model="fieldSearch"
            :label="t('editing.search_fields')"
            prepend-inner-icon="mdi-magnify"
            density="compact"
            hide-details
            clearable
            rounded="xl"
            variant="outlined"
            class="editing-section__search"
          />
          <v-chip-group
            v-model="fieldFilter"
            class="editing-section__filters"
            selected-class="text-primary"
            mandatory
          >
            <v-chip value="all" filter size="small" variant="tonal">
              {{ t('editing.filter_all') }}
            </v-chip>
            <v-chip value="filled" filter size="small" variant="tonal">
              {{ t('editing.filter_filled') }}
            </v-chip>
            <v-chip value="empty" filter size="small" variant="tonal">
              {{ t('editing.filter_empty', {count: emptyPinnedCount}) }}
            </v-chip>
          </v-chip-group>
        </div>

        <v-row dense>
          <!-- Name field - only for tags -->
          <v-col v-if="isTag && meta" cols="12" :md="fieldMd" :xl="fieldXl" class="field">
            <v-card
              class="editing-field-card rounded-xl"
              :class="fieldCardClass"
              :color="showIcons ? 'rgba(150, 150, 150, 0.09)' : undefined"
              variant="flat"
            >
              <v-text-field
                v-model="vals.name"
                :rules="[nameRules]"
                :prepend-icon="showIcons ? 'mdi-alphabetical-variant' : undefined"
                :label="t('common.name')"
                density="compact"
                variant="filled"
              >
                <template v-if="vals.name !== old.name" #append-inner>
                  <EditingFieldRestoreBtn inline @click="restore('name')" />
                </template>
              </v-text-field>
            </v-card>
          </v-col>

          <!-- Synonyms - only for tags -->
          <v-col v-if="isTag && showSynonymsField" cols="12" :md="fieldMd" :xl="fieldXl" class="field">
            <v-card
              class="editing-field-card rounded-xl"
              :class="fieldCardClass"
              :color="showIcons ? 'rgba(150, 150, 150, 0.09)' : undefined"
              variant="flat"
            >
              <v-text-field
                v-model="vals.synonyms"
                :prepend-icon="showIcons ? 'mdi-alphabetical' : undefined"
                :label="t('filters.sort.synonyms')"
                :hint="t('editing.synonyms_hint')"
                density="compact"
                clearable
                variant="filled"
              >
                <template v-if="vals.synonyms !== old.synonyms" #append-inner>
                  <EditingFieldRestoreBtn inline @click="restore('synonyms')" />
                </template>
              </v-text-field>
            </v-card>
          </v-col>

          <!-- Rating & Favorite -->
          <v-col v-if="ratingEnabled || favoriteEnabled" cols="12" :md="fieldMd" :xl="fieldXl" class="field">
            <v-card
              class="editing-field-card editing-field-card--rating rounded-xl"
              :class="fieldCardClass"
              :color="showIcons ? 'rgba(150, 150, 150, 0.09)' : undefined"
              variant="flat"
            >
              <div class="editing-rating-field editing-rating-field--identity">
                <template v-if="ratingEnabled">
                  <span class="editing-rating-field__name">{{ t('meta.default_names.rating') }}</span>
                  <v-rating
                    v-model="vals.rating"
                    color="yellow-darken-3"
                    background-color="grey-darken-1"
                    empty-icon="mdi-star-outline"
                    half-icon="mdi-star-half-full"
                    half-increments
                    clearable
                    density="compact"
                    :size="ratingSize"
                    hover
                  />
                </template>
                <template v-if="favoriteEnabled">
                  <span
                    v-if="ratingEnabled"
                    class="editing-rating-field__sep"
                    aria-hidden="true"
                  />
                  <span class="editing-rating-field__name">{{ t('meta.default_names.favorite') }}</span>
                  <v-checkbox
                    v-model="vals.favorite"
                    :false-value="0"
                    :true-value="1"
                    false-icon="mdi-heart-outline"
                    true-icon="mdi-heart"
                    color="pink"
                    density="compact"
                    hide-details
                    class="fav-btn"
                    v-tooltip:top="t('meta.default_names.favorite')"
                  />
                </template>
              </div>
              <EditingFieldRestoreBtn
                v-if="!equalOld('rating') || !equalOld('favorite')"
                @click="restoreIdentityRatingFavorite"
              />
            </v-card>
          </v-col>

          <!-- Number of views -->
          <v-col v-if="viewsEnabled" cols="12" :md="fieldMd" :xl="fieldXl" class="field">
            <v-card
              class="editing-field-card rounded-xl"
              :class="fieldCardClass"
              :color="showIcons ? 'rgba(150, 150, 150, 0.09)' : undefined"
              variant="flat"
            >
              <v-number-input
                v-model="vals.views"
                :label="t('settings_labels.appearance.number_of_views')"
                :prepend-icon="showIcons ? 'mdi-eye' : undefined"
                :min="0"
                :step="1"
                :rules="[numberRules]"
                control-variant="split"
                density="compact"
                hide-details="auto"
                variant="filled"
              >
                <template
                  v-if="!equalOld('views')"
                  #append-inner
                >
                  <EditingFieldRestoreBtn inline @click="restore('views')" />
                </template>
              </v-number-input>
            </v-card>
          </v-col>

          <!-- Color - only for tags -->
          <v-col v-if="isTag && meta?.color" cols="12" :md="fieldMd" :xl="fieldXl" class="field">
            <v-card
              class="editing-field-card rounded-xl"
              :class="fieldCardClass"
              :color="showIcons ? 'rgba(150, 150, 150, 0.09)' : undefined"
              variant="flat"
            >
              <v-text-field
                :model-value="vals.color || ''"
                :label="t('meta.default_names.color')"
                :prepend-icon="showIcons ? 'mdi-palette-outline' : undefined"
                density="compact"
                variant="filled"
                readonly
                hide-details
                class="editing-color-field"
                @click="pickColor"
              >
                <template #prepend-inner>
                  <v-icon
                    :color="vals.color || 'grey'"
                    size="20"
                    class="editing-color-field__swatch"
                    @click.stop="pickColor"
                  >
                    mdi-circle
                  </v-icon>
                </template>
                <template #append-inner>
                  <v-btn
                    @click.stop="pickColorFromImage"
                    :disabled="!hasMainTagImage"
                    v-tooltip:top="t('meta.settings.color_from_image')"
                    class="editing-color-field__eyedropper"
                    variant="text"
                    size="x-small"
                    icon
                  >
                    <v-icon size="18">mdi-eyedropper</v-icon>
                  </v-btn>
                  <EditingFieldRestoreBtn
                    v-if="!equalOld('color')"
                    inline
                    @click="restore('color')"
                  />
                </template>
              </v-text-field>
            </v-card>
          </v-col>

          <!-- Country - only for tags -->
          <v-col v-if="isTag && showCountryField" cols="12" :md="fieldMd" :xl="fieldXl" class="field">
            <v-card
              class="editing-field-card rounded-xl"
              :class="fieldCardClass"
              :color="showIcons ? 'rgba(150, 150, 150, 0.09)' : undefined"
              variant="flat"
            >
              <MetaInputCountry
                @update:model-value="setValByKey($event, 'country')"
                :model-value="vals.country || []"
                variant="filled"
                density="compact"
                hide-details
              />
              <EditingFieldRestoreBtn
                v-if="!equalOld('country', 'array')"
                @click="restore('country')"
              />
            </v-card>
          </v-col>

          <!-- Combined tags from all pinned array categories -->
          <v-col
            v-if="showMixedTagsField"
            cols="12"
            class="field"
          >
            <v-card
              class="editing-field-card rounded-xl"
              :class="fieldCardClass"
              :color="showIcons ? 'rgba(150, 150, 150, 0.09)' : undefined"
              variant="flat"
            >
              <MetaInputMixedTags
                :key="`mixed_${currentItemId}`"
                :ref="setMixedTagsRef"
                :meta-ids="mixedMetaIds"
                :model-value="mixedTagsValue"
                @update:model-value="setMixedTagsValue"
                variant="filled"
                density="compact"
                hide-details
              />
              <EditingFieldRestoreBtn
                v-if="mixedTagsDirty"
                @click="restoreMixedTags"
              />
            </v-card>
          </v-col>

          <!-- Assigned/Pinned metadata -->
          <v-col
            v-for="item in visibleAssignedItems"
            :key="`${currentItemId}_${item.pinnedMetaId || item.metaId}`"
            cols="12"
            :md="fieldMd"
            :xl="fieldXl"
            class="field"
          >
            <v-card
              class="editing-field-card rounded-xl"
              :class="fieldCardClass"
              :color="showIcons ? 'rgba(150, 150, 150, 0.09)' : undefined"
              variant="flat"
            >
              <MetaInputArray
                v-if="item.meta?.type === 'array'"
                @update:model-value="setVal($event, getItemKey(item))"
                :model-value="getArrayVal(item)"
                :meta-id="getMetaIdNumber(item)"
                :key="`${currentItemId}_${getItemKey(item)}`"
                :ref="el => setMetaInputRef(el, getItemKey(item))"
                density="compact"
                multiple
              />

              <v-number-input
                v-if="item.meta?.type === 'number'"
                :model-value="getNumberVal(item)"
                @update:model-value="setVal($event, getItemKey(item))"
                :label="metaName(item)"
                :hint="metaHint(item)"
                :prepend-icon="showIcons ? `mdi-${metaIcon(item)}` : undefined"
                :rules="[numberRules]"
                control-variant="split"
                density="compact"
                persistent-hint
                clearable
                variant="filled"
              >
                <template
                  v-if="!equalOld(getItemKey(item), item.meta?.type)"
                  #append-inner
                >
                  <EditingFieldRestoreBtn inline @click="restore(getItemKey(item))" />
                </template>
              </v-number-input>

              <v-text-field
                v-if="item.meta?.type === 'string'"
                :model-value="getStringVal(item)"
                @update:model-value="setVal($event, getItemKey(item))"
                :label="metaName(item)"
                :hint="metaHint(item)"
                :prepend-icon="showIcons ? `mdi-${metaIcon(item)}` : undefined"
                density="compact"
                persistent-hint
                clearable
                variant="filled"
              >
                <template
                  v-if="!equalOld(getItemKey(item), item.meta?.type)"
                  #append-inner
                >
                  <EditingFieldRestoreBtn inline @click="restore(getItemKey(item))" />
                </template>
              </v-text-field>

              <v-checkbox
                v-if="item.meta?.type === 'boolean'"
                :model-value="getBooleanVal(item)"
                @update:model-value="setVal($event, getItemKey(item))"
                :label="metaName(item)"
                :hint="metaHint(item)"
                :prepend-icon="showIcons ? `mdi-${metaIcon(item)}` : undefined"
                density="compact"
                persistent-hint
              />

              <v-text-field
                v-if="item.meta?.type === 'date'"
                @click="pickDate(getItemKey(item))"
                :model-value="getStringVal(item)"
                :label="metaName(item)"
                :hint="metaHint(item)"
                :prepend-icon="showIcons ? `mdi-${metaIcon(item)}` : undefined"
                density="compact"
                persistent-hint
                readonly
                clearable
                variant="filled"
              >
                <template
                  v-if="!equalOld(getItemKey(item), item.meta?.type)"
                  #append-inner
                >
                  <EditingFieldRestoreBtn inline @click="restore(getItemKey(item))" />
                </template>
              </v-text-field>

              <div v-if="item.meta?.type === 'rating'" class="editing-rating-field">
                <v-icon
                  v-if="showIcons"
                  class="editing-rating-field__icon"
                  size="20"
                  :icon="`mdi-${metaIcon(item)}`"
                />
                <span class="editing-rating-field__name">{{ metaName(item) }}</span>
                <div class="editing-rating-field__rating">
                  <v-rating
                    :model-value="getRatingVal(item)"
                    @update:model-value="setVal($event, getItemKey(item))"
                    :length="metaRatingMax(item)"
                    :full-icon="`mdi-${metaRatingIcon(item)}`"
                    :empty-icon="`mdi-${metaRatingIconEmpty(item)}`"
                    :half-increments="metaRatingHalf(item)"
                    :half-icon="`mdi-${metaRatingIconHalf(item)}`"
                    :active-color="metaRatingColor(item)"
                    color="grey-darken-1"
                    density="compact"
                    size="28"
                    clearable
                    hover
                  />
                  <div
                    v-if="metaHint(item)"
                    class="editing-rating-field__hint"
                  >
                    {{ metaHint(item) }}
                  </div>
                </div>
              </div>

              <EditingFieldRestoreBtn
                v-if="!['number', 'string', 'date'].includes(item.meta?.type || '') && !equalOld(getItemKey(item), item.meta?.type)"
                @click="restore(getItemKey(item))"
              />
            </v-card>
          </v-col>

          <!-- Bookmark -->
          <v-col cols="12" :md="fieldMd" :xl="fieldXl" class="field">
            <v-card
              class="editing-field-card rounded-xl"
              :class="fieldCardClass"
              :color="showIcons ? 'rgba(150, 150, 150, 0.09)' : undefined"
              variant="flat"
            >
              <v-textarea
                v-model="vals.bookmark"
                :prepend-icon="showIcons ? 'mdi-bookmark' : undefined"
                :label="t('meta.default_names.bookmark')"
                density="compact"
                hide-details
                clearable
                auto-grow
                rows="1"
                variant="filled"
              >
                <template v-if="vals.bookmark !== old.bookmark" #append-inner>
                  <EditingFieldRestoreBtn inline @click="restore('bookmark')" />
                </template>
              </v-textarea>
            </v-card>
          </v-col>
        </v-row>

        <div
          v-if="showFieldToolbar && visibleAssignedItems.length === 0 && !showMixedTagsField && assignedItems.length > 0"
          class="editing-section__empty text-medium-emphasis text-body-2 mt-2"
        >
          {{ t('editing.no_matching_fields') }}
        </div>
      </v-container>
    </v-form>

    <!-- Color picker dialog - only for tags -->
    <ColorPicker
      v-if="colorPicker.dialog"
      v-model="colorPicker.dialog"
      :color="colorPicker.color ?? '#777'"
      @get-color="setColor"
    />

    <!-- Date picker dialog -->
    <v-dialog v-model="datePicker.dialog" width="300">
      <v-date-picker
        @update:model-value="setDate"
        :model-value="datePicker.value"
        :title="t('filters.select_date')"
        :header="t('filters.enter_date')"
        color="primary"
        rounded="xl"
      />
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, onUnmounted, watch, reactive} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'
import {useItemsStore} from '@/stores/items'
import {useDialogsStore} from '@/stores/dialogs'
import {useScraperStore} from '@mediachips/plugin-adult/stores/scraper'
import {useSceneScraperStore} from '@mediachips/plugin-adult/stores/sceneScraper'
import {useEventBus} from '@/utils/eventBus'
import {parseCountries, serializeCountries} from '@/utils/country'
import {typedApi} from '@/services/typedApi'
import {createImage, createUnavailableImage, checkFileExists} from '@/services/fileService'
import {refreshMediaFileInfo} from '@/services/mediaFileInfoService'
import {setNotification} from '@/services/notificationService'
import {
  cloneMetaFieldValue,
  cloneMetaValues,
  metaArrayValuesEqual,
} from '@/utils/metaValuesClone'
import path from 'path-browserify'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/en'
import 'dayjs/locale/de'
import 'dayjs/locale/fr'
import 'dayjs/locale/ja'
import 'dayjs/locale/pt-br'
import 'dayjs/locale/es'
import 'dayjs/locale/zh-cn'
import 'dayjs/locale/ru'
import {usePresetMeta} from '@/composable/ItemPresetMeta'
import {sortPinnedAssignmentItems} from '@/utils/pinnedMetaOrder'
import {
  DEFAULT_TAG_COLOR,
  extractColorFromImageUrl,
  extractColorFromLocalFile,
  isDefaultTagColor,
} from '@/utils/colorFromImage'
import {getCachedThumb, tagThumbKey} from '@/utils/thumbDisplayCache'
import {refreshTagThumbDisplay} from '@/utils/tagThumbRefresh'
import {isThumbUnavailable, resolveTagThumbDisplayUrl} from '@/utils/thumbSource'
import {
  TAG_AVATAR_SAVE_WIDTH,
  TAG_HEADER_SAVE_WIDTH,
  TAG_IMAGE_SAVE_WIDTH,
} from '@shared/tagImages'
import type {PresetMetaProps} from '@/types/itemsPage'
import type {
  ScraperImageAssignment,
  ScraperImageSlot,
  ScraperPinnedItem,
  ScraperTransferField,
} from '@mediachips/plugin-adult/types/scraper'
import {isScraperImageSlot} from '@mediachips/plugin-adult/utils/scraperPosters'
import type {AssignedMeta, MediaItem, Meta, Tag} from '@/types/stores'
import type { TagInTagEntry, ValueInTagEntry, EntityUpdatePayload } from '@shared/api/responses'
import type {VFormInstance} from '@/types/vue'
import {
  parseMetaBooleanValue,
  serializeMetaBooleanValue,
} from '@shared/schemas/coercion'

// Components
import MetaInputArray from '@/components/meta/input/MetaInputArray.vue'
import MetaInputMixedTags from '@/components/meta/input/MetaInputMixedTags.vue'
import MetaInputCountry from '@/components/meta/input/MetaInputCountry.vue'
import EditPinnedOverview from '@/components/items/EditPinnedOverview.vue'
import ColorPicker from '@/components/elements/ColorPicker.vue'
import EditingFieldRestoreBtn from '@/components/items/EditingFieldRestoreBtn.vue'

type EditLayout = 'default' | 'hero' | 'inspector'

type PinnedMetaAssignment = AssignedMeta

type MetaFieldValue = string | number | boolean | string[] | number[] | null | undefined

interface PinnedMetaValues {
  name?: string | null
  color?: string | null
  synonyms?: string | null
  rating?: number
  favorite?: number
  views?: number
  bookmark?: string | null
  country?: string[] | null
  [key: string]: MetaFieldValue
}

interface EntityUpdateFormValues extends Omit<PinnedMetaValues, 'country'> {
  country?: string[] | null
}

interface TagInTagPayload {
  parentTagId: number
  tagId: number
  metaId: string | number
}

interface TagInMediaPayload {
  mediaId: number
  tagId: number
  metaId: string | number
}

interface ValueInTagPayload {
  value: unknown
  tagId: number
  metaId: string | number
}

interface ValueInMediaPayload {
  value: unknown
  mediaId: number
  metaId: string | number
}

interface MetaInputArrayInstance {
  create: (name: string) => void
}

interface MetaInputMixedTagsInstance {
  create: (name?: string, metaId?: number) => void | Promise<void>
}

const props = withDefaults(defineProps<{
  layout?: EditLayout
  showOverview?: boolean
  tag?: Tag | null
  meta?: Meta | null
  media?: MediaItem | null
}>(), {
  layout: 'default',
  showOverview: true,
  tag: null,
  meta: null,
  media: null,
})

const emit = defineEmits<{
  close: []
  'dirty-change': [dirty: boolean]
  saved: [payload: {id: number; type: 'tag' | 'media'}]
}>()

const isInspectorLayout = computed(() => props.layout === 'inspector')
const fieldMd = computed(() => (isInspectorLayout.value ? 12 : 6))
const fieldXl = computed(() => (isInspectorLayout.value ? 12 : 4))
const ratingSize = computed(() => (isInspectorLayout.value ? 22 : 28))

const isTag = computed(() => !!props.tag)
const isMedia = computed(() => !props.tag && !!props.media)
const mediaOverride = ref<MediaItem | null>(null)
const currentItem = computed((): MediaItem | Tag | null => {
  if (isTag.value) return props.tag ?? null
  return mediaOverride.value || props.media
})
const currentItemId = computed(() => currentItem.value?.id)
const overviewItem = computed((): MediaItem | Tag => {
  return currentItem.value ?? props.tag ?? props.media ?? {id: 0}
})

const appStore = useAppStore()
const settingsStore = useSettingsStore()
const dialogsStore = useDialogsStore()
const scraperStore = useScraperStore()
const sceneScraperStore = useSceneScraperStore()
const itemsStore = useItemsStore()
const eventBus = useEventBus()
const {t} = useI18n()

const locale = computed(() => settingsStore.locale == 'cn' ? 'zh-cn' : settingsStore.locale == 'pt' ? 'pt-br' : settingsStore.locale)
dayjs.extend(relativeTime)
dayjs.locale(locale.value)

const form = ref<VFormInstance>(null)
const valid = ref(false)
const vals = ref<PinnedMetaValues>({})
const old = ref<PinnedMetaValues>({})
const assignedItems = ref<PinnedMetaAssignment[]>([])
const metaInputRefs = ref<Record<string | number, MetaInputArrayInstance>>({})
const mixedTagsInputRef = ref<MetaInputMixedTagsInstance | null>(null)

const presetMetaInput = reactive<PresetMetaProps>({
  get type() {
    return isTag.value ? 'tag' : 'media'
  },
  get item() {
    return overviewItem.value
  },
  isShowAll: true,
})
const {preset_meta} = usePresetMeta(presetMetaInput)

const colorPicker = ref<{
  dialog: boolean
  color: string | null
}>({
  dialog: false,
  color: null,
})

const datePicker = ref<{
  dialog: boolean
  metaId: string | number | null
  value: string | null
}>({
  dialog: false,
  metaId: null,
  value: null,
})

const settings = computed(() => settingsStore)
const showIcons = computed(() => settings.value.showIconsOfMetaInEditingDialog === '1')
const fieldCardClass = computed(() =>
  showIcons.value ? 'editing-field-card--icons' : 'editing-field-card--plain',
)

const ratingEnabled = computed(() => {
  if (isTag.value) return props.meta?.rating
  if (isMedia.value) return true
  return false
})

const favoriteEnabled = computed(() => {
  if (isTag.value) return props.meta?.favorite
  if (isMedia.value) return true
  return false
})

const showSynonymsField = computed(() => Boolean(props.meta?.synonyms || props.meta?.scraper))
const showCountryField = computed(() => Boolean(props.meta?.country || props.meta?.scraper))

type FieldFilter = 'all' | 'filled' | 'empty'
const FIELD_TOOLBAR_MIN_PINNED = 4
const fieldFilter = ref<FieldFilter>('all')
const fieldSearch = ref('')

const viewsEnabled = computed(() => settingsStore.count_number_of_views === '1')
const showFieldToolbar = computed(() => assignedItems.value.length > FIELD_TOOLBAR_MIN_PINNED)

const isValueFilled = (val: MetaFieldValue, type?: string): boolean => {
  if (val === undefined || val === null || val === '') return false
  if (type === 'boolean' || typeof val === 'boolean') return true
  if (type === 'number' || type === 'rating' || typeof val === 'number') {
    const n = Number(val)
    return Number.isFinite(n) && n > 0
  }
  if (typeof val === 'string' || Array.isArray(val)) return val.length > 0
  return false
}

const matchesFieldSearch = (label: string): boolean => {
  const query = fieldSearch.value.trim().toLowerCase()
  if (!query) return true
  return label.toLowerCase().includes(query)
}

const shouldShowPinnedField = (options: {
  label: string
  filled: boolean
  dirty: boolean
}): boolean => {
  if (!showFieldToolbar.value) return true
  if (!matchesFieldSearch(options.label)) return false
  if (options.dirty) return true
  if (fieldFilter.value === 'all') return true
  if (fieldFilter.value === 'filled') return options.filled
  return !options.filled
}

const useMixedTagsInput = computed(() => settingsStore.mixedTagsInputInEditingDialog === '1')

const visibleAssignedItems = computed(() =>
  assignedItems.value.filter((item) => {
    if (useMixedTagsInput.value && item.meta?.type === 'array') return false
    const key = getItemKey(item)
    return shouldShowPinnedField({
      label: metaName(item) || '',
      filled: isValueFilled(vals.value[key], item.meta?.type),
      dirty: !equalOld(key, item.meta?.type),
    })
  }),
)

const arrayAssignedItems = computed(() =>
  assignedItems.value.filter((item) => item.meta?.type === 'array'),
)

const mixedMetaIds = computed(() =>
  arrayAssignedItems.value
    .map((item) => getMetaIdNumber(item))
    .filter((id) => Number.isFinite(id) && id > 0),
)

const mixedTagsValue = computed(() => {
  const keys: string[] = []
  for (const item of arrayAssignedItems.value) {
    const metaId = getMetaIdNumber(item)
    const tagIds = getArrayVal(item) || []
    for (const tagId of tagIds) {
      const id = Number(tagId)
      if (!Number.isFinite(id)) continue
      keys.push(`${metaId}:${id}`)
    }
  }
  return keys
})

const mixedTagsDirty = computed(() =>
  arrayAssignedItems.value.some((item) => !equalOld(getItemKey(item), 'array')),
)

const mixedTagsFilled = computed(() =>
  arrayAssignedItems.value.some((item) =>
    isValueFilled(vals.value[getItemKey(item)], 'array'),
  ),
)

const showMixedTagsField = computed(() => {
  if (!useMixedTagsInput.value || !arrayAssignedItems.value.length) return false
  return shouldShowPinnedField({
    label: t('meta.fields.mixed_tags_label'),
    filled: mixedTagsFilled.value,
    dirty: mixedTagsDirty.value,
  })
})

const setMixedTagsValue = (keys: string[]) => {
  const byMeta = new Map<number, number[]>()
  for (const key of keys) {
    const [metaPart, tagPart] = String(key).split(':')
    const metaId = Number(metaPart)
    const tagId = Number(tagPart)
    if (!metaId || !tagId) continue
    const list = byMeta.get(metaId) || []
    if (!list.includes(tagId)) list.push(tagId)
    byMeta.set(metaId, list)
  }

  for (const item of arrayAssignedItems.value) {
    const metaId = getMetaIdNumber(item)
    setVal(byMeta.get(metaId) || [], getItemKey(item))
  }
}

const restoreMixedTags = () => {
  for (const item of arrayAssignedItems.value) {
    restore(getItemKey(item))
  }
}

const emptyPinnedCount = computed(() =>
  assignedItems.value.filter((item) =>
    !isValueFilled(vals.value[getItemKey(item)], item.meta?.type),
  ).length,
)

const isDirty = computed(() => {
  const keys = new Set<string>([
    ...Object.keys(vals.value),
    ...Object.keys(old.value),
  ])
  for (const key of keys) {
    const assigned = assignedItems.value.find((item) => String(getItemKey(item)) === key)
    const type = assigned?.meta?.type ?? (key === 'country' ? 'array' : undefined)
    if (!equalOld(key, type)) return true
  }
  return false
})

// Methods

const nameRules = (value: string) => {
  if (!value || value.trim().length === 0) {
    return t('validation.name_required')
  }
  return true
}

const numberRules = (value: unknown) => {
  if (value == null || value === '') return true
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) || t('validation.incorrect_value')
}

const getItemKey = (item: PinnedMetaAssignment): string | number => {
  return item.pinnedMetaId ?? item.metaId ?? item.id ?? ''
}

const getMetaIdNumber = (item: PinnedMetaAssignment): number => Number(getItemKey(item))

const getArrayVal = (item: PinnedMetaAssignment): number[] | undefined => {
  const val = vals.value[getItemKey(item)]
  return Array.isArray(val) ? val as number[] : undefined
}

const getStringVal = (item: PinnedMetaAssignment): string | undefined => {
  const val = vals.value[getItemKey(item)]
  if (val == null) return undefined
  return String(val)
}

const getNumberVal = (item: PinnedMetaAssignment): number | null => {
  const val = vals.value[getItemKey(item)]
  if (val == null || val === '') return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

const getBooleanVal = (item: PinnedMetaAssignment): boolean => {
  const val = vals.value[getItemKey(item)]
  return parseMetaBooleanValue(val)
}

const getRatingVal = (item: PinnedMetaAssignment): number | undefined => {
  const val = vals.value[getItemKey(item)]
  if (val == null || val === '') return undefined
  const n = Number(val)
  return isNaN(n) ? undefined : n
}

const metaName = (item: PinnedMetaAssignment): string | undefined => item.meta?.name as string | undefined
const metaHint = (item: PinnedMetaAssignment): string | undefined => item.meta?.hint as string | undefined
const metaIcon = (item: PinnedMetaAssignment): string | undefined => item.meta?.icon as string | undefined
const metaRatingMax = (item: PinnedMetaAssignment): number | undefined => Number(item.meta?.ratingMax) || undefined
const metaRatingIcon = (item: PinnedMetaAssignment): string | undefined => item.meta?.ratingIcon as string | undefined
const metaRatingIconEmpty = (item: PinnedMetaAssignment): string | undefined => {
  return (item.meta?.ratingIconEmpty || item.meta?.ratingIcon) as string | undefined
}
const metaRatingHalf = (item: PinnedMetaAssignment): boolean | undefined => Boolean(item.meta?.ratingHalf)
const metaRatingIconHalf = (item: PinnedMetaAssignment): string | undefined => {
  return (item.meta?.ratingIconHalf || item.meta?.ratingIcon) as string | undefined
}
const metaRatingColor = (item: PinnedMetaAssignment): string | undefined => item.meta?.ratingColor as string | undefined

const findAssignedItemByMetaId = (metaId: string | number): PinnedMetaAssignment | undefined => {
  return assignedItems.value.find((item) =>
    Number(getItemKey(item)) === Number(metaId)
    || Number(item.meta?.id) === Number(metaId)
  )
}

const resolveItemKey = (metaId: string | number): string | number => {
  const item = findAssignedItemByMetaId(metaId)
  return item ? getItemKey(item) : metaId
}

const getDefaultMetaValue = (type?: string): MetaFieldValue => {
  if (type === 'array') return []
  if (type === 'boolean') return false
  return null
}

const initBaseValues = (tagSource?: Tag | null) => {
  if (isTag.value) {
    const tag = tagSource ?? props.tag
    if (!tag) return

    const countries = parseCountries(tag.country as string | undefined)
    vals.value = {
      country: countries,
      name: tag.name || null,
      color: (tag.color as string | undefined) || DEFAULT_TAG_COLOR,
      synonyms: tag.synonyms || null,
      rating: Number(tag.rating) || 0,
      favorite: Number(tag.favorite) || 0,
      views: Number(tag.views) || 0,
      bookmark: tag.bookmark || null,
    }
    return
  }

  if (isMedia.value) {
    const media = mediaOverride.value || props.media
    if (!media) return

    vals.value = {
      name: media.name || media.basename || null,
      rating: Number(media.rating) || 0,
      favorite: Number(media.favorite) || 0,
      views: Number(media.views) || 0,
      bookmark: media.bookmark || null,
    }
  }
}

const setVal = (val: MetaFieldValue, key: string | number) => {
  vals.value[key] = val
}

const setValByKey = (val: MetaFieldValue, key: string | number) => {
  setVal(val, key)
}

const pickColor = () => {
  colorPicker.value.color = (vals.value.color as string | undefined) ?? DEFAULT_TAG_COLOR
  colorPicker.value.dialog = true
}

const tryApplyAutoColorFromImage = (color: string) => {
  if (!isTag.value || !props.meta?.color || !props.meta?.autoColorFromImage) return
  if (!isDefaultTagColor(vals.value.color)) return

  vals.value.color = color
}

const hasMainTagImage = computed(() => {
  if (!isTag.value || !props.meta || !props.tag) return false

  const url = resolveTagThumbDisplayUrl({
    dbPath: appStore.dbPath,
    metaId: props.meta.id,
    tagId: props.tag.id,
    type: 'main',
  })

  return !isThumbUnavailable(url)
})

const pickColorFromImage = async () => {
  if (!isTag.value || !props.meta?.color || !props.tag) return

  const cached = getCachedThumb(tagThumbKey(props.meta.id, props.tag.id, 'main'))
  let color: string

  if (cached?.startsWith('data:')) {
    color = await extractColorFromImageUrl(cached)
  } else {
    const filePath = path.join(
      appStore.dbPath,
      'meta',
      `${props.meta.id}`,
      `${props.tag.id}_main.jpg`,
    )
    color = await extractColorFromLocalFile(filePath)
  }

  if (isDefaultTagColor(color)) return

  vals.value.color = color
}

const setColor = (color: string) => {
  vals.value.color = color
  colorPicker.value.dialog = false
}

const pickDate = (metaId: string | number) => {
  datePicker.value.dialog = true
  datePicker.value.value = vals.value[metaId] as string | null
  datePicker.value.metaId = metaId
}

const setDate = (date: string | Date | null) => {
  datePicker.value.dialog = false
  if (datePicker.value.metaId != null && date) {
    vals.value[datePicker.value.metaId] = dayjs(date).format('YYYY-MM-DD')
  }
}

const equalOld = (metaId: string | number, metaType?: string) => {
  const val = vals.value[metaId]
  const oldVal = old.value[metaId]

  if (metaType === 'array') {
    return metaArrayValuesEqual(val, oldVal)
  }
  return val === oldVal
}

const restore = (key: string | number) => {
  vals.value[key] = cloneMetaFieldValue(old.value[key])
}

const restoreIdentityRatingFavorite = () => {
  if (ratingEnabled.value) restore('rating')
  if (favoriteEnabled.value) restore('favorite')
}

const discard = () => {
  vals.value = cloneMetaValues(old.value)
}

const getIsDirty = () => isDirty.value

watch(isDirty, (dirty) => emit('dirty-change', dirty), {immediate: true})

const applyMediaFileInfo = (fileInfo: Partial<MediaItem> | null) => {
  if (!fileInfo || !isMedia.value) return

  const base = mediaOverride.value || props.media
  if (!base) return

  mediaOverride.value = {...base, ...fileInfo}

  const mediaId = Number(base.id)
  if (mediaId) {
    // Bust thumb caches so the dialog reloads after image probe/thumb regen.
    itemsStore.refreshThumb(mediaId)
  }
}

const refreshEditingMediaFileInfo = async () => {
  if (!isMedia.value || currentItemId.value == null) return

  const fileInfo = await refreshMediaFileInfo(Number(currentItemId.value))
  applyMediaFileInfo(fileInfo)
}

const onMediaPathUpdate = (updatedMedia: MediaItem) => {
  if (!isMedia.value) return
  mediaOverride.value = updatedMedia
  // Keep form name in sync with path rename. Save writes MEDIA_ENTITY_FIELD_KEYS
  // including name; without this, Save reverts the wall title to the stale stem.
  if (updatedMedia.name != null) {
    vals.value.name = updatedMedia.name
    old.value.name = updatedMedia.name
  }
  void refreshEditingMediaFileInfo()
}

const setMetaInputRef = (el: unknown, metaId: string | number) => {
  if (el) {
    metaInputRefs.value[metaId] = el as MetaInputArrayInstance
  }
}

const setMixedTagsRef = (el: unknown) => {
  mixedTagsInputRef.value = el ? el as MetaInputMixedTagsInstance : null
}

const getMetaValues = async () => {
  try {
    if (!currentItemId.value) return

    let tags: TagInTagEntry[] = []
    let values: ValueInTagEntry[] = []

    if (isTag.value && props.meta) {
      const tagsResponse = await typedApi.getTagsInTag(currentItemId.value)
      tags = tagsResponse.data

      const valuesResponse = await typedApi.getValuesInTag(currentItemId.value)
      values = valuesResponse.data

      const pinnedResponse = await typedApi.getPinnedChildMeta(props.meta.id)
      assignedItems.value = sortPinnedAssignmentItems(pinnedResponse.data)
      scraperStore.pinned = assignedItems.value as ScraperPinnedItem[]

    } else if (isMedia.value) {
      const tagsResponse = await typedApi.getTagsInMedia(currentItemId.value)
      tags = tagsResponse.data

      const valuesResponse = await typedApi.getValuesInMedia(currentItemId.value)
      values = valuesResponse.data

      const mediaTypeId = props.media?.mediaTypeId ?? itemsStore.environment?.media_type_id
      if (mediaTypeId) {
        const pinnedResponse = await typedApi.getAssignedMetaForMediaType(mediaTypeId)
        assignedItems.value = sortPinnedAssignmentItems(pinnedResponse.data)
        sceneScraperStore.pinned = assignedItems.value as ScraperPinnedItem[]
      } else {
        assignedItems.value = sortPinnedAssignmentItems(itemsStore.safeAssigned)
        sceneScraperStore.pinned = assignedItems.value as ScraperPinnedItem[]
      }
    }

    for (const item of assignedItems.value) {
      setVal(getDefaultMetaValue(item.meta?.type), getItemKey(item))
    }

    for (const value of values) {
      const item = findAssignedItemByMetaId(value.metaId)
      let val = value.value

      if (item) {
        const type = item.meta?.type
        if (type === 'rating' || type === 'number') {
          if (val == null || val === '') {
            val = null
          } else {
            const n = Number(val)
            val = isNaN(n) ? null : n
          }
        } else if (type === 'boolean') {
          val = parseMetaBooleanValue(val)
        }
      }

      setVal(val as MetaFieldValue, resolveItemKey(value.metaId))
    }

    const parsedTags: Record<string, number[]> = {}
    for (const tag of tags) {
      const metaIdKey = String(tag.metaId)
      const tagId = Number(tag.tagId)
      if (!Number.isFinite(tagId)) continue
      if (!parsedTags[metaIdKey]) {
        parsedTags[metaIdKey] = [tagId]
      } else if (!parsedTags[metaIdKey].includes(tagId)) {
        parsedTags[metaIdKey].push(tagId)
      }
    }

    for (const metaId in parsedTags) {
      setVal(parsedTags[metaId], resolveItemKey(metaId))
    }

    old.value = cloneMetaValues(vals.value)

    if (isTag.value) {
      scraperStore.currentValues = vals.value
    } else if (isMedia.value) {
      sceneScraperStore.currentValues = vals.value
    }

  } catch (error) {
    console.error('Error getting meta values:', error)
  }
}

const loadEditingState = async () => {
  if (!currentItemId.value) return

  if (isTag.value) {
    let tagSource = props.tag
    try {
      const response = await typedApi.getTagById(Number(currentItemId.value))
      tagSource = response.data ?? tagSource
    } catch (error) {
      console.error('Error loading tag base values:', error)
    }
    initBaseValues(tagSource)
  } else {
    initBaseValues()
  }

  await getMetaValues()
}

const TAG_ENTITY_FIELD_KEYS = [
  'name',
  'color',
  'synonyms',
  'rating',
  'favorite',
  'views',
  'bookmark',
] as const

const MEDIA_ENTITY_FIELD_KEYS = [
  'name',
  'rating',
  'favorite',
  'views',
  'bookmark',
] as const

const normalizeEntityFieldValue = (
  key: string,
  value: MetaFieldValue,
): MetaFieldValue => {
  switch (key) {
    case 'rating':
    case 'views':
      return value == null || value === '' ? 0 : Number(value) || 0
    case 'favorite':
      return value === true || value === 1 ? 1 : 0
    case 'synonyms':
    case 'bookmark':
    case 'color':
      return value == null || value === '' ? null : value
    case 'name':
      return typeof value === 'string' ? value.trim() : value
    default:
      return value
  }
}

const buildEntityUpdateData = (): EntityUpdatePayload => {
  const cloned = cloneMetaValues(vals.value) as EntityUpdateFormValues
  const {country, ...rest} = cloned
  const updateData: Record<string, MetaFieldValue> = {}
  const fieldKeys = isTag.value ? TAG_ENTITY_FIELD_KEYS : MEDIA_ENTITY_FIELD_KEYS

  for (const key of fieldKeys) {
    if (!(key in rest)) continue
    updateData[key] = normalizeEntityFieldValue(key, rest[key])
  }

  if (isTag.value) {
    updateData.country = country?.length ? serializeCountries(country) : null
  }

  return updateData as EntityUpdatePayload
}

const save = async (options?: {itemId?: number}): Promise<boolean> => {
  if (!form.value) return false

  const targetId = options?.itemId ?? currentItemId.value
  if (targetId == null) return false

  const {valid: isValid} = await form.value.validate()
  if (!isValid) return false

  const tags: Array<TagInTagPayload | TagInMediaPayload> = []
  const values: Array<ValueInTagPayload | ValueInMediaPayload> = []
  const assignedKeys = new Set(
    assignedItems.value.map((item) => String(getItemKey(item)))
  )

  for (const key in vals.value) {
    const isMeta = /\d/.test(key)
    if (!isMeta || !assignedKeys.has(String(key))) continue

    let val = vals.value[key]
    const assignedItem = findAssignedItemByMetaId(key)
    const metaType = assignedItem?.meta?.type
    const valType = typeof val
    const metaId = Number(key)

    if (metaType === 'boolean') {
      val = serializeMetaBooleanValue(val)
    } else if (valType === 'string') {
      val = (val as string).trim()
      if ((val as string).length === 0) val = null
    } else if (Array.isArray(val)) {
      const seenTagIds = new Set<number>()
      for (const rawTagId of val as number[]) {
        const tagId = Number(rawTagId)
        if (!Number.isFinite(tagId) || seenTagIds.has(tagId)) continue
        seenTagIds.add(tagId)
        if (isTag.value) {
          tags.push({
            parentTagId: targetId,
            tagId,
            metaId,
          })
        } else if (isMedia.value) {
          tags.push({
            mediaId: targetId,
            tagId,
            metaId,
          })
        }
      }
    }

    if (isMeta && !Array.isArray(val)) {
      if (isTag.value) {
        values.push({
          value: val,
          tagId: targetId,
          metaId,
        })
      } else if (isMedia.value) {
        values.push({
          value: val,
          mediaId: targetId,
          metaId,
        })
      }
    }
  }

  const updateData = buildEntityUpdateData()

  try {
    const endpoint = isTag.value ? 'tag' : 'media'
    await typedApi.updateEntity(endpoint, targetId, updateData)

    // Keep wall cards in sync immediately (rating/favorite overlays read from the store item).
    itemsStore.updateItem({
      id: targetId,
      item: updateData as Partial<MediaItem>,
    })

    const tagsEndpoint = isTag.value ? 'TagsInTag' : 'TagsInMedia'
    await typedApi.deleteItemTags(tagsEndpoint, targetId)

    if (tags.length > 0) {
      await typedApi.postItemTags(tagsEndpoint, tags)
    }

    const valuesEndpoint = isTag.value ? 'ValuesInTag' : 'ValuesInMedia'
    await typedApi.deleteItemValues(valuesEndpoint, targetId)

    if (values.length > 0) {
      await typedApi.postItemValues(valuesEndpoint, values)
    }

    if (isTag.value && props.meta) {
      refreshTagThumbDisplay(itemsStore, appStore.dbPath, props.meta.id, targetId)
    }

    // Mark clean before a follow-up loadEditingState (inspector item switch).
    old.value = cloneMetaValues(vals.value)
    emit('saved', {id: targetId, type: isTag.value ? 'tag' : 'media'})
    return true
  } catch (error) {
    console.error('Error saving item:', error)
    return false
  }
}

const transferSceneScrapedInfo = async () => {
  if (!isMedia.value) return

  // Manual apply now persists in DialogSceneScraper; reload the open editor form.
  mediaOverride.value = null
  await loadEditingState()
}

function saveSizesForScraperSlot(type: ScraperImageSlot, metaAspectRatio: number) {
  if (type === 'avatar') {
    return {width: TAG_AVATAR_SAVE_WIDTH, height: TAG_AVATAR_SAVE_WIDTH}
  }
  if (type === 'header') {
    return {width: TAG_HEADER_SAVE_WIDTH, height: TAG_HEADER_SAVE_WIDTH / 2.3}
  }
  const ar = Number(metaAspectRatio) || 1
  return {width: TAG_IMAGE_SAVE_WIDTH, height: TAG_IMAGE_SAVE_WIDTH / ar}
}

const transferScrapedInfo = async () => {
  if (!isTag.value || !props.meta || !props.tag) return

  const images = (dialogsStore.scraper?.images || [])
    .filter((item): item is ScraperImageAssignment => (
      Boolean(item?.url)
      && isScraperImageSlot(item?.type)
    ))
  const ar = Number(props.meta.imageAspectRatio) || 1
  const mainSizes = saveSizesForScraperSlot('main', ar)
  const mainImagePath = path.join(
    appStore.dbPath,
    'meta',
    `${props.meta.id}`,
    `${props.tag.id}_main.jpg`,
  )

  let mainSaved = false

  if (images.length > 0) {
    let failedCount = 0

    for (const assignment of images) {
      const imagePath = path.join(
        appStore.dbPath,
        'meta',
        `${props.meta.id}`,
        `${props.tag.id}_${assignment.type}.jpg`,
      )

      const res = await createImage(
        assignment.url,
        imagePath,
        saveSizesForScraperSlot(assignment.type, ar),
      )
      if (res.status != 201) {
        ++failedCount
      } else if (assignment.type === 'main') {
        mainSaved = true
      }
    }

    if (failedCount > 0) {
      setNotification({
        type: failedCount === images.length ? 'error' : 'warning',
        title: t('scraper.error'),
        text: t('scraper.images_import_partial', {
          failed: failedCount,
          total: images.length,
        }),
      })
    }
  }

  if (!mainSaved) {
    const alreadyHasMain = await checkFileExists(mainImagePath)
    if (!alreadyHasMain) {
      const fallback = await createUnavailableImage(mainImagePath, mainSizes)
      mainSaved = fallback.status === 201
    }
  }

  if (
    mainSaved
    && props.meta.autoColorFromImage
    && props.meta.color
    && isDefaultTagColor(vals.value.color)
  ) {
    const color = await extractColorFromLocalFile(mainImagePath)
    if (!isDefaultTagColor(color)) {
      vals.value.color = color
    }
  }

  if (images.length > 0 || mainSaved) {
    eventBus.emit('scraperGotImages')
    dialogsStore.scraper.images = []
    refreshTagThumbDisplay(itemsStore, appStore.dbPath, props.meta.id, props.tag.id)
  }

  const fields = (scraperStore.fields || []) as ScraperTransferField[]

  for (const field of fields) {
    if (field.isTransfered) {
      if (field.dataType === 'array') {
        const metaId = field.meta.id

        if (field.isTagExists) {
          const tags = appStore.getTagsByMetaId(metaId)
          const tag = tags.find((i) => i.name === field.valueScraper)

          if (tag) {
            const arr = [...(vals.value[metaId] as number[] || [])]

            if (!arr.includes(tag.id)) {
              arr.push(tag.id)
              setValByKey(arr, metaId)
            }
          }
        } else {
          const scraperName = String(field.valueScraper ?? '').trim()
          if (!scraperName) {
            // skip
          } else if (useMixedTagsInput.value) {
            void mixedTagsInputRef.value?.create(scraperName, metaId)
          } else {
            const input = metaInputRefs.value[metaId]
            if (input?.create) {
              input.create(scraperName)
            }
          }
        }
      } else if (field.dataType === 'country') {
        setValByKey(field.valueCurrent as MetaFieldValue, 'country')
      } else if (field.dataType === 'synonyms') {
        setValByKey(field.valueCurrent as MetaFieldValue, 'synonyms')
      } else if (field.dataType === 'bookmark') {
        setValByKey(field.valueCurrent as MetaFieldValue, 'bookmark')
      } else {
        setValByKey(field.valueScraper as MetaFieldValue, field.meta.id)
      }
    }
  }
}

// Lifecycle (из первого файла с адаптацией)
onMounted(async () => {
  await loadEditingState()

  // Подписываемся на событие передачи данных из скрапера (только для тегов)
  if (isTag.value) {
    eventBus.on('transferScrapedInfo', transferScrapedInfo)
  } else if (isMedia.value) {
    eventBus.on('transferSceneScrapedInfo', transferSceneScrapedInfo)
    void refreshEditingMediaFileInfo()
  }
})

watch(currentItemId, async (itemId, previousItemId) => {
  if (!itemId || itemId === previousItemId) return
  // Inspector edits in-place: persist pending changes before loading the next item.
  if (isInspectorLayout.value && previousItemId != null && getIsDirty()) {
    await save({itemId: previousItemId})
  }
  await loadEditingState()
  if (isMedia.value) {
    void refreshEditingMediaFileInfo()
  }
})

watch(
  () => dialogsStore.sceneScraper.show,
  (show) => {
    if (!show || !isMedia.value || currentItemId.value == null) return
    sceneScraperStore.transferMediaId = Number(currentItemId.value)
    sceneScraperStore.pinned = assignedItems.value as ScraperPinnedItem[]
    sceneScraperStore.currentValues = vals.value
  },
)

onUnmounted(() => {
  if (isTag.value) {
    eventBus.off('transferScrapedInfo', transferScrapedInfo)
  } else if (isMedia.value) {
    eventBus.off('transferSceneScrapedInfo', transferSceneScrapedInfo)
  }
})

// Computed properties только для тегов (из первого файла)
const completionStatus = computed(() => {
  const completed: number[] = []

  for (const item of assignedItems.value) {
    const val = vals.value[getItemKey(item)]

    if (val === undefined || val === null) {
      completed.push(0)
    } else if (typeof val === 'boolean') {
      completed.push(1)
    } else if (typeof val === 'number') {
      completed.push(val > 0 ? 1 : 0)
    } else if (typeof val === 'string' || Array.isArray(val)) {
      completed.push(val.length > 0 ? 1 : 0)
    } else {
      completed.push(0)
    }
  }

  if (completed.length === 0) return 0

  const completedValue = completed.reduce((sum, value) => sum + value, 0)
  return Math.ceil((completedValue / completed.length) * 100)
})

// Expose methods to parent component
defineExpose({
  save,
  tryApplyAutoColorFromImage,
  discard,
  isDirty: getIsDirty,
})
</script>

<style lang="scss">
.fav-btn {
  .v-selection-control,
  .v-checkbox-btn {
    min-height: 24px !important;
  }
}

.editing-color-field {
  cursor: pointer;

  .v-field {
    cursor: pointer;
  }

  &__swatch {
    cursor: pointer;
  }

  &__eyedropper {
    margin-inline-end: 2px;
  }
}

.editing {
  .editing-field-card {
    position: relative;
  }

  .field {
    position: relative;
  }

  &--inspector {
    .editing-form {
      padding-top: 0 !important;
      padding-bottom: 0 !important;
    }

    .editing-section__toolbar {
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
      margin-bottom: 8px;
    }

    .editing-section__filters {
      flex-wrap: wrap;
    }

    .editing-field-card {
      margin-bottom: 0 !important;
    }

    .editing-field-card--rating {
      min-height: 36px;
      padding: 2px 8px !important;
    }

    .editing-rating-field--identity {
      flex-wrap: wrap;
      row-gap: 6px;
    }

    .editing-rating-field__name {
      font-size: 0.72rem;
    }

    .v-container {
      padding-left: 0 !important;
      padding-right: 0 !important;
    }

    .v-row {
      margin-top: 0 !important;
    }

    .field {
      padding-top: 4px !important;
      padding-bottom: 4px !important;
    }
  }
}
</style>