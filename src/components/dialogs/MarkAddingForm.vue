<template>
  <v-theme-provider theme="dark">
    <div
      class="mark-menu"
      :class="{
        'mark-menu--editing': isEditing,
        'mark-menu--compact': compact,
        'mark-menu--bookmark': isNoteType,
      }"
      :style="{'--mark-accent': accentColor}"
      @keydown.enter="onEnterKey"
    >
      <div class="mark-menu__top">
        <div class="mark-menu__types" role="tablist">
          <v-btn
            v-for="item in mark_types"
            :key="item.value"
            :variant="isTypeSelected(item.value) ? 'flat' : 'tonal'"
            :color="isTypeSelected(item.value) ? typeChipColor(item) : undefined"
            size="x-small"
            rounded="lg"
            class="mark-menu__type"
            @click="changeType(item.value)"
          >
            <v-icon start size="16">mdi-{{ item.icon }}</v-icon>
            {{ getMarkTypeText(item) }}
          </v-btn>
        </div>

        <v-btn
          color="success"
          :disabled="!canSubmit"
          :loading="markAdding.submitting"
          variant="flat"
          size="small"
          rounded="lg"
          class="mark-menu__submit"
          @click="add"
        >
          <v-icon start size="16">mdi-{{ isEditing ? 'content-save' : 'plus' }}</v-icon>
          {{ submitLabel }}
        </v-btn>
      </div>

      <div class="mark-menu__identity">
        <v-form v-if="isNoteType" ref="form" v-model="valid" class="mark-menu__identity-field">
          <v-textarea
            v-model="text"
            :rules="bookmarkTextRequired
              ? [(v) => !!v?.trim() || t('validation.value_required')]
              : []"
            :placeholder="isChapterIcon
              ? t('player.mark_dialog.chapter_title')
              : t('common.text')"
            :required="bookmarkTextRequired"
            density="compact"
            autofocus
            auto-grow
            rows="1"
            max-rows="6"
            variant="outlined"
            rounded="lg"
            hide-details
            class="mark-menu__textarea"
          />
        </v-form>
        <MetaInputMixedTags
          v-else-if="is_tag"
          :meta-ids="arrayMetaIds"
          :model-value="mixedTagKeys"
          placeholder=""
          label=""
          :menu-props="tagMenuProps"
          single
          autofocus
          density="compact"
          variant="outlined"
          rounded="lg"
          hide-details
          class="mark-menu__mixed-tags"
          @update:model-value="onMixedTagsUpdate"
        />
        <p v-else class="mark-menu__identity-hint">
          {{ t('player.mark_dialog.at_position', {time: formatTime(markAdding.time ?? 0)}) }}
        </p>
      </div>

      <section class="mark-menu__timing">
        <div class="mark-menu__cue">
          <MarkTimeHmsInput
            compact
            :model-value="markAdding.time ?? 0"
            :min="0"
            :max="playerDuration"
            :aria-label="t('player.mark_dialog.start_time')"
            @update:model-value="onStartTimeChange"
          />
          <v-btn
            v-tooltip="formTooltip(t('player.mark_dialog.jump_to_time'))"
            size="x-small"
            variant="text"
            icon
            class="mark-menu__cue-btn"
            @click="jumpTo(markAdding.time ?? 0)"
          >
            <v-icon size="16">mdi-play</v-icon>
          </v-btn>
          <v-btn
            v-tooltip="formTooltip(t('player.mark_dialog.sync_with_player'))"
            size="x-small"
            variant="text"
            icon
            class="mark-menu__cue-btn"
            @click="getCurrentTime('time')"
          >
            <v-icon size="16">mdi-crosshairs-gps</v-icon>
          </v-btn>
        </div>

        <v-btn
          v-tooltip="formTooltip(rangeTooltip)"
          :color="markAdding.is_end_time_active ? accentColor : undefined"
          :variant="markAdding.is_end_time_active ? 'flat' : 'tonal'"
          size="x-small"
          icon
          class="mark-menu__range"
          @click="toggleEndTime(!markAdding.is_end_time_active)"
        >
          <v-icon size="14">mdi-arrow-expand-horizontal</v-icon>
        </v-btn>

        <div class="mark-menu__cue" :class="{'mark-menu__cue--ghost': !markAdding.is_end_time_active}">
          <MarkTimeHmsInput
            compact
            :model-value="markAdding.end ?? markAdding.time ?? 0"
            :min="markAdding.time || 0"
            :max="playerDuration"
            :disabled="!markAdding.is_end_time_active"
            :aria-label="t('player.mark_dialog.end_time')"
            @update:model-value="onEndTimeChange"
          />
          <v-btn
            :disabled="!markAdding.is_end_time_active"
            v-tooltip="formTooltip(t('player.mark_dialog.jump_to_time'))"
            size="x-small"
            variant="text"
            icon
            class="mark-menu__cue-btn"
            @click="jumpTo(markAdding.end ?? 0)"
          >
            <v-icon size="16">mdi-skip-forward</v-icon>
          </v-btn>
          <v-btn
            :disabled="!markAdding.is_end_time_active"
            v-tooltip="formTooltip(t('player.mark_dialog.sync_with_player'))"
            size="x-small"
            variant="text"
            icon
            class="mark-menu__cue-btn"
            @click="getCurrentTime('end')"
          >
            <v-icon size="16">mdi-crosshairs-gps</v-icon>
          </v-btn>
        </div>
      </section>

      <div class="mark-menu__tools">
        <div v-if="isNoteType" class="mark-menu__icons">
          <v-btn
            v-for="preset in iconPresets"
            :key="preset"
            :variant="markIcon === preset ? 'flat' : 'tonal'"
            :color="markIcon === preset ? accentColor : undefined"
            size="x-small"
            icon
            tabindex="-1"
            @click="setMarkIcon(preset)"
          >
            <v-icon size="14">mdi-{{ preset }}</v-icon>
          </v-btn>
          <v-btn
            v-tooltip="formTooltip(t('meta.fields.select_icon'))"
            :title="t('meta.fields.select_icon')"
            size="x-small"
            variant="tonal"
            icon
            @click="showIconPicker = true"
          >
            <v-icon size="16">mdi-dots-horizontal</v-icon>
          </v-btn>
          <DialogIcons
            v-model="showIconPicker"
            :icon="markIcon"
            :attach="overlayAttach"
            hide-activator
            @apply="setMarkIcon"
          />
        </div>
      </div>

      <v-alert
        v-if="hasInvalidRange || validationError"
        type="error"
        variant="tonal"
        density="compact"
        class="mark-menu__alert text-caption"
        rounded="lg"
      >
        {{ validationError || t('player.mark_dialog.end_time_must_be_greater') }}
      </v-alert>
    </div>
  </v-theme-provider>
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
import DialogIcons from '@/components/dialogs/DialogIcons.vue'
import MarkTimeHmsInput from '@/components/dialogs/MarkTimeHmsInput.vue'
import MetaInputMixedTags from '@/components/meta/input/MetaInputMixedTags.vue'
import type {MixedTagKey} from '@/components/meta/input/MetaInputMixedTags.vue'
import {sortPinnedAssignmentItems} from '@/utils/pinnedMetaOrder'
import {
  BASE_MARK_TYPES,
  BOOKMARK_ICON_PRESETS,
  BOOKMARK_MARK_TYPE,
  CHAPTER_MARK_ICON,
  DEFAULT_BOOKMARK_ICON,
  FAVORITE_MARK_TYPE,
  TAG_MARK_TYPE,
  applyNoteIcon,
  buildMarkTypes,
  getAssignedArrayMetas,
  isNoteMarkType,
  isTagMarkType,
  normalizeMarkIcon,
  normalizeMarkTime,
} from '@/utils/markAdding'
import {PLAYER_OVERLAY_ATTACH, playerTooltip} from '@/utils/playerOverlay'

