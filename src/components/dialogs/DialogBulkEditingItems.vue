<template>
  <EditDialogShell
    v-if="dialog"
    :show="dialog"
    :header="t('bulk_editing.title')"
    :subheader="t('bulk_editing.selected_count', { count: itemsStore.selection.length })"
    icon="pencil-plus"
    :buttons="hasEditableFields ? buttons : []"
    :dirty="activeChangesCount > 0"
    :loading="saving"
    v-model:unsaved-confirm="unsavedConfirm"
    @visibility-change="onVisibilityChange"
    @request-close="requestClose"
    @discard="close"
  >
    <div class="editing editing--sections bulk-editing">
      <template v-if="hasEditableFields">
        <div class="bulk-editing-toolbar">
          <span class="bulk-editing-hint">{{ t('bulk_editing.mode_hint') }}</span>
          <v-spacer/>
          <v-chip
            v-if="activeChangesCount"
            color="success"
            variant="tonal"
            size="small"
            prepend-icon="mdi-playlist-edit"
          >
            {{ t('bulk_editing.changes_count', { count: activeChangesCount }) }}
          </v-chip>
          <v-btn
            v-if="activeChangesCount && !saving"
            size="small"
            variant="text"
            prepend-icon="mdi-restore"
            @click="resetAll"
          >
            {{ t('bulk_editing.reset_all') }}
          </v-btn>
        </div>

        <div class="editing-grid">
          <EditingSectionHeader
            v-if="presetFields.length && pinnedFields.length"
            class="field--full"
            :title="t('bulk_editing.preset_section')"
            icon="mdi-star-outline"
          />
          <BulkEditFieldCard
            v-for="field in presetFields"
            :key="field.key"
            :field="field"
            :edit-type="getEditType(field.key)"
            :all-modes="editModes"
            :value="values[field.key]"
            :show-icons="showIcons"
            :disabled="isFieldInputDisabled(field.key)"
            @set-mode="setEditMode(field, $event)"
            @update:value="setVal($event, field.key)"
          />

          <EditingSectionHeader
            v-if="pinnedFields.length"
            class="field--full"
            :title="presetFields.length ? t('bulk_editing.pinned_section') : t('bulk_editing.title')"
            icon="mdi-pin-outline"
          />
          <BulkEditFieldCard
            v-for="field in pinnedFields"
            :key="field.key"
            :field="field"
            :edit-type="getEditType(field.key)"
            :all-modes="editModes"
            :value="values[field.key]"
            :show-icons="showIcons"
            :disabled="isFieldInputDisabled(field.key)"
            @set-mode="setEditMode(field, $event)"
            @update:value="setVal($event, field.key)"
            @pick-date="pickDate(field.key)"
            @clear-date="clearDate(field.key)"
          />
        </div>
      </template>

      <v-alert
        v-else
        type="warning"
        class="text-caption"
        variant="tonal"
        density="compact"
        rounded="xl"
      >
        <div class="mb-2">
          {{ t('bulk_editing.no_meta_assigned', { type: itemsStore.type }) }}
          <br>
          {{ t('bulk_editing.assign_in_settings') }}
        </div>
        <div class="d-flex flex-wrap align-center ga-2">
          <v-btn
            color="primary"
            size="small"
            variant="flat"
            rounded="xl"
            :to="{ path: '/settings', query: { tab: 'library', view: 'media' } }"
            @click="dialogsStore.bulkEditingItems = false"
          >
            <v-icon start size="small">mdi-pin</v-icon>
            {{ t('bulk_editing.open_field_pinning') }}
          </v-btn>
          <button-documentation id="meta.assign"/>
        </div>
      </v-alert>
    </div>

    <template #dialogs>
      <v-dialog v-model="datePicker.dialog" width="290">
        <v-date-picker
          @update:model-value="setDate"
          :model-value="datePicker.value"
          :title="t('filters.select_date')"
          :header="t('filters.enter_date')"
          color="primary"
          rounded="xl"
        />
      </v-dialog>
    </template>
  </EditDialogShell>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, watch, defineAsyncComponent} from 'vue'
import {useI18n} from 'vue-i18n'
import dayjs from 'dayjs'
import {typedApi} from '@/services/typedApi'
import EditDialogShell from '@/components/dialogs/editing/EditDialogShell.vue'
import EditingSectionHeader from '@/components/items/EditingSectionHeader.vue'
import {useEditDialogButtons} from '@/composable/useEditDialog'
import {useItemsStore} from '@/stores/items'
import {useDialogsStore} from '@/stores/dialogs'
import {useSettingsStore} from '@/stores/settings'
import {useItemsListSync} from '@/composable/itemsListSync'
import {reloadTagsCatalog} from '@/composable/appCatalogs'
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

const itemsStore = useItemsStore()
const dialogsStore = useDialogsStore()
const settingsStore = useSettingsStore()
  const listSync = useItemsListSync()
const {t} = useI18n()

const dialog = ref(true)
const unsavedConfirm = ref(false)
const values = ref<Record<FieldKey, FieldValue>>({})
const edits = ref<Record<FieldKey, number>>({})
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
  const seen = new Set<number>()
  return sortPinnedAssignmentItems(itemsStore.safeAssigned)
    .map((item) => item.meta)
    .filter((meta): meta is Meta => {
      if (!meta?.id) return false
      if (seen.has(meta.id)) return false
      seen.add(meta.id)
      return true
    })
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
    label: t('bulk_editing.mode_add_short'),
  },
])

const {build: buildButtons} = useEditDialogButtons()

const buttons = computed(() => buildButtons({onSave: save}).map((button) => ({
  ...button,
  disabled: saving.value || activeChangesCount.value === 0,
})))

const getEditType = (fieldKey: FieldKey) => edits.value[fieldKey] || 0

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
  unsavedConfirm.value = false
  dialog.value = false
  dialogsStore.bulkEditingItems = false
}

const requestClose = () => {
  if (activeChangesCount.value > 0 && !saving.value) {
    unsavedConfirm.value = true
    return
  }
  close()
}

const onVisibilityChange = (show: boolean) => {
  if (!show) requestClose()
}

const save = async () => {
  const items_type = itemsStore.type
  const selected_items_ids = [...itemsStore.selection]

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
    listSync.getItemsFromDb(reloadList
      ? {type: items_type}
      : {ids: selected_items_ids, type: items_type})

    const hasTagChanges = changes.some((change) => change.metaType === 'array')
    if (hasTagChanges) {
      void reloadTagsCatalog()
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

const setEditMode = (field: BulkEditField, mode: number) => {
  edits.value[field.key] = mode
}

const resetAll = () => {
  initValues()
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
.bulk-editing-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-block: 4px 8px;
  padding-inline: 12px;
}

.bulk-editing-hint {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
</style>
