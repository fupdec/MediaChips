<template>
  <div class="editing" :class="{ 'show-icons': showIcons, 'editing--hero': layout === 'hero' }">
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
      <v-col cols="12">
        <EditPinnedOverview
          :item="overviewItem"
          :is-media="isMedia"
          :completion-status="completionStatus"
          :preset-meta="preset_meta"
          @media-path-update="onMediaPathUpdate"
        />
      </v-col>
    </template>

    <!-- Main form -->
    <v-form v-model="valid" ref="form" @submit.prevent>
      <v-container fluid>
        <v-row>
          <!-- Name field - only for tags -->
          <v-col v-if="isTag && meta" cols="12" md="6" xl="4" class="field">
            <v-card class="rounded-xl pa-4" color="rgba(150, 150, 150, 0.09)" variant="flat">
              <v-text-field
                v-model="vals.name"
                :rules="[nameRules]"
                :prepend-icon="showIcons ? 'mdi-alphabetical-variant' : ''"
                :label="t('common.name')"
                variant="filled"
              />
              <v-btn
                v-if="vals.name !== old.name"
                @click="restore('name')"
                class="restore"
                :title="t('common.restore')"
                variant="plain"
                size="x-small"
                icon
              >
                <v-icon>mdi-restore</v-icon>
              </v-btn>
            </v-card>
          </v-col>

          <!-- Synonyms - only for tags -->
          <v-col v-if="isTag && meta?.synonyms" cols="12" md="6" xl="4" class="field">
            <v-card class="rounded-xl pa-4" color="rgba(150, 150, 150, 0.09)" variant="flat">
              <v-text-field
                v-model="vals.synonyms"
                :prepend-icon="showIcons ? 'mdi-alphabetical' : ''"
                :label="t('filters.sort.synonyms')"
                :hint="t('editing.synonyms_hint')"
                clearable
                variant="filled"
              />
              <v-btn
                v-if="vals.synonyms !== old.synonyms"
                @click="restore('synonyms')"
                class="restore"
                :title="t('common.restore')"
                variant="plain"
                size="x-small"
                icon
              >
                <v-icon>mdi-restore</v-icon>
              </v-btn>
            </v-card>
          </v-col>

          <!-- Rating & Favorite -->
          <v-col v-if="ratingEnabled || favoriteEnabled" cols="12" md="6" xl="4">
            <v-card class="rounded-xl pa-4" color="rgba(150, 150, 150, 0.09)" variant="flat">
              <div class="d-flex justify-space-between">
                <div v-if="ratingEnabled" class="text-medium-emphasis text-caption">
                  {{ t('meta.default_names.rating') }}
                </div>
                <div v-if="favoriteEnabled" class="text-medium-emphasis text-caption">
                  {{ t('meta.default_names.favorite') }}
                </div>
              </div>
              <div class="d-flex justify-space-between">
                <v-rating
                  v-if="ratingEnabled"
                  v-model="vals.rating"
                  color="yellow-darken-3"
                  background-color="grey-darken-1"
                  empty-icon="mdi-star-outline"
                  half-icon="mdi-star-half-full"
                  half-increments
                  clearable
                  density="compact"
                  class="pt-2"
                  hover
                ></v-rating>
                <v-checkbox
                  v-if="favoriteEnabled"
                  v-model="vals.favorite"
                  :false-value="0"
                  :true-value="1"
                  false-icon="mdi-heart-outline"
                  true-icon="mdi-heart"
                  color="pink"
                  hide-details
                  class="fav-btn"
                />
              </div>
            </v-card>
          </v-col>

          <!-- Number of views -->
          <v-col v-if="settingsStore.count_number_of_views === '1'" cols="12" md="6" xl="4">
            <v-card class="rounded-xl pa-4" color="rgba(150, 150, 150, 0.09)" variant="flat">
              <v-text-field
                v-model="vals.views"
                :label="t('settings_labels.appearance.number_of_views')"
                :prepend-icon="showIcons ? 'mdi-eye' : ''"
                type="number"
                hide-details
                variant="filled"
              />
            </v-card>
          </v-col>

          <!-- Color - only for tags -->
          <v-col v-if="isTag && meta?.color" cols="12" md="6" xl="4">
            <v-card class="rounded-xl pa-4" color="rgba(150, 150, 150, 0.09)" variant="flat">
              <div class="text-medium-emphasis text-caption">{{ t('meta.default_names.color') }}</div>
              <v-icon @click="pickColor" :color="vals.color ?? undefined" start>mdi-circle</v-icon>
              <v-btn @click="pickColor" color="primary" variant="flat" rounded="xl">{{ t('settings_labels.appearance.change_color') }}</v-btn>
            </v-card>
          </v-col>

          <!-- Country - only for tags -->
          <v-col v-if="isTag && meta?.country" cols="12" md="6" xl="4">
            <v-card class="rounded-xl pa-4" color="rgba(150, 150, 150, 0.09)" variant="flat">
              <MetaInputCountry
                @update:model-value="setValByKey($event, 'country')"
                :model-value="vals.country || []"
                variant="filled"
                hide-details
              />
            </v-card>
          </v-col>

          <!-- Assigned/Pinned metadata -->
          <v-col
            v-for="(item, index) in assignedItems"
            :key="`${currentItemId}_${item.pinnedMetaId || item.metaId}`"
            cols="12" md="6" xl="4"
            class="field"
          >
            <v-card class="rounded-xl pa-4" color="rgba(150, 150, 150, 0.09)" variant="flat">
              <!-- Array type meta -->
              <MetaInputArray
                v-if="item.meta?.type === 'array'"
                @update:model-value="setVal($event, getItemKey(item))"
                :model-value="getArrayVal(item)"
                :meta-id="getMetaIdNumber(item)"
                :key="`${currentItemId}_${getItemKey(item)}`"
                :ref="el => setMetaInputRef(el, getItemKey(item))"
                multiple
              />

              <!-- Number type meta -->
              <v-text-field
                v-if="item.meta?.type === 'number'"
                :model-value="getNumberVal(item)"
                @update:model-value="setVal($event, getItemKey(item))"
                :label="metaName(item)"
                :hint="metaHint(item)"
                :prepend-icon="showIcons ? `mdi-${metaIcon(item)}` : ''"
                type="number"
                persistent-hint
                clearable
                variant="filled"
              />

              <!-- String type meta -->
              <v-text-field
                v-if="item.meta?.type === 'string'"
                :model-value="getStringVal(item)"
                @update:model-value="setVal($event, getItemKey(item))"
                :label="metaName(item)"
                :hint="metaHint(item)"
                :prepend-icon="showIcons ? `mdi-${metaIcon(item)}` : ''"
                persistent-hint
                clearable
                variant="filled"
              />

              <!-- Boolean type meta -->
              <v-checkbox
                v-if="item.meta?.type === 'boolean'"
                :model-value="getBooleanVal(item)"
                @update:model-value="setVal($event, getItemKey(item))"
                :label="metaName(item)"
                :hint="metaHint(item)"
                :prepend-icon="showIcons ? `mdi-${metaIcon(item)}` : ''"
                persistent-hint
              />

              <!-- Date type meta -->
              <v-text-field
                v-if="item.meta?.type === 'date'"
                @click="pickDate(getItemKey(item))"
                :model-value="getStringVal(item)"
                :label="metaName(item)"
                :hint="metaHint(item)"
                :prepend-icon="showIcons ? `mdi-${metaIcon(item)}` : ''"
                persistent-hint
                readonly
                clearable
                variant="filled"
              />

              <!-- Rating type meta -->
              <div v-if="item.meta?.type === 'rating'" class="d-flex flex-column">
                <div class="text-medium-emphasis text-caption" :class="[{ 'pl-9': showIcons }]">
                  {{ metaName(item) }}
                </div>
                <div class="d-flex">
                  <v-icon v-if="showIcons" :icon="`mdi-${metaIcon(item)}`" start/>
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
                    clearable
                    hover
                  ></v-rating>
                </div>
                <div class="text-medium-emphasis text-caption" :class="[{ 'pl-9': showIcons }]">
                  {{ metaHint(item) }}
                </div>
              </div>

              <v-btn
                v-if="!equalOld(getItemKey(item), item.meta?.type)"
                @click="restore(getItemKey(item))"
                class="restore"
                :title="t('common.restore')"
                variant="plain"
                size="x-small"
                icon
              >
                <v-icon>mdi-restore</v-icon>
              </v-btn>
            </v-card>
          </v-col>

          <!-- Bookmark -->
          <v-col cols="12" md="6" xl="4" class="field">
            <v-card class="rounded-xl pa-4" color="rgba(150, 150, 150, 0.09)" variant="flat">
              <v-textarea
                v-model="vals.bookmark"
                :prepend-icon="showIcons ? 'mdi-bookmark' : ''"
                :label="t('meta.default_names.bookmark')"
                hide-details
                clearable
                auto-grow
                rows="1"
                variant="filled"
              />
              <v-btn
                v-if="vals.bookmark !== old.bookmark"
                @click="restore('bookmark')"
                class="restore"
                :title="t('common.restore')"
                variant="plain"
                size="x-small"
                icon
              >
                <v-icon>mdi-restore</v-icon>
              </v-btn>
            </v-card>
          </v-col>
        </v-row>
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
import {useScraperStore} from '@/stores/scraper'
import {useEventBus} from '@/utils/eventBus'
import {parseCountries, serializeCountries} from '@/utils/country'
import {typedApi} from '@/services/typedApi'
import {createImage} from '@/services/fileService'
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
import 'dayjs/locale/es'
import 'dayjs/locale/zh-cn'
import 'dayjs/locale/ru'
import {usePresetMeta} from '@/composable/ItemPresetMeta'
import {sortPinnedAssignmentItems} from '@/utils/pinnedMetaOrder'
import type {PresetMetaProps} from '@/types/itemsPage'
import type { ScraperPinnedItem } from '@/types/scraper'
import type {AssignedMeta, MediaItem, Meta, Tag} from '@/types/stores'
import type { TagInTagEntry, ValueInTagEntry, EntityUpdatePayload } from '@shared/api/responses'
import type {VFormInstance} from '@/types/vue'

