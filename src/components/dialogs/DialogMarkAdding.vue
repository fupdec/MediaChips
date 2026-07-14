<template>
  <v-dialog
    v-model="markAdding.show"
    :attach="playerStore.fullscreen ? '#player' : false"
    content-class="dialog-overflow-visible dialog-position-start mark-adding-dialog"
    hide-overlay
    width="520"
    scrollable
    persistent
    no-click-animation
    :scrim="false"
    @keydown.enter.prevent="submitIfReady"
  >
    <v-card class="mark-adding-card" rounded="xl">
      <DialogHeader
        @close="close"
        :header="t('player.mark_dialog.adding_marker')"
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
          <v-form ref="form" v-model="valid">
            <v-textarea
              v-model="text"
              :rules="[(v) => !!v?.trim() || t('validation.value_required')]"
              :label="t('common.text')"
              rows="1"
              required
              auto-grow
              autofocus
              variant="outlined"
              rounded="xl"
              hide-details="auto"
            />
          </v-form>
        </section>

        <section v-else-if="is_meta" class="mark-adding__section">
          <MetaInputArray
            v-if="markAdding.meta?.id"
            :key="String(markAdding.meta.id)"
            @update:model-value="setVal"
            :model-value="val ?? undefined"
            :meta-id="Number(markAdding.meta.id)"
            :multiple="false"
            :autofocus="!is_bookmark"
            :return-object="false"
            :menu-props="{attach:'.mark-adding', contentClass: 'custom-list'}"
            :attach="playerStore.fullscreen ? '.mark-adding' : false"
            :label="t('player.mark_dialog.selected_tag')"
          />
          <v-alert
            v-else
            type="warning"
            variant="tonal"
            density="compact"
            rounded="xl"
            class="text-caption"
          >
            {{ t('player.mark_dialog.meta_not_loaded') }}
          </v-alert>
        </section>

        <section class="mark-adding__section">
          <div class="mark-adding__time-row">
            <div class="mark-adding__time-head">
              <span class="mark-adding__field-label">{{ t('player.mark_dialog.start_time') }}</span>
              <v-chip size="x-small" variant="tonal" class="mark-adding__readable">
                {{ formatTime(markAdding.time ?? 0) }}
              </v-chip>
            </div>

            <div class="mark-adding__time-controls">
              <v-number-input
                v-model="markAdding.time"
                @update:model-value="onStartTimeChange"
                :min="0"
                :max="playerDuration"
                :step="1"
                density="compact"
                variant="outlined"
                rounded="xl"
                hide-details
                class="mark-adding__number-input"
              />
              <v-btn
                @click="getCurrentTime('time')"
                size="small"
                variant="tonal"
                :title="t('player.mark_dialog.sync_with_player')"
                icon
              >
                <v-icon>mdi-sync</v-icon>
              </v-btn>
              <v-btn
                @click="jumpTo(markAdding.time ?? 0)"
                size="small"
                variant="tonal"
                :title="t('player.mark_dialog.jump_to_time')"
                icon
              >
                <v-icon>mdi-redo</v-icon>
              </v-btn>
            </div>
          </div>

          <div class="mark-adding__time-row mark-adding__time-row--end">
            <div class="mark-adding__time-head">
              <span class="mark-adding__field-label">{{ t('player.mark_dialog.end_time') }}</span>
              <v-switch
                v-model="markAdding.is_end_time_active"
                @update:model-value="toggleEndTime"
                density="compact"
                hide-details
                inset
                color="primary"
                class="mark-adding__switch"
              />
            </div>

            <div v-if="markAdding.is_end_time_active" class="mark-adding__time-controls">
              <v-number-input
                v-model="markAdding.end"
                @update:model-value="onEndTimeChange"
                :min="markAdding.time || 0"
                :max="playerDuration"
                :step="1"
                density="compact"
                variant="outlined"
                rounded="xl"
                hide-details
                class="mark-adding__number-input"
              />
              <v-btn
                @click="getCurrentTime('end')"
                size="small"
                variant="tonal"
                :title="t('player.mark_dialog.sync_with_player')"
                icon
              >
                <v-icon>mdi-sync</v-icon>
              </v-btn>
              <v-btn
                @click="jumpTo(markAdding.end ?? 0)"
                size="small"
                variant="tonal"
                :title="t('player.mark_dialog.jump_to_time')"
                icon
              >
                <v-icon>mdi-redo</v-icon>
              </v-btn>
            </div>
          </div>

          <div
            v-if="markAdding.is_end_time_active && segmentDuration != null"
            class="mark-adding__duration text-caption text-medium-emphasis"
          >
            {{ t('player.mark_dialog.segment_duration', {duration: formatTime(segmentDuration)}) }}
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
import MetaInputArray from '@/components/meta/input/MetaInputArray.vue'
import {
  BASE_MARK_TYPES,
  buildMarkTypes,
  findAssignedMeta,
  isMetaMarkType,
  normalizeMarkTime,
} from '@/utils/markAdding'