interface MarkAddingData {
  text?: string
  tagId?: number | null
  icon?: string | null
}

type MarkTypeItem = ReturnType<typeof buildMarkTypes>[number]

const {compact = false} = defineProps<{
  compact?: boolean
}>()

const emit = defineEmits(['addMark'])

const appStore = useAppStore()
const playerStore = usePlayerStore()
const dialogsStore = useDialogsStore()
const itemsStore = useItemsStore()
const {t} = useI18n()

const form = ref<VFormInstance>(null)
const mixedTagKeys = ref<MixedTagKey[]>([])
const showIconPicker = ref(false)
const text = ref('')
const valid = ref(false)
const validationError = ref<string | null>(null)
const mark_types = ref<MarkTypeItem[]>([...BASE_MARK_TYPES, TAG_MARK_TYPE])
const iconPresets = BOOKMARK_ICON_PRESETS

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

const overlayAttach = PLAYER_OVERLAY_ATTACH
const formTooltip = (text: string) => playerTooltip(text)

const tagMenuProps = computed(() => ({
  attach: overlayAttach,
  contentClass: 'custom-list ac-dropdown mixed-tags-dropdown mark-adding-tags-menu',
  maxHeight: 400,
  zIndex: 4000,
  location: 'bottom start',
  origin: 'top start',
  offset: 4,
  scrollStrategy: 'none',
}))