// Components
import MetaInputArray from '@/components/meta/input/MetaInputArray.vue'
import MetaInputCountry from '@/components/meta/input/MetaInputCountry.vue'
import EditPinnedOverview from '@/components/items/EditPinnedOverview.vue'
import ColorPicker from '@/components/elements/ColorPicker.vue'

type EditLayout = 'default' | 'hero'

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

interface ScraperTransferField {
  isTransfered?: boolean
  dataType?: string
  meta: Meta
  isTagExists?: boolean
  valueScraper?: string
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
}>()

const isTag = computed(() => !!props.tag)
const isMedia = computed(() => !props.tag && !!props.media)
const mediaOverride = ref<MediaItem | null>(null)
const currentItem = computed((): MediaItem | Tag | null => {
  if (isTag.value) return props.tag ?? null
  return mediaOverride.value || props.media
})
const currentItemId = computed(() => currentItem.value?.id)
const currentItemType = computed((): 'tag' | 'media' => isTag.value ? 'tag' : 'media')
const overviewItem = computed((): MediaItem | Tag => {
  return currentItem.value ?? props.tag ?? props.media ?? {id: 0}
})

const appStore = useAppStore()
const settingsStore = useSettingsStore()
const dialogsStore = useDialogsStore()
const scraperStore = useScraperStore()
const itemsStore = useItemsStore()
const eventBus = useEventBus()
const {t} = useI18n()

