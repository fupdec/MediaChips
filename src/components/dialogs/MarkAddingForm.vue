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
      <header class="mark-menu__top">
        <div class="mark-menu__types" role="tablist">
          <button
            v-for="item in mark_types"
            :key="item.value"
            type="button"
            class="mark-menu__type"
            :class="{'is-selected': isTypeSelected(item.value)}"
            :style="{'--type-color': typeChipColor(item)}"
            role="tab"
            :aria-selected="isTypeSelected(item.value)"
            @click="changeType(item.value)"
          >
            <v-icon size="15">mdi-{{ item.icon }}</v-icon>
            <span>{{ getMarkTypeText(item) }}</span>
          </button>
        </div>

        <v-btn
          v-tooltip="formTooltip(t('common.close'))"
          variant="text"
          size="x-small"
          icon
          class="mark-menu__close"
          @click="closeStudio"
        >
          <v-icon size="18">mdi-close</v-icon>
        </v-btn>
      </header>

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
            variant="solo-filled"
            flat
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
          variant="solo-filled"
          flat
          rounded="lg"
          hide-details
          class="mark-menu__mixed-tags"
          @update:model-value="onMixedTagsUpdate"
        />
        <p v-else class="mark-menu__identity-hint">
          <v-icon size="16" class="mark-menu__field-icon">mdi-{{ markIcon }}</v-icon>
          {{ t('player.mark_dialog.at_position', {time: formatTime(markAdding.time ?? 0)}) }}
        </p>
      </div>

      <section class="mark-menu__timing" :class="{'is-range': markAdding.is_end_time_active}">
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
            <v-icon size="15">mdi-play</v-icon>
          </v-btn>
          <v-btn
            v-tooltip="formTooltip(t('player.mark_dialog.sync_with_player'))"
            size="x-small"
            variant="text"
            icon
            class="mark-menu__cue-btn"
            @click="getCurrentTime('time')"
          >
            <v-icon size="15">mdi-crosshairs-gps</v-icon>
          </v-btn>
        </div>

        <template v-if="markAdding.is_end_time_active">
          <div class="mark-menu__span" :class="{'is-invalid': hasInvalidRange}">
            <v-icon size="14">mdi-arrow-right</v-icon>
            <span v-if="rangeDurationLabel" class="mark-menu__span-label">{{ rangeDurationLabel }}</span>
          </div>

          <div class="mark-menu__cue">
            <MarkTimeHmsInput
              compact
              :model-value="markAdding.end ?? markAdding.time ?? 0"
              :min="markAdding.time || 0"
              :max="playerDuration"
              :aria-label="t('player.mark_dialog.end_time')"
              @update:model-value="onEndTimeChange"
            />
            <v-btn
              v-tooltip="formTooltip(t('player.mark_dialog.jump_to_time'))"
              size="x-small"
              variant="text"
              icon
              class="mark-menu__cue-btn"
              @click="jumpTo(markAdding.end ?? 0)"
            >
              <v-icon size="15">mdi-skip-forward</v-icon>
            </v-btn>
            <v-btn
              v-tooltip="formTooltip(t('player.mark_dialog.sync_with_player'))"
              size="x-small"
              variant="text"
              icon
              class="mark-menu__cue-btn"
              @click="getCurrentTime('end')"
            >
              <v-icon size="15">mdi-crosshairs-gps</v-icon>
            </v-btn>
          </div>

          <v-btn
            v-tooltip="formTooltip(t('player.mark_dialog.clear_range'))"
            size="x-small"
            variant="text"
            icon
            class="mark-menu__range-clear"
            @click="toggleEndTime(false)"
          >
            <v-icon size="15">mdi-close-circle-outline</v-icon>
          </v-btn>
        </template>

        <button
          v-else
          type="button"
          class="mark-menu__range-add"
          @click="toggleEndTime(true)"
        >
          <v-icon size="15">mdi-arrow-expand-horizontal</v-icon>
          {{ t('player.mark_dialog.set_range') }}
        </button>
      </section>

      <v-expand-transition>
        <div v-if="hasInvalidRange || validationError" class="mark-menu__alert">
          <v-icon size="14">mdi-alert-circle-outline</v-icon>
          {{ validationError || t('player.mark_dialog.end_time_must_be_greater') }}
        </div>
      </v-expand-transition>

      <footer class="mark-menu__footer">
        <div v-if="isNoteType" class="mark-menu__icons" role="radiogroup">
          <button
            v-for="preset in iconPresets"
            :key="preset"
            type="button"
            class="mark-menu__icon"
            :class="{'is-selected': markIcon === preset}"
            role="radio"
            :aria-checked="markIcon === preset"
            tabindex="-1"
            @click="setMarkIcon(preset)"
          >
            <v-icon size="15">mdi-{{ preset }}</v-icon>
          </button>
          <button
            v-tooltip="formTooltip(t('meta.fields.select_icon'))"
            type="button"
            class="mark-menu__icon"
            :class="{'is-selected': !iconPresets.includes(markIcon)}"
            :aria-label="t('meta.fields.select_icon')"
            @click="showIconPicker = true"
          >
            <v-icon size="15">
              mdi-{{ iconPresets.includes(markIcon) ? 'dots-horizontal' : markIcon }}
            </v-icon>
          </button>
          <DialogIcons
            v-model="showIconPicker"
            :icon="markIcon"
            :attach="overlayAttach"
            hide-activator
            @apply="setMarkIcon"
          />
        </div>

        <div class="mark-menu__actions">
          <v-btn
            v-if="isEditing && (!hideDisabledButtons || !markAdding.submitting)"
            v-tooltip="formTooltip(t('common.delete'))"
            color="error"
            :disabled="markAdding.submitting"
            :loading="deleting"
            variant="text"
            size="small"
            icon
            class="mark-menu__delete"
            @click="remove"
          >
            <v-icon size="18">mdi-delete-outline</v-icon>
          </v-btn>
          <v-btn
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
            <kbd class="mark-menu__kbd">↵</kbd>
          </v-btn>
        </div>
      </footer>
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
import {typedApi} from '@/services/typedApi'
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

