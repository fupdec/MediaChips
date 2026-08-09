<template>
  <v-dialog
    v-model="markAdding.show"
    :attach="playerStore.fullscreen ? '#player' : false"
    content-class="dialog-overflow-visible dialog-position-start mark-adding-dialog"
    hide-overlay
    width="520"
    persistent
    no-click-animation
    :scrim="false"
    @keydown.enter.prevent="submitIfReady"
  >
    <v-card class="mark-adding-card" rounded="xl">
      <DialogHeader
        @close="close"
        :header="isEditing
          ? t('player.mark_dialog.editing_marker')
          : t('player.mark_dialog.adding_marker')"
        :subheader="positionLabel"
        :icon="selectedTypeIcon"
        :buttons="buttons"
        closable
      />

      <v-card-text class="mark-adding pa-3 pa-sm-4">
        <section class="mark-adding__section">
          <div class="mark-adding__section-label">{{ t('player.mark_dialog.mark_type') }}</div>
          <v-chip-group
            v-model="markAdding.type"
            @update:model-value="changeType"
            mandatory
            column
            class="mark-adding__types"
          >
            <v-chip
              v-for="item in mark_types"
              :key="item.value"
              :value="item.value"
              filter
              variant="tonal"
              :color="markAdding.type == item.value ? 'primary' : undefined"
            >
              <v-icon start size="small">mdi-{{ item.icon }}</v-icon>
              {{ getMarkTypeText(item) }}
            </v-chip>
          </v-chip-group>
        </section>

        <section v-if="is_bookmark" class="mark-adding__section">
          <div class="mark-adding__section-label">{{ t('player.mark_dialog.mark_icon') }}</div>
          <div class="mark-adding__icon-presets">
            <v-btn
              v-for="preset in iconPresets"
              :key="preset"
              :variant="markIcon === preset ? 'flat' : 'tonal'"
              :color="markIcon === preset ? 'primary' : undefined"
              size="small"
              icon
              @click="setMarkIcon(preset)"
            >
              <v-icon size="small">mdi-{{ preset }}</v-icon>
            </v-btn>
            <DialogIcons
              :icon="markIcon"
              @apply="setMarkIcon"
            />
          </div>
        </section>

        <section v-if="is_bookmark" class="mark-adding__section">
          <v-form ref="form" v-model="valid">
            <v-textarea
              v-model="text"
              :rules="bookmarkTextRequired
                ? [(v) => !!v?.trim() || t('validation.value_required')]
                : []"
              :label="isChapterIcon
                ? t('player.mark_dialog.chapter_title')
                : t('common.text')"
              rows="1"
              :required="bookmarkTextRequired"
              auto-grow
              autofocus
              variant="outlined"
              rounded="xl"
              hide-details="auto"
            />
          </v-form>
        </section>

        <section v-else-if="is_tag" class="mark-adding__section">
          <MetaInputMixedTags
            :meta-ids="arrayMetaIds"
            :model-value="mixedTagKeys"
            :label="t('player.mark_dialog.selected_tag')"
            :placeholder="t('player.mark_dialog.search_any_tag')"
            :menu-props="tagMenuProps"
            single
            autofocus
            density="comfortable"
            variant="outlined"
            rounded="xl"
            hide-details="auto"
            class="mark-adding__mixed-tags"
            @update:model-value="onMixedTagsUpdate"
          />
        </section>

        <section class="mark-adding__section">
          <div class="mark-adding__time-row">
            <div class="mark-adding__time-head">
              <span class="mark-adding__field-label">{{ t('player.mark_dialog.start_time') }}</span>
            </div>

            <div class="mark-adding__time-controls">
              <MarkTimeHmsInput
                :model-value="markAdding.time ?? 0"
                :min="0"
                :max="playerDuration"
                :aria-label="t('player.mark_dialog.start_time')"
                @update:model-value="onStartTimeChange"
              />
              <v-btn
                v-tooltip:top="t('player.mark_dialog.sync_with_player')"
                @click="getCurrentTime('time')"
                size="small"
                variant="tonal"
                icon
              >
                <v-icon>mdi-sync</v-icon>
              </v-btn>
              <v-btn
                v-tooltip:top="t('player.mark_dialog.jump_to_time')"
                @click="jumpTo(markAdding.time ?? 0)"
                size="small"
                variant="tonal"
                icon
              >
                <v-icon>mdi-redo</v-icon>
              </v-btn>
            </div>
          </div>

          <div
            v-if="!markAdding.is_end_time_active"
            class="mt-2"
          >
            <v-btn
              size="small"
              variant="tonal"
              rounded="xl"
              @click="toggleEndTime(true)"
            >
              <v-icon start size="small">mdi-arrow-expand-horizontal</v-icon>
              {{ t('player.mark_dialog.set_range') }}
            </v-btn>
          </div>

          <div
            v-else
            class="mark-adding__time-row mark-adding__time-row--end"
          >
            <div class="mark-adding__time-head">
              <span class="mark-adding__field-label">{{ t('player.mark_dialog.end_time') }}</span>
            </div>

            <div class="mark-adding__time-controls">
              <MarkTimeHmsInput
                :model-value="markAdding.end ?? 0"
                :min="markAdding.time || 0"
                :max="playerDuration"
                :aria-label="t('player.mark_dialog.end_time')"
                @update:model-value="onEndTimeChange"
              />
              <v-btn
                v-tooltip:top="t('player.mark_dialog.sync_with_player')"
                @click="getCurrentTime('end')"
                size="small"
                variant="tonal"
                icon
              >
                <v-icon>mdi-sync</v-icon>
              </v-btn>
              <v-btn
                v-tooltip:top="t('player.mark_dialog.jump_to_time')"
                @click="jumpTo(markAdding.end ?? 0)"
                size="small"
                variant="tonal"
                icon
              >
                <v-icon>mdi-redo</v-icon>
              </v-btn>
            </div>
          </div>

          <div
            v-if="markAdding.is_end_time_active"
            class="mark-adding__duration"
          >
            <v-btn
              size="small"
              variant="tonal"
              rounded="xl"
              @click="toggleEndTime(false)"
            >
              <v-icon start size="small">mdi-close</v-icon>
              {{ t('player.mark_dialog.clear_range') }}
            </v-btn>
            <span
              v-if="segmentDuration != null"
              class="mark-adding__duration-text text-caption text-medium-emphasis"
            >
              {{ t('player.mark_dialog.segment_duration', {duration: formatTime(segmentDuration)}) }}
            </span>
          </div>

          <v-alert
            v-if="hasInvalidRange"
            type="error"
            variant="tonal"
            density="compact"
            class="mt-3 text-caption"
            rounded="xl"
          >
            {{ t('player.mark_dialog.end_time_must_be_greater') }}
          </v-alert>
        </section>

        <v-alert
          v-if="validationError"
          type="error"
          variant="tonal"
          density="compact"
          class="mt-1 text-caption"
          rounded="xl"
        >
          {{ validationError }}
        </v-alert>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {ref, computed, watch} from 'vue'