const locale = computed(() => settingsStore.locale == 'cn' ? 'zh-cn' : settingsStore.locale)
dayjs.extend(relativeTime)
dayjs.locale(locale.value)

const form = ref<VFormInstance>(null)
const valid = ref(false)
const vals = ref<PinnedMetaValues>({})
const old = ref<PinnedMetaValues>({})
const assignedItems = ref<PinnedMetaAssignment[]>([])
const metaInputRefs = ref<Record<string | number, MetaInputArrayInstance>>({})

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

// Methods

const nameRules = (value: string) => {
  if (!value || value.trim().length === 0) {
    return t('validation.name_required')
  }
  return true
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

const getNumberVal = (item: PinnedMetaAssignment): number | undefined => {
  const val = vals.value[getItemKey(item)]
  if (val == null || val === '') return undefined
  const n = Number(val)
  return isNaN(n) ? undefined : n
}

const getBooleanVal = (item: PinnedMetaAssignment): boolean | undefined => {
  const val = vals.value[getItemKey(item)]
  return typeof val === 'boolean' ? val : undefined
}

const getRatingVal = (item: PinnedMetaAssignment): number | undefined => {
  const val = vals.value[getItemKey(item)]
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
  if (type === 'number' || type === 'rating') return 0
  return null
}

const initBaseValues = () => {
  if (isTag.value && props.tag) {
    const countries = parseCountries(props.tag.country as string | undefined)
    vals.value = {
      country: countries,
      name: props.tag.name || null,
      color: (props.tag.color as string | undefined) || '#777',
      synonyms: props.tag.synonyms || null,
      rating: Number(props.tag.rating) || 0,
      favorite: Number(props.tag.favorite) || 0,
      views: Number(props.tag.views) || 0,
      bookmark: props.tag.bookmark || null,
    }
    return
  }

  if (isMedia.value && props.media) {
    vals.value = {
      rating: Number(props.media.rating) || 0,
      favorite: Number(props.media.favorite) || 0,
      views: Number(props.media.views) || 0,
      bookmark: props.media.bookmark || null,
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
  colorPicker.value.color = (vals.value.color as string | undefined) ?? '#777'
  colorPicker.value.dialog = true
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

const onMediaPathUpdate = (updatedMedia: MediaItem) => {
  if (!isMedia.value) return
  mediaOverride.value = updatedMedia
}

const setMetaInputRef = (el: unknown, metaId: string | number) => {
  if (el) {
    metaInputRefs.value[metaId] = el as MetaInputArrayInstance
  }
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

      assignedItems.value = sortPinnedAssignmentItems(itemsStore.safeAssigned)
    }

    for (const item of assignedItems.value) {
      setVal(getDefaultMetaValue(item.meta?.type), getItemKey(item))
    }

    for (const value of values) {
      const item = findAssignedItemByMetaId(value.metaId)
      let val = value.value

      if (item) {
        const type = item.meta?.type
        if (type === 'rating') {
          val = Number(val)
          if (isNaN(val as number)) val = 0
        }
      }

      setVal(val as MetaFieldValue, resolveItemKey(value.metaId))
    }

    const parsedTags: Record<string, number[]> = {}
    for (const tag of tags) {
      const metaIdKey = String(tag.metaId)
      if (!parsedTags[metaIdKey]) {
        parsedTags[metaIdKey] = [tag.tagId]
      } else {
        parsedTags[metaIdKey].push(tag.tagId)
      }
    }

    for (const metaId in parsedTags) {
      setVal(parsedTags[metaId], resolveItemKey(metaId))
    }

    old.value = cloneMetaValues(vals.value)

    if (isTag.value) {
      scraperStore.currentValues = vals.value
    }

  } catch (error) {
    console.error('Error getting meta values:', error)
  }
}

const loadEditingState = async () => {
  if (!currentItemId.value) return

  initBaseValues()
  await getMetaValues()
}

const save = async () => {
  if (!valid.value || !form.value) {
    await form.value?.validate()
    return
  }

  const tags: Array<TagInTagPayload | TagInMediaPayload> = []
  const values: Array<ValueInTagPayload | ValueInMediaPayload> = []
  const assignedKeys = new Set(
    assignedItems.value.map((item) => String(getItemKey(item)))
  )

  for (const key in vals.value) {
    const isMeta = /\d/.test(key)
    if (!isMeta || !assignedKeys.has(String(key))) continue

    let val = vals.value[key]
    const type = typeof val

    if (type === 'string') {
      val = (val as string).trim()
      if ((val as string).length === 0) val = null
    } else if (Array.isArray(val)) {
      for (const tagId of val as number[]) {
        if (isTag.value && currentItemId.value) {
          tags.push({
            parentTagId: currentItemId.value,
            tagId: tagId,
            metaId: key,
          })
        } else if (isMedia.value && currentItemId.value) {
          tags.push({
            mediaId: currentItemId.value,
            tagId: tagId,
            metaId: key,
          })
        }
      }
    }

    if (isMeta && !Array.isArray(val) && currentItemId.value) {
      if (isTag.value) {
        values.push({
          value: val,
          tagId: currentItemId.value,
          metaId: key,
        })
      } else if (isMedia.value) {
        values.push({
          value: val,
          mediaId: currentItemId.value,
          metaId: key,
        })
      }
    }
  }

  const {country, ...rest} = cloneMetaValues(vals.value) as EntityUpdateFormValues
  const updateData: EntityUpdatePayload = rest

  if (isTag.value) {
    updateData.country = country?.length ? serializeCountries(country) : undefined
  }

  try {
    // Обновляем основной объект
    const endpoint = isTag.value ? 'tag' : 'media'
    await typedApi.updateEntity(endpoint, currentItemId.value!, updateData)

    const tagsEndpoint = isTag.value ? 'TagsInTag' : 'TagsInMedia'
    await typedApi.deleteItemTags(tagsEndpoint, currentItemId.value!)

    if (tags.length > 0) {
      await typedApi.postItemTags(tagsEndpoint, tags)
    }

    const valuesEndpoint = isTag.value ? 'ValuesInTag' : 'ValuesInMedia'
    await typedApi.deleteItemValues(valuesEndpoint, currentItemId.value!)

    if (values.length > 0) {
      await typedApi.postItemValues(valuesEndpoint, values)
    }

    emit('close')

    // Эмитируем событие обновления
    eventBus.emit('getItemsFromDb', {
      ids: [currentItemId.value],
      type: currentItemType.value
    })

  } catch (error) {
    console.error('Error saving item:', error)
  }
}

const transferScrapedInfo = async () => {
  if (!isTag.value || !props.meta || !props.tag) return

  const images = (dialogsStore.scraper?.images || []) as string[]

  if (images.length > 0) {
    const imageTypes = ['main', 'alt', 'custom1', 'custom2']
    let index = 0

    for (const url of images) {
      const imageType = imageTypes[index]
      const imagePath = path.join(
        appStore.dbPath,
        'meta',
        `${props.meta.id}`,
        `${props.tag.id}_${imageType}.jpg`,
      )
      ++index
      const ar = Number(props.meta.imageAspectRatio) || 1
      const sizes = {width: 300, height: 300 / ar}

      const res = await createImage(url, imagePath, sizes)
      if (res.status != 201) {
        setNotification({
          type: 'error',
          title: t('scraper.error'),
          text: t('scraper.image_cannot_be_obtained'),
        })
      }
    }
    eventBus.emit('scraperGotImages')
    dialogsStore.scraper.images = []
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
          const input = metaInputRefs.value[metaId]
          if (input?.create && field.valueScraper) {
            input.create(field.valueScraper)
          }
        }
      } else if (field.dataType === 'country') {
        setValByKey(field.valueScraper, 'country')
      } else {
        setValByKey(field.valueScraper, field.meta.id)
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
  }
})

watch(currentItemId, async (itemId, previousItemId) => {
  if (!itemId || itemId === previousItemId) return
  await loadEditingState()
})

onUnmounted(() => {
  if (isTag.value) {
    eventBus.off('transferScrapedInfo', transferScrapedInfo)
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
  save
})
</script>

<style lang="scss">
.fav-btn {
  .v-selection-control,
  .v-checkbox-btn {
    min-height: 24px !important;
  }
}

.restore {
  position: absolute;
  right: 8px;
  top: 8px;
  z-index: 2;
}
</style>