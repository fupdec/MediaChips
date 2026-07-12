<template>
  <v-dialog
    v-if="dialog"
    v-model="dialog"
    :fullscreen="xs"
    :width="xl ? 1500 : 900"
    scrollable
  >
    <v-card class="bulk-editing-dialog">
      <DialogHeader
        @close="close"
        :header="t('bulk_editing.title')"
        :buttons="hasEditableFields ? buttons : []"
        icon="pencil-plus"
        closable
      />

      <v-card-text class="pa-2 pa-sm-4">
        <div v-if="hasEditableFields" class="bulk-editing-summary mb-4">
          <v-chip
            v-if="itemsStore.selection.length"
            color="primary"
            variant="tonal"
            size="small"
            prepend-icon="mdi-checkbox-multiple-marked-outline"
            class="mr-2 mb-2"
          >
            {{ t('bulk_editing.selected_count', { count: itemsStore.selection.length }) }}
          </v-chip>

          <v-chip
            v-if="activeChangesCount"
            color="success"
            variant="tonal"
            size="small"
            prepend-icon="mdi-playlist-edit"
            class="mr-2 mb-2"
          >
            {{ t('bulk_editing.changes_count', { count: activeChangesCount }) }}
          </v-chip>

          <v-chip
            v-if="saving"
            color="warning"
            variant="tonal"
            size="small"
            prepend-icon="mdi-timer-sand"
            class="mb-2"
          >
            {{ t('bulk_editing.saving') }}
          </v-chip>
        </div>

        <v-sheet
          v-if="hasEditableFields"
          class="mode-legend rounded-xl pa-3 mb-4"
          color="rgba(150, 150, 150, 0.09)"
        >
          <div class="text-caption text-medium-emphasis mb-2">
            {{ t('bulk_editing.mode_hint') }}
          </div>
          <div class="d-flex flex-wrap ga-2">
            <v-chip
              v-for="mode in editModes"
              :key="mode.type"
              :color="mode.color"
              variant="tonal"
              size="small"
              :prepend-icon="mode.icon"
            >
              {{ mode.label }}
            </v-chip>
          </div>
        </v-sheet>

        <v-alert
          v-else
          type="warning"
          class="text-caption mb-4"
          variant="tonal"
          density="compact"
          rounded="xl"
        >
          <v-row align="center">
            <v-col class="grow">
              {{ t('bulk_editing.no_meta_assigned', { type: itemsStore.type }) }} <br>
              {{ t('bulk_editing.assign_in_settings') }}
            </v-col>
            <v-col class="shrink d-flex justify-end">
              <button-documentation id="meta.assign"/>
            </v-col>
          </v-row>
        </v-alert>

        <template v-if="presetFields.length">
          <div class="text-subtitle-2 font-weight-medium mb-3">
            {{ t('bulk_editing.preset_section') }}
          </div>

          <v-row class="mb-2">
            <v-col
              v-for="field in presetFields"
              :key="field.key"
              cols="12"
              md="6"
              xl="4"
            >
              <BulkEditFieldCard
                :field="field"
                :edit-type="getEditType(field.key)"
                :edit-mode="editModeMeta(field.key)"
                :value="values[field.key]"
                :show-icons="showIcons"
                :disabled="isFieldInputDisabled(field.key)"
                :refresh-key="key"
                @toggle-mode="toggleEditMode(field)"
                @update:value="setVal($event, field.key)"
              />
            </v-col>
          </v-row>
        </template>

        <template v-if="pinned.length">
          <div
            v-if="presetFields.length"
            class="text-subtitle-2 font-weight-medium mb-3 mt-2"
          >
            {{ t('bulk_editing.pinned_section') }}
          </div>

          <v-row>
            <v-col
              v-for="field in pinnedFields"
              :key="field.key"
              cols="12"
              md="6"
              xl="4"
            >
              <BulkEditFieldCard
                :field="field"
                :edit-type="getEditType(field.key)"
                :edit-mode="editModeMeta(field.key)"
                :value="values[field.key]"
                :show-icons="showIcons"
                :disabled="isFieldInputDisabled(field.key)"
                :refresh-key="key"
                @toggle-mode="toggleEditMode(field)"
                @update:value="setVal($event, field.key)"
                @pick-date="pickDate(field.key)"
                @clear-date="clearDate(field.key)"
              />
            </v-col>
          </v-row>
        </template>
      </v-card-text>
    </v-card>

    <v-dialog v-model="datePicker.dialog" width="290">
      <v-date-picker
        @update:model-value="setDate"
        :model-value="datePicker.value"
        color="primary"
        rounded="xl"
      />
    </v-dialog>
  </v-dialog>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, watch, defineAsyncComponent} from 'vue'