import type {VFormInstance} from '@/types/vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {usePlayerStore} from '@/stores/player'
import {useDialogsStore} from '@/stores/dialogs'
import {useItemsStore} from '@/stores/items'
import {getReadableDuration} from '@/services/formatUtils'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import DialogIcons from '@/components/dialogs/DialogIcons.vue'
import MarkTimeHmsInput from '@/components/dialogs/MarkTimeHmsInput.vue'
import MetaInputMixedTags from '@/components/meta/input/MetaInputMixedTags.vue'
import type {MixedTagKey} from '@/components/meta/input/MetaInputMixedTags.vue'
import {sortPinnedAssignmentItems} from '@/utils/pinnedMetaOrder'
import {
  BASE_MARK_TYPES,
  BOOKMARK_ICON_PRESETS,
  CHAPTER_MARK_ICON,
  DEFAULT_BOOKMARK_ICON,
  TAG_MARK_TYPE,
  buildMarkTypes,
  getAssignedArrayMetas,
  isTagMarkType,
  normalizeMarkIcon,
  normalizeMarkTime,
} from '@/utils/markAdding'

interface MarkAddingData {
  text?: string
  tagId?: number | null
  icon?: string | null
}

type MarkTypeItem = ReturnType<typeof buildMarkTypes>[number]