const {compact = false, hideDisabledButtons = false} = defineProps<{
  compact?: boolean
  hideDisabledButtons?: boolean
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
const deleting = ref(false)
const mark_types = ref<MarkTypeItem[]>([...BASE_MARK_TYPES, TAG_MARK_TYPE] as unknown as MarkTypeItem[])
const iconPresets: readonly string[] = BOOKMARK_ICON_PRESETS

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

const rangeDurationLabel = computed(() => {
  if (!markAdding.value.is_end_time_active || hasInvalidRange.value) return ''
  const span = (markAdding.value.end ?? 0) - (markAdding.value.time ?? 0)
  return span > 0 ? formatTime(span) : ''
})

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

const closeStudio = () => {
  playerStore.studioMode = false
}

const remove = async () => {
  const editId = dialogsStore.markAdding.editId
  if (!editId || deleting.value) return
  deleting.value = true
  try {
    await typedApi.deleteMark(editId)
    playerStore.marks = playerStore.marks.filter((mark) => mark.id !== editId)
    playerStore.studioMode = false
  } catch (error) {
    console.warn('Failed deleting mark', error)
  } finally {
    deleting.value = false
  }
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
  --mark-menu-fill: rgba(255, 255, 255, 0.07);
  --mark-menu-fill-hover: rgba(255, 255, 255, 0.12);
  --mark-menu-line: rgba(255, 255, 255, 0.1);

  width: 440px;
  max-width: 100%;
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border-radius: 14px;
  color: rgba(255, 255, 255, 0.92);
  background: var(--mark-form-surface, rgba(22, 24, 28, 0.48));
  backdrop-filter: blur(20px) saturate(1.2);
  -webkit-backdrop-filter: blur(20px) saturate(1.2);
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.42),
    0 0 0 1px rgba(255, 255, 255, 0.09);
  overflow: hidden;
}

/* ---------- header ---------- */

.mark-menu__top {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.mark-menu__types {
  display: flex;
  flex: 1 1 auto;
  gap: 2px;
  min-width: 0;
  padding: 2px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.22);
}

.mark-menu__type {
  --type-color: #fff;

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: 1 1 0;
  min-width: 0;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &:hover {
    color: #fff;
    background: var(--mark-menu-fill);
  }

  &.is-selected {
    color: #fff;
    background: color-mix(in srgb, var(--type-color) 22%, rgba(255, 255, 255, 0.06));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--type-color) 55%, transparent);

    .v-icon {
      color: var(--type-color);
    }
  }

  &:focus-visible {
    outline: 2px solid var(--type-color);
    outline-offset: -2px;
  }
}

.mark-menu__close {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  min-width: 32px;
  color: rgba(255, 255, 255, 0.7);
}

/* ---------- text / tag ---------- */

.mark-menu__identity {
  min-width: 0;
  display: flex;
  align-items: center;

  :deep(.v-form),
  :deep(.v-input) {
    width: 100%;
  }

  :deep(.v-field) {
    color: rgba(255, 255, 255, 0.92);
    background: var(--mark-menu-fill);
    box-shadow: inset 0 0 0 1px var(--mark-menu-line);
    transition: box-shadow 0.15s ease, background-color 0.15s ease;
  }

  :deep(.v-field:hover) {
    background: var(--mark-menu-fill-hover);
  }

  :deep(.v-field--focused) {
    background: var(--mark-menu-fill-hover);
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--mark-accent) 70%, transparent),
      0 0 0 3px color-mix(in srgb, var(--mark-accent) 18%, transparent);
  }

  :deep(.v-field__overlay) {
    display: none;
  }

  :deep(.v-field__input),
  :deep(.v-field input),
  :deep(.v-field textarea),
  :deep(input),
  :deep(textarea) {
    color: rgba(255, 255, 255, 0.95);
    caret-color: var(--mark-accent);
  }

  :deep(.v-field input::placeholder),
  :deep(.v-field textarea::placeholder),
  :deep(.v-field .v-label),
  :deep(.v-field__placeholder) {
    color: rgba(255, 255, 255, 0.42);
    opacity: 1;
  }
}