const player = computed(() => playerStore.player)
const markAdding = computed(() => dialogsStore.markAdding)
const playerDuration = computed(() => Math.floor(playerStore.duration || 0))
const isEditing = computed(() => Number(markAdding.value.editId) > 0)

const is_bookmark = computed(() => markAdding.value.type === 'bookmark')
const is_favorite = computed(() => markAdding.value.type === 'favorite')
const isNoteType = computed(() => isNoteMarkType(String(markAdding.value.type)))
const is_tag = computed(() => isTagMarkType(String(markAdding.value.type)))
const markIcon = computed(() => (
  is_favorite.value
    ? FAVORITE_MARK_TYPE.icon
    : normalizeMarkIcon(markAdding.value.icon, DEFAULT_BOOKMARK_ICON)
))
const isChapterIcon = computed(() => markIcon.value === CHAPTER_MARK_ICON)
const bookmarkTextRequired = computed(() => is_bookmark.value && !isChapterIcon.value)
const accentColor = computed(() => markAdding.value.color || '#f44336')
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

const rangeTooltip = computed(() => (
  markAdding.value.is_end_time_active
    ? t('player.mark_dialog.clear_range')
    : t('player.mark_dialog.set_range')
))

const canSubmit = computed(() => {
  if (markAdding.value.submitting || hasInvalidRange.value) return false
  if (bookmarkTextRequired.value) return Boolean(text.value?.trim())
  if (is_tag.value) return selectedTagId.value != null
  return true
})

const submitLabel = computed(() => {
  if (markAdding.value.submitting) {
    return isEditing.value ? t('player.mark_dialog.saving') : t('player.mark_dialog.adding')
  }
  return isEditing.value ? t('common.save') : t('common.add')
})

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

const isTypeSelected = (value: string) => {
  if (value === BOOKMARK_MARK_TYPE.value) return isNoteType.value
  return markAdding.value.type == value
}

const typeChipColor = (item: MarkTypeItem) => {
  if (item.value === BOOKMARK_MARK_TYPE.value) return accentColor.value
  return item.color
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
  const next = applyNoteIcon(iconName)
  dialogsStore.markAdding.icon = next.icon
  dialogsStore.markAdding.type = next.type
  dialogsStore.markAdding.color = next.color
}