const emit = defineEmits(['addMark'])

const appStore = useAppStore()
const playerStore = usePlayerStore()
const dialogsStore = useDialogsStore()
const itemsStore = useItemsStore()
const {t} = useI18n()

const form = ref<VFormInstance>(null)
const mixedTagKeys = ref<MixedTagKey[]>([])
const text = ref('')
const valid = ref(false)
const validationError = ref<string | null>(null)
const mark_types = ref<MarkTypeItem[]>([...BASE_MARK_TYPES, TAG_MARK_TYPE])
const iconPresets = BOOKMARK_ICON_PRESETS

/** Same category order as on the media/tag card (pin order), then other array metas. */
const arrayMetaIds = computed(() => {
  const assignedIds = sortPinnedAssignmentItems(
    getAssignedArrayMetas(itemsStore.sortedAssigned),
  )
    .map((item) => Number(item.meta?.id ?? item.metaId))
    .filter((id) => Number.isFinite(id) && id > 0)

  const seen = new Set(assignedIds)
  const rest = (appStore.meta || [])
    .filter((meta) => {
      const id = Number(meta.id)
      return String(meta.type || '').toLowerCase() === 'array'
        && Number.isFinite(id)
        && id > 0
        && !seen.has(id)
    })
    .sort((a, b) => {
      const orderA = Number.isFinite(Number(a.order)) ? Number(a.order) : 0
      const orderB = Number.isFinite(Number(b.order)) ? Number(b.order) : 0
      if (orderA !== orderB) return orderA - orderB
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, {
        sensitivity: 'base',
      })
    })
    .map((meta) => Number(meta.id))

  return [...assignedIds, ...rest]
})

const tagMenuProps = computed(() => ({
  // Keep the menu inside the dialog overlay so left/width match the field
  // (body teleport breaks against dialog-position-start / player attach).
  attach: '.mark-adding-dialog',
  contentClass: 'custom-list mixed-tags-dropdown mark-adding-tags-menu',
  maxHeight: 360,
  zIndex: 2800,
  location: 'bottom',
  origin: 'top',
  offset: 4,
}))

const player = computed(() => playerStore.player)
const markAdding = computed(() => dialogsStore.markAdding)
const playerDuration = computed(() => Math.floor(playerStore.duration || 0))
const isEditing = computed(() => Number(markAdding.value.editId) > 0)

const is_bookmark = computed(() => markAdding.value.type === 'bookmark')
const is_tag = computed(() => isTagMarkType(String(markAdding.value.type)))
const markIcon = computed(() => normalizeMarkIcon(markAdding.value.icon, DEFAULT_BOOKMARK_ICON))
const isChapterIcon = computed(() => markIcon.value === CHAPTER_MARK_ICON)
const bookmarkTextRequired = computed(() => is_bookmark.value && !isChapterIcon.value)
const selectedTagId = computed(() => {
  const key = mixedTagKeys.value[0]
  if (!key) return null
  const tagId = Number(String(key).split(':')[1])
  return Number.isFinite(tagId) && tagId > 0 ? tagId : null
})

const hasInvalidRange = computed(() => {
  if (!markAdding.value.is_end_time_active) return false
  return (markAdding.value.end ?? 0) - (markAdding.value.time ?? 0) < 0
})

const segmentDuration = computed(() => {
  if (!markAdding.value.is_end_time_active) return null
  const duration = (markAdding.value.end ?? 0) - (markAdding.value.time ?? 0)
  return duration > 0 ? duration : null
})

const canSubmit = computed(() => {
  if (markAdding.value.submitting || hasInvalidRange.value) return false
  if (bookmarkTextRequired.value) return Boolean(text.value?.trim())
  if (is_tag.value) return selectedTagId.value != null
  return true
})

const selectedTypeIcon = computed(() => {
  if (is_bookmark.value) return markIcon.value
  if (is_tag.value) return TAG_MARK_TYPE.icon
  const current = mark_types.value.find((item) => item.value == markAdding.value.type)
  return current?.icon || 'tooltip-plus'
})

const positionLabel = computed(() => t('player.mark_dialog.at_position', {
  time: formatTime(markAdding.value.time ?? playerStore.currentTime ?? 0),
}))