.mark-menu__identity-field,
.mark-menu__mixed-tags {
  width: 100%;
}

.mark-menu__field-icon {
  color: var(--mark-accent);
  opacity: 0.95;
  transition: color 0.2s ease;
}

// Compact single-line look: 32px high, grows only when text wraps.
.mark-menu__identity {
  :deep(.v-input--density-compact) {
    --v-input-control-height: 32px;
    --v-input-padding-top: 6px;
  }

  :deep(.v-field) {
    --v-field-padding-start: 10px;
    --v-field-padding-end: 10px;
    --v-field-padding-top: 6px;
    --v-field-padding-bottom: 6px;
    --v-field-input-padding-top: 6px;
    --v-field-input-padding-bottom: 6px;
    font-size: 0.875rem;
  }

  :deep(.v-field__input) {
    min-height: 32px;
    padding-top: 6px;
    padding-bottom: 6px;
  }
}

.mark-menu__textarea {
  :deep(textarea) {
    line-height: 20px;
    min-height: 20px !important;
    -webkit-mask-image: none;
    mask-image: none;
  }
}

.mark-menu__identity-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--mark-menu-fill);
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.7);
  font-variant-numeric: tabular-nums;
}

/* ---------- timing ---------- */

.mark-menu__timing {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.mark-menu__cue {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  min-width: 0;
  height: 32px;
  padding: 0 2px 0 2px;
  border-radius: 10px;
  background: var(--mark-menu-fill);
  box-shadow: inset 0 0 0 1px var(--mark-menu-line);
}

.mark-menu__cue-btn,
.mark-menu__range-clear {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  min-width: 26px;
  color: rgba(255, 255, 255, 0.72);

  &:hover {
    color: #fff;
  }
}

.mark-menu__range-clear {
  margin-left: auto;
}

.mark-menu__span {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  flex: 1 1 auto;
  min-width: 24px;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1;

  &.is-invalid {
    color: rgb(var(--v-theme-error));
  }
}

.mark-menu__span-label {
  margin-top: 1px;
  font-size: 0.6875rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.mark-menu__range-add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  margin-left: auto;
  padding: 0 12px;
  border: 1px dashed rgba(255, 255, 255, 0.22);
  border-radius: 10px;
  background: transparent;
  color: rgba(255, 255, 255, 0.66);
  font: inherit;
  font-size: 0.8125rem;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;

  &:hover {
    color: #fff;
    border-color: color-mix(in srgb, var(--mark-accent) 70%, transparent);
    background: color-mix(in srgb, var(--mark-accent) 12%, transparent);
  }

  &:focus-visible {
    outline: 2px solid var(--mark-accent);
    outline-offset: 1px;
  }
}

.mark-menu__alert {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 0.75rem;
  color: #ffb4ab;
  background: rgba(var(--v-theme-error), 0.14);
}

/* ---------- footer ---------- */

.mark-menu__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding-top: 8px;
  border-top: 1px solid var(--mark-menu-line);
}

.mark-menu__icons {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
}

.mark-menu__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    color: #fff;
    background: var(--mark-menu-fill-hover);
  }

  &.is-selected {
    color: #fff;
    background: var(--mark-accent);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--mark-accent) 45%, transparent);
  }

  &:focus-visible {
    outline: 2px solid var(--mark-accent);
    outline-offset: 1px;
  }
}

.mark-menu__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  margin-left: auto;
}

.mark-menu__delete {
  width: 32px;
  height: 32px;
  min-width: 32px;
}

.mark-menu__submit {
  flex: 0 0 auto;
  color: #fff !important;
  background: rgb(var(--v-theme-success)) !important;
  text-transform: none;
  letter-spacing: 0;
  font-weight: 600;
  padding-inline: 10px 8px !important;

  &.v-btn--disabled {
    color: rgba(255, 255, 255, 0.45) !important;
    background: rgba(255, 255, 255, 0.08) !important;
    opacity: 1;

    .mark-menu__kbd {
      opacity: 0.4;
    }
  }
}

.mark-menu__kbd {
  margin-left: 8px;
  padding: 0 5px;
  min-width: 18px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.18);
  font-family: inherit;
  font-size: 0.6875rem;
  line-height: 16px;
}

/* ---------- time input ---------- */

:deep(.mark-time-hms) {
  color: rgba(255, 255, 255, 0.95);
  background: transparent;
  border-color: transparent;
}

:deep(.mark-time-hms__field) {
  color: rgba(255, 255, 255, 0.95);

  &:focus {
    background: color-mix(in srgb, var(--mark-accent) 22%, transparent);
  }
}
</style>

<style lang="scss">
.mark-adding-tags-menu.v-overlay__content {
  box-sizing: border-box;
  min-width: 240px !important;
  width: max(240px, var(--v-overlay-anchor-width, 240px));
}
</style>