interface MarkAddingData {
  text?: string
  tagId?: number | null
}

type MarkTypeItem = ReturnType<typeof buildMarkTypes>[number]

const emit = defineEmits(['addMark'])

const appStore = useAppStore()
const playerStore = usePlayerStore()
const dialogsStore = useDialogsStore()
const itemsStore = useItemsStore()
const {t} = useI18n()

const form = ref<VFormInstance>(null)
const val = ref<number | null>(null)
const text = ref('')
const valid = ref(false)
const validationError = ref<string | null>(null)
const mark_types = ref<MarkTypeItem[]>([...BASE_MARK_TYPES])

const player = computed(() => playerStore.player)
const markAdding = computed(() => dialogsStore.markAdding)
const playerDuration = computed(() => Math.floor(playerStore.duration || 0))

const is_bookmark = computed(() => markAdding.value.type === 'bookmark')
const is_meta = computed(() => isMetaMarkType(markAdding.value.type))

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
  if (is_bookmark.value) return Boolean(text.value?.trim())
  if (is_meta.value) return Boolean(val.value)
  return true
})

const selectedTypeIcon = computed(() => {
  const current = mark_types.value.find((item) => item.value == markAdding.value.type)
  return current?.icon || 'tooltip-plus'
})

const positionLabel = computed(() => t('player.mark_dialog.at_position', {
  time: formatTime(markAdding.value.time ?? playerStore.currentTime ?? 0),
}))

const buttons = computed(() => [{
  icon: 'plus',
  text: markAdding.value.submitting
    ? t('player.mark_dialog.adding')
    : t('common.add'),
  color: 'success',
  outlined: false,
  disabled: !canSubmit.value,
  action: add,
}])

const formatTime = (seconds: number) => getReadableDuration(seconds || 0)

const initMarkTypes = () => {
  mark_types.value = buildMarkTypes(itemsStore.assigned || [])
}

const getMarkTypeText = (item: MarkTypeItem) => {
  if ('textKey' in item && item.textKey) return t(item.textKey)
  if ('text' in item && item.text) return item.text
  return ''
}

const applyTypeColor = (type: string | number) => {
  const preset = BASE_MARK_TYPES.find((item) => item.value === type)
  if (preset) {
    dialogsStore.markAdding.color = preset.color
    return
  }

  findAssignedMeta(itemsStore.assigned, type)
  dialogsStore.markAdding.color = '#fff'
}

const changeType = (type: string | number) => {
  validationError.value = null
  applyTypeColor(type)

  if (!isMetaMarkType(String(type))) {
    dialogsStore.markAdding.meta = {}
    val.value = null
    return
  }

  const found = findAssignedMeta(itemsStore.assigned, type)
  dialogsStore.markAdding.meta = found?.meta || {}
  val.value = null
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

const setVal = (newVal: unknown) => {
  val.value = Array.isArray(newVal) ? (newVal[0] as number) : (newVal as number)
  if (val.value == null) return
  const tag = appStore.getTagById(val.value)
  if (tag?.color) {
    dialogsStore.markAdding.color = tag.color
  }
}

const resetForm = () => {
  val.value = null
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
    if (is_meta.value && !val.value) {
      validationError.value = t('player.mark_dialog.select_tag_required')
    }
    return
  }

  if (is_bookmark.value) {
    form.value?.validate()
    if (!valid.value || !text.value?.trim()) return
  }

  const data: MarkAddingData = {}
  if (!markAdding.value.is_end_time_active) {
    dialogsStore.markAdding.end = null
  }

  if (is_bookmark.value) {
    data.text = text.value.trim()
  } else if (is_meta.value) {
    data.tagId = val.value
  }

  emit('addMark', data)
}

const submitIfReady = () => {
  if (canSubmit.value) add()
}

watch(() => itemsStore.assigned, () => {
  initMarkTypes()
  if (isMetaMarkType(markAdding.value.type)) {
    changeType(markAdding.value.type)
  }
}, {deep: true})

watch(() => markAdding.value.show, (show) => {
  if (!show) {
    resetForm()
    return
  }

  initMarkTypes()
  resetForm()
  applyTypeColor(markAdding.value.type)

  if (isMetaMarkType(markAdding.value.type)) {
    changeType(markAdding.value.type)
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

.mark-adding__number-input {
  width: 132px;
  max-width: 132px;

  :deep(.v-field) {
    align-items: center;
  }
}

.mark-adding__readable {
  font-variant-numeric: tabular-nums;
}

.mark-adding__duration {
  margin-top: 12px;
  padding-left: 0;
  min-height: 20px;
  display: flex;
  align-items: center;
}
</style>