const buttons = computed(() => [{
  icon: isEditing.value ? 'content-save' : 'plus',
  text: markAdding.value.submitting
    ? (isEditing.value ? t('player.mark_dialog.saving') : t('player.mark_dialog.adding'))
    : (isEditing.value ? t('common.save') : t('common.add')),
  color: 'success',
  outlined: false,
  disabled: !canSubmit.value,
  action: add,
}])

const formatTime = (seconds: number) => getReadableDuration(seconds || 0)

const parseMixedTagKey = (key: string | null | undefined) => {
  if (!key) return null
  const [metaPart, tagPart] = String(key).split(':')
  const metaId = Number(metaPart)
  const tagId = Number(tagPart)
  if (!Number.isFinite(metaId) || metaId <= 0 || !Number.isFinite(tagId) || tagId <= 0) {
    return null
  }
  return {metaId, tagId}
}

const syncMarkTagFromKey = (key: string | null) => {
  const parsed = parseMixedTagKey(key)
  dialogsStore.markAdding.tagId = parsed?.tagId ?? null
  if (parsed?.metaId) {
    const meta = appStore.getMetaById(parsed.metaId)
    dialogsStore.markAdding.meta = meta || {id: parsed.metaId}
    const tag = appStore.getTagById(parsed.tagId)
    dialogsStore.markAdding.color = tag?.color || TAG_MARK_TYPE.color
  } else {
    dialogsStore.markAdding.meta = {}
    dialogsStore.markAdding.color = TAG_MARK_TYPE.color
  }
}

const onMixedTagsUpdate = (keys: MixedTagKey[]) => {
  const next = keys.slice(-1)
  mixedTagKeys.value = next
  syncMarkTagFromKey(next[0] ?? null)
}

const initMarkTypes = () => {
  mark_types.value = buildMarkTypes()
}

const getMarkTypeText = (item: MarkTypeItem) => {
  if ('textKey' in item && item.textKey) return t(item.textKey)
  return ''
}

const applyTypeColor = (type: string | number) => {
  const preset = BASE_MARK_TYPES.find((item) => item.value === type)
    || (type === TAG_MARK_TYPE.value ? TAG_MARK_TYPE : null)
  if (preset) {
    dialogsStore.markAdding.color = preset.color
    return
  }
  dialogsStore.markAdding.color = '#fff'
}

const setMarkIcon = (iconName: string) => {
  dialogsStore.markAdding.icon = normalizeMarkIcon(iconName, DEFAULT_BOOKMARK_ICON)
  if (dialogsStore.markAdding.icon === CHAPTER_MARK_ICON) {
    dialogsStore.markAdding.color = '#26a69a'
  } else {
    dialogsStore.markAdding.color = '#f44336'
  }
}

const changeType = (type: string | number) => {
  validationError.value = null
  applyTypeColor(type)

  if (!isTagMarkType(String(type))) {
    dialogsStore.markAdding.meta = {}
    dialogsStore.markAdding.tagId = null
    mixedTagKeys.value = []
    if (String(type) === 'bookmark' && !markAdding.value.icon) {
      dialogsStore.markAdding.icon = DEFAULT_BOOKMARK_ICON
    }
    return
  }

  dialogsStore.markAdding.meta = {}
}

const presetSelectedTag = (tagId: number | null) => {
  if (!tagId) {
    mixedTagKeys.value = []
    syncMarkTagFromKey(null)
    return
  }

  const fromStore = appStore.getTagById(tagId)
  const metaId = Number(
    fromStore?.metaId
    ?? markAdding.value.meta?.id
    ?? dialogsStore.markAdding.meta?.id,
  )
  if (!Number.isFinite(metaId) || metaId <= 0) {
    mixedTagKeys.value = []
    syncMarkTagFromKey(null)
    return
  }

  const key = `${metaId}:${tagId}` as MixedTagKey
  mixedTagKeys.value = [key]
  syncMarkTagFromKey(key)
}

const onStartTimeChange = (time: number) => {
  dialogsStore.markAdding.time = normalizeMarkTime(time)
  if (
    markAdding.value.is_end_time_active &&
    (markAdding.value.end ?? 0) < dialogsStore.markAdding.time
  ) {
    dialogsStore.markAdding.end = dialogsStore.markAdding.time
  }
}