import {useI18n} from 'vue-i18n'
import {useDisplay} from 'vuetify'
import dayjs from 'dayjs'
import {typedApi} from '@/services/typedApi'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import {useItemsStore} from '@/stores/items'
import {useDialogsStore} from '@/stores/dialogs'
import {useSettingsStore} from '@/stores/settings'
import {useEventBus} from '@/utils/eventBus'
import ButtonDocumentation from '@/components/ui/ButtonDocumentation.vue'
import {shouldReloadListAfterBulkAction} from '@/utils/resolveSelection'
import {sortPinnedAssignmentItems} from '@/utils/pinnedMetaOrder'
import {setNotification} from '@/services/notificationService'
import {getErrorResponseData} from '@/types/vue'
import type {Meta} from '@/types/stores'

interface BulkEditFieldMeta extends Meta {
  ratingMax?: number
  ratingIcon?: string
  ratingIconEmpty?: string
  ratingIconHalf?: string
  ratingHalf?: boolean
  ratingColor?: string
  hint?: string
}

interface BulkEditField {
  key: string | number
  kind: string
  type: string
  name: string
  icon?: string
  hint?: string
  meta?: BulkEditFieldMeta
}

interface BulkEditMode {
  type: number
  icon: string
  color: string
  label: string
}

type FieldKey = string | number
type FieldValue = string | number | boolean | unknown[] | null

const BulkEditFieldCard = defineAsyncComponent(() =>
  import('@/components/dialogs/BulkEditFieldCard.vue')
)

const {xs, xl} = useDisplay()
const itemsStore = useItemsStore()
const dialogsStore = useDialogsStore()
const settingsStore = useSettingsStore()
const eventBus = useEventBus()
const {t} = useI18n()

const dialog = ref(true)
const values = ref<Record<FieldKey, FieldValue>>({})
const edits = ref<Record<FieldKey, number>>({})
const key = ref(Date.now())
const saving = ref(false)
const datePicker = ref<{
  dialog: boolean
  metaId: FieldKey | null
  value: FieldValue
}>({
  dialog: false,
  metaId: null,
  value: null,
})

const pinned = computed((): Meta[] => {
  return sortPinnedAssignmentItems(itemsStore.safeAssigned)
    .map((item) => item.meta)
    .filter((meta): meta is Meta => Boolean(meta))
})

const presetFields = computed((): BulkEditField[] => {
  const fields: BulkEditField[] = []
  const itemType = itemsStore.type
  const tagMeta = itemsStore.meta || {}

  if (itemType === 'media') {
    fields.push({
      key: 'rating',
      kind: 'preset',
      type: 'preset-rating',
      name: t('meta.default_names.rating'),
      icon: 'star',
    })
    fields.push({
      key: 'favorite',
      kind: 'preset',
      type: 'preset-favorite',
      name: t('meta.default_names.favorite'),
      icon: 'heart',
    })
  } else if (itemType === 'tag') {
    if (tagMeta.rating) {
      fields.push({
        key: 'rating',
        kind: 'preset',
        type: 'preset-rating',
        name: t('meta.default_names.rating'),
        icon: 'star',
      })
    }
    if (tagMeta.favorite) {
      fields.push({
        key: 'favorite',
        kind: 'preset',
        type: 'preset-favorite',
        name: t('meta.default_names.favorite'),
        icon: 'heart',
      })
    }
  }

  if (settingsStore.count_number_of_views === '1') {
    fields.push({
      key: 'views',
      kind: 'preset',
      type: 'number',
      name: t('settings_labels.appearance.number_of_views'),
      icon: 'eye',
    })
  }

  return fields
})

const pinnedFields = computed((): BulkEditField[] =>
  pinned.value.map((meta) => ({
    key: meta.id,
    kind: 'meta',
    name: meta.name || '',
    icon: meta.icon,
    hint: String(meta.hint ?? ''),
    type: meta.type || '',
    meta: meta as BulkEditFieldMeta,
  }))
)

const editableFields = computed((): BulkEditField[] => [
  ...presetFields.value,
  ...pinnedFields.value,
])

const hasEditableFields = computed(() => editableFields.value.length > 0)

const showIcons = computed(() =>
  settingsStore.showIconsOfMetaInEditingDialog === '1'
)

const activeChangesCount = computed(() =>
  editableFields.value.filter((field) => (edits.value[field.key] || 0) > 0).length
)

const editModes = computed((): BulkEditMode[] => [
  {
    type: 0,
    icon: 'mdi-cancel',
    color: 'info',
    label: t('bulk_editing.mode_keep'),
  },
  {
    type: 1,
    icon: 'mdi-close-circle-outline',
    color: 'error',
    label: t('bulk_editing.mode_delete'),
  },
  {
    type: 2,
    icon: 'mdi-reload-alert',
    color: 'warning',
    label: t('bulk_editing.mode_replace'),
  },
  {
    type: 3,
    icon: 'mdi-plus-circle-outline',
    color: 'success',
    label: t('bulk_editing.mode_add'),
  },
])