const changeType = (type: string | number) => {
  const nextType = String(type)
  validationError.value = null

  if (nextType === BOOKMARK_MARK_TYPE.value && isNoteType.value) return

  if (isTagMarkType(nextType)) {
    dialogsStore.markAdding.type = nextType
    applyTypeColor(nextType)
    dialogsStore.markAdding.meta = {}
    return
  }

  const next = applyNoteIcon(DEFAULT_BOOKMARK_ICON)
  dialogsStore.markAdding.meta = {}
  dialogsStore.markAdding.tagId = null
  mixedTagKeys.value = []
  dialogsStore.markAdding.type = next.type
  dialogsStore.markAdding.icon = next.icon
  dialogsStore.markAdding.color = next.color
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
  const defaultEnd = Math.min(start + 10, playerDuration.value || start + 10)
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

const hydrateForm = () => {
  if (!markAdding.value.show) {
    resetForm()
    return
  }

  initMarkTypes()
  applyTypeColor(markAdding.value.type)
  validationError.value = null
  valid.value = false
  form.value?.resetValidation?.()
  text.value = markAdding.value.text || ''
  if (isTagMarkType(String(markAdding.value.type))) {
    presetSelectedTag(markAdding.value.tagId)
  } else {
    mixedTagKeys.value = []
  }
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
    if (!valid.value || !text.value?.trim()) {
      validationError.value = t('validation.value_required')
      return
    }
  }

  const data: MarkAddingData = {}
  if (!markAdding.value.is_end_time_active) {
    dialogsStore.markAdding.end = null
  }

  if (isNoteType.value) {
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

const onEnterKey = (event: KeyboardEvent) => {
  const target = event.target
  if (target instanceof HTMLTextAreaElement) {
    if (!(event.metaKey || event.ctrlKey)) return
  }
  event.preventDefault()
  submitIfReady()
}

watch(
  () => [markAdding.value.show, markAdding.value.formKey] as const,
  () => hydrateForm(),
  {immediate: true},
)
</script>

<style scoped lang="scss">
.mark-menu {
  width: 440px;
  max-width: 100%;
  box-sizing: border-box;
  position: relative;
  padding: 8px 10px;
  border-radius: 14px;
  color: rgba(255, 255, 255, 0.92);
  background: var(--mark-form-surface, rgba(22, 24, 28, 0.48));
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow:
    0 10px 28px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(255, 255, 255, 0.08);
}

.mark-menu__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
}

.mark-menu__types {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
}

.mark-menu__type {
  flex: 0 0 auto;
  text-transform: none;
  letter-spacing: 0;
}

.mark-menu__icons {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}

.mark-menu__submit {
  flex: 0 0 auto;
}

.mark-menu__identity {
  min-height: 40px;
  min-width: 0;
  margin-top: 6px;
  display: flex;
  align-items: center;

  :deep(.v-form),
  :deep(.v-input) {
    width: 100%;
  }

  :deep(.v-field) {
    color: rgba(255, 255, 255, 0.92);
    background: rgba(255, 255, 255, 0.1);
  }

  :deep(.v-field__input),
  :deep(.v-field input),
  :deep(.v-field textarea),
  :deep(input),
  :deep(textarea) {
    color: rgba(255, 255, 255, 0.92);
    caret-color: #fff;
  }

  :deep(.v-field input::placeholder),
  :deep(.v-field textarea::placeholder),
  :deep(.v-field .v-label),
  :deep(.v-field__placeholder) {
    color: rgba(255, 255, 255, 0.48);
    opacity: 1;
  }

  :deep(.v-field .v-field__outline) {
    --v-field-border-opacity: 0.28;
    color: rgba(255, 255, 255, 0.42);
  }
}

.mark-menu__identity-field,
.mark-menu__mixed-tags {
  width: 100%;
}

.mark-menu__textarea {
  :deep(textarea) {
    line-height: 1.35;
    min-height: 24px !important;
  }
}

.mark-menu__identity-hint {
  margin: 0;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.62);
  font-variant-numeric: tabular-nums;
}

.mark-menu__timing {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  justify-content: space-between;
  gap: 4px;
  margin-top: 8px;
  min-width: 0;
}

.mark-menu__cue {
  display: inline-flex;
  align-items: center;
  gap: 0;
  min-width: 0;
  min-height: 32px;
  padding: 1px 2px 1px 4px;
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.92);
  background: rgba(255, 255, 255, 0.1);

  &--ghost {
    opacity: 0.48;
  }
}

.mark-menu__cue-btn {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  min-width: 24px;
}

.mark-menu__range {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  min-width: 24px;
}

.mark-menu__tools {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  min-width: 0;
}

.mark-menu__alert {
  margin-top: 6px;
}

:deep(.mark-time-hms) {
  color: rgba(255, 255, 255, 0.92);
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.22);
}

:deep(.mark-time-hms__field) {
  color: rgba(255, 255, 255, 0.92);
}
</style>

<style lang="scss">
.mark-adding-tags-menu.v-overlay__content {
  box-sizing: border-box;
  min-width: 240px !important;
  width: max(240px, var(--v-overlay-anchor-width, 240px));
}
</style>