const onEndTimeChange = (time: number) => {
  dialogsStore.markAdding.end = normalizeMarkTime(time, markAdding.value.time || 0)
}

const toggleEndTime = (active: boolean | null) => {
  dialogsStore.markAdding.is_end_time_active = Boolean(active)
  if (!active) {
    dialogsStore.markAdding.end = null
    return
  }

  const start = normalizeMarkTime(markAdding.value.time)
  const defaultEnd = Math.min(start + 30, playerDuration.value || start + 30)
  dialogsStore.markAdding.end = Math.max(start, defaultEnd)
}

const getCurrentTime = (field: 'time' | 'end') => {
  const current = normalizeMarkTime(player.value?.currentTime ?? playerStore.currentTime ?? 0)
  if (field === 'time') {
    dialogsStore.markAdding.time = current
    if (markAdding.value.is_end_time_active && (markAdding.value.end ?? 0) < current) {
      dialogsStore.markAdding.end = current
    }
  } else {
    dialogsStore.markAdding.end = Math.max(current, normalizeMarkTime(markAdding.value.time))
  }
}

const jumpTo = (seconds: number) => {
  playerStore.playerJumpTo(normalizeMarkTime(seconds))
}

const resetForm = () => {
  mixedTagKeys.value = []
  text.value = ''
  valid.value = false
  validationError.value = null
  form.value?.resetValidation?.()
}

const close = () => {
  if (markAdding.value.submitting) return
  dialogsStore.closeMarkAdding()
}

const add = () => {
  validationError.value = null

  if (!canSubmit.value) {
    if (is_tag.value && selectedTagId.value == null) {
      validationError.value = t('player.mark_dialog.select_tag_required')
    }
    return
  }

  if (bookmarkTextRequired.value) {
    form.value?.validate()
    if (!valid.value || !text.value?.trim()) return
  }

  const data: MarkAddingData = {}
  if (!markAdding.value.is_end_time_active) {
    dialogsStore.markAdding.end = null
  }

  if (is_bookmark.value) {
    data.text = text.value.trim()
    data.icon = markIcon.value
  } else if (is_tag.value) {
    data.tagId = selectedTagId.value
  }

  emit('addMark', data)
}

const submitIfReady = () => {
  if (canSubmit.value) add()
}

watch(() => markAdding.value.show, (show) => {
  if (!show) {
    resetForm()
    return
  }

  initMarkTypes()
  resetForm()
  applyTypeColor(markAdding.value.type)

  text.value = markAdding.value.text || ''
  if (isTagMarkType(String(markAdding.value.type))) {
    presetSelectedTag(markAdding.value.tagId)
  }

  dialogsStore.markAdding.time = normalizeMarkTime(
    markAdding.value.time ?? playerStore.currentTime ?? 0
  )
}, {immediate: true})
</script>

<style scoped lang="scss">
.mark-adding-card {
  overflow: visible;
}

.mark-adding__section + .mark-adding__section {
  margin-top: 20px;
}

.mark-adding__section-label {
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1.25;
  color: rgba(var(--v-theme-on-surface), 0.7);
  margin-bottom: 10px;
}

.mark-adding__field-label {
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1;
  color: rgba(var(--v-theme-on-surface), 0.8);
  white-space: nowrap;
}

.mark-adding__types {
  :deep(.v-chip) {
    margin: 2px;
  }
}

.mark-adding__icon-presets {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.mark-adding__time-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 40px;

  & + & {
    margin-top: 12px;
  }
}

.mark-adding__time-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
  min-height: 40px;
}

.mark-adding__time-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.mark-adding__switch {
  flex: 0 0 auto;
}

.mark-adding__duration {
  margin-top: 12px;
  min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mark-adding__duration-text {
  margin-left: auto;
  text-align: right;
  white-space: nowrap;
}

.mark-adding__mixed-tags {
  width: 100%;
}
</style>

<style lang="scss">
/* Teleported into .mark-adding-dialog — must not be scoped */
.mark-adding-dialog {
  position: relative;
  overflow: visible !important;
}

.mark-adding-tags-menu.v-overlay__content {
  box-sizing: border-box;
}
</style>