const buttons = computed(() => [{
  icon: 'content-save',
  text: t('common.save'),
  color: 'success',
  variant: 'flat',
  disabled: saving.value || activeChangesCount.value === 0,
  action: save,
}])

const getEditType = (fieldKey: FieldKey) => edits.value[fieldKey] || 0

const editModeMeta = (fieldKey: FieldKey) => {
  const editType = getEditType(fieldKey)
  return editModes.value.find((mode) => mode.type === editType) || editModes.value[0]
}

const isFieldInputDisabled = (fieldKey: FieldKey) => {
  const editType = getEditType(fieldKey)
  return editType === 0 || editType === 1
}

const initValues = () => {
  for (const field of editableFields.value) {
    edits.value[field.key] = 0

    if (field.type === 'array') {
      values.value[field.key] = []
    } else if (field.type === 'boolean' || field.type === 'preset-favorite') {
      values.value[field.key] = 0
    } else if (
      field.type === 'number'
      || field.type === 'rating'
      || field.type === 'preset-rating'
    ) {
      values.value[field.key] = 0
    } else {
      values.value[field.key] = null
    }
  }
}

const close = () => {
  dialog.value = false
  dialogsStore.bulkEditingItems = false
}

const save = async () => {
  const items_type = itemsStore.type
  const selected_items_ids = itemsStore.selection

  if (!selected_items_ids.length || saving.value) return

  if (items_type !== 'media' && items_type !== 'tag') return

  const changes = pinnedFields.value
    .map((field) => ({
      metaId: field.key,
      editType: edits.value[field.key] || 0,
      metaType: field.type,
      value: values.value[field.key],
    }))
    .filter((change) => change.editType > 0)

  const presetChanges = presetFields.value
    .map((field) => ({
      field: String(field.key),
      editType: edits.value[field.key] || 0,
      value: values.value[field.key],
    }))
    .filter((change) => change.editType > 0)

  if (!changes.length && !presetChanges.length) {
    close()
    return
  }

  saving.value = true

  try {
    await typedApi.applyBulkMeta({
      itemType: items_type,
      itemIds: selected_items_ids,
      changes,
      presetChanges,
    })

    setNotification({
      type: 'success',
      title: t('bulk_editing.save_success', {count: selected_items_ids.length}),
    })

    close()

    const reloadList = shouldReloadListAfterBulkAction(selected_items_ids)
    eventBus.emit('getItemsFromDb', reloadList
      ? {type: items_type}
      : {ids: selected_items_ids, type: items_type})

    const hasTagChanges = changes.some((change) => change.metaType === 'array')
    if (hasTagChanges) {
      eventBus.emit('getTags')
    }

    itemsStore.selection = []
    itemsStore.selected_last = null
    itemsStore.isSelect = false
  } catch (error) {
    console.error('Error saving bulk edits:', error)

    setNotification({
      type: 'error',
      title: t('bulk_editing.save_error'),
      text: getErrorResponseData<{ message?: string }>(error)?.message
        || (error instanceof Error ? error.message : String(error)),
    })
  } finally {
    saving.value = false
  }
}

const toggleEditMode = (field: BulkEditField) => {
  const fieldKey = field.key
  edits.value[fieldKey] = (edits.value[fieldKey] || 0) + 1

  if (edits.value[fieldKey] > 2 && field.type !== 'array') {
    edits.value[fieldKey] = 0
  } else if (edits.value[fieldKey] > 3 && field.type === 'array') {
    edits.value[fieldKey] = 0
  }

  key.value = Date.now()
}

const setVal = (val: FieldValue, fieldKey: FieldKey) => {
  values.value[fieldKey] = val
}

const pickDate = (fieldKey: FieldKey) => {
  if (isFieldInputDisabled(fieldKey)) return

  datePicker.value.dialog = true
  datePicker.value.value = values.value[fieldKey]
  datePicker.value.metaId = fieldKey
}

const clearDate = (fieldKey: FieldKey) => {
  if (isFieldInputDisabled(fieldKey)) return
  values.value[fieldKey] = null
}

const setDate = (date: unknown) => {
  datePicker.value.dialog = false
  if (datePicker.value.metaId !== null && date) {
    values.value[datePicker.value.metaId] = dayjs(date as string | Date).format('YYYY-MM-DD')
  }
}

onMounted(() => {
  initValues()
})

watch(() => dialogsStore.bulkEditingItems, (newValue) => {
  if (!newValue && dialog.value) {
    close()
  }
})
</script>

<style scoped>
.bulk-editing-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}
</style>
