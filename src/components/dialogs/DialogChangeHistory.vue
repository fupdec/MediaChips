<template>
  <slot name="activator" :open="open">
    <v-btn class="history-trigger" prepend-icon="mdi-history" append-icon="mdi-chevron-right" variant="tonal" color="primary" rounded="lg" :disabled="disabled" @click="open">{{ t('change_history.title') }}</v-btn>
  </slot>
  <v-dialog v-model="visible" :aria-label="t('change_history.title')" class="change-history-dialog" max-width="1040" :persistent="busy" scrollable>
    <v-card class="operation-dialog history-dialog" rounded="lg">
      <DialogHeader :header="t('change_history.title')" icon="history" :closable="!busy" @close="visible = false" />
      <v-card-text class="operation-body">
        <div class="operation-hero">
          <div class="operation-hero__text">
            <p>{{ t('change_history.workspace_hint') }}</p>
          </div>
          <v-btn variant="outlined" prepend-icon="mdi-refresh" rounded="lg" size="small" :disabled="loading || detailsLoading || busy" @click="loadOperations(true)">{{ t('change_history.refresh') }}</v-btn>
        </div>
        <v-alert v-if="error" type="error" variant="tonal" rounded="lg" class="mb-2" role="alert">{{ error }}</v-alert>
        <v-alert v-if="success" type="success" variant="tonal" rounded="lg" class="mb-2" role="status">{{ success }}</v-alert>
        <v-progress-linear v-if="loading || detailsLoading" indeterminate color="primary" :aria-label="t('change_history.loading')" />
        <div v-if="!loading && !operations.length && !error" class="operation-empty history-empty">
          <div class="operation-empty__icon"><v-icon icon="mdi-history" size="36" /></div>
          <h3>{{ t('change_history.empty_title') }}</h3>
          <p>{{ t('change_history.empty') }}</p>
        </div>
        <div v-else-if="operations.length" class="history-layout">
          <aside class="history-sidebar">
            <div class="operation-section-heading"><h3>{{ t('change_history.operations') }}</h3><v-chip size="x-small" variant="tonal">{{ operations.length }}{{ moreOperations ? '+' : '' }}</v-chip></div>
            <v-list class="history-timeline" :aria-label="t('change_history.operations')">
              <v-list-item v-for="operation in operations" :key="operation.id" :active="selected?.id === operation.id" :disabled="busy || loading || detailsLoading"
                class="history-operation" rounded="lg" color="primary" @click="selectOperation(operation)">
                <div class="history-operation__top">
                  <v-icon :icon="operation.remaining === 0 ? 'mdi-check-circle-outline' : sourceIcon(operation.source)" :color="operation.remaining === 0 ? 'success' : undefined" size="16" />
                  <time :datetime="operation.occurredAt">{{ date(operation.occurredAt) }}</time>
                </div>
                <div class="history-operation__title">{{ sourceLabel(operation.source) }}</div>
                <div class="history-operation__summary">{{ t('change_history.summary', {items: operation.items, fields: operation.fields}) }}</div>
                <div v-if="operation.remaining === 0" class="history-operation__restored text-success">{{ t('change_history.restored') }}</div>
              </v-list-item>
            </v-list>
            <v-btn v-if="moreOperations" block variant="text" prepend-icon="mdi-chevron-down" :disabled="loading || detailsLoading || busy" @click="loadOperations(false)">{{ t('change_history.more') }}</v-btn>
          </aside>
          <section v-if="selected" class="history-detail" :aria-label="t('change_history.details')" :aria-busy="detailsLoading">
            <div class="history-detail__header">
              <div>
                <span class="operation-eyebrow">{{ t('change_history.details') }}</span>
                <h2>{{ sourceLabel(selected.source) }}</h2>
                <time class="history-detail__date" :datetime="selected.occurredAt">{{ date(selected.occurredAt) }}</time>
              </div>
              <v-chip v-if="!selected.remaining" color="success" variant="tonal" prepend-icon="mdi-check-circle-outline" size="x-small">{{ t('change_history.restored') }}</v-chip>
            </div>
            <div class="history-detail__summary">
              <div class="history-stat"><v-icon icon="mdi-card-multiple-outline" size="16" /><div><strong>{{ selected.items }}</strong><span>{{ t('change_history.items_label') }}</span></div></div>
              <div class="history-stat"><v-icon icon="mdi-text-box-edit-outline" size="16" /><div><strong>{{ selected.fields }}</strong><span>{{ t('change_history.fields_label') }}</span></div></div>
              <div class="history-stat"><v-icon icon="mdi-backup-restore" size="16" /><div><strong>{{ selected.remaining }}</strong><span>{{ t('change_history.remaining_label') }}</span></div></div>
            </div>
            <div class="history-undo">
              <span class="history-undo__hint">{{ t('change_history.undo_hint') }}</span>
              <v-btn prepend-icon="mdi-undo" color="primary" variant="flat" rounded="lg" size="small" :disabled="!selected.remaining || busy || loading || detailsLoading" :loading="busy" @click="restore()">
                {{ t('change_history.undo_operation', {count: selected.remaining}) }}
              </v-btn>
            </div>
            <div v-for="field in fields" :key="field.id" class="history-field" :class="{'history-field--restored': !!field.restoredAt}">
              <div class="history-field__header">
                <div class="history-field__entity-icon"><v-icon :icon="field.entityType === 'tag' ? 'mdi-tag-outline' : field.entityType === 'mark' ? 'mdi-bookmark-outline' : 'mdi-file-outline'" size="16" /></div>
                <div class="history-field__name">
                  <h3>{{ field.entityName || `${t(`change_history.entities.${field.entityType}`)} #${field.entityId}` }}</h3>
                  <span>{{ t(`change_history.entities.${field.entityType}`) }} #{{ field.entityId }}<span class="mx-1">·</span>{{ fieldLabel(field) }}</span>
                </div>
                <v-btn size="x-small" :variant="field.restoredAt ? 'text' : 'tonal'" :color="field.restoredAt ? 'success' : 'primary'" :prepend-icon="field.restoredAt ? 'mdi-check' : 'mdi-backup-restore'" rounded="lg" :disabled="busy || loading || detailsLoading || !!field.restoredAt" @click="restore(field.id)">
                  {{ t(field.restoredAt ? 'change_history.restored' : 'change_history.restore_field') }}
                </v-btn>
              </div>
              <div class="history-values">
                <div class="history-value-panel history-value-panel--before"><span class="history-value-label"><v-icon icon="mdi-minus" size="14" />{{ t('change_history.before') }}</span><div class="history-value">{{ value(field.before) }}</div></div>
                <v-icon size="18" class="history-values__arrow" icon="mdi-arrow-right" />
                <div class="history-value-panel history-value-panel--after"><span class="history-value-label"><v-icon icon="mdi-plus" size="14" />{{ t('change_history.after') }}</span><div class="history-value">{{ value(field.after) }}</div></div>
              </div>
            </div>
            <v-btn v-if="moreFields" block variant="text" prepend-icon="mdi-chevron-down" :disabled="busy || loading || detailsLoading" @click="loadFields(false)">{{ t('change_history.more') }}</v-btn>
          </section>
        </div>
      </v-card-text>
      <div class="operation-footer"><v-icon icon="mdi-shield-check-outline" size="17" /><span>{{ t('change_history.protection_hint') }}</span></div>
    </v-card>
  </v-dialog>
</template>
<script setup lang="ts">
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import type {HistoryEntity, HistoryField, HistoryOperation} from '@shared/changeHistory'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import {typedApi} from '@/services/typedApi'
import {getErrorResponseData} from '@/types/vue'
import {useItemsListSync} from '@/composable/itemsListSync'
import {reloadTagsCatalog} from '@/composable/appCatalogs'
import {useEventBus} from '@/utils/eventBus'

const props = defineProps<{entityType?: HistoryEntity; entityId?: number; disabled?: boolean}>()
const emit = defineEmits<{restored: []}>()
const {t, te, locale} = useI18n()
const listSync = useItemsListSync()
const eventBus = useEventBus()
const visible = ref(false), loading = ref(false), detailsLoading = ref(false), busy = ref(false)
const error = ref(''), success = ref('')
const operations = ref<HistoryOperation[]>([]), fields = ref<HistoryField[]>([])
const selected = ref<HistoryOperation | null>(null)
const moreOperations = ref(false), moreFields = ref(false)

function date(text: string) { return new Date(text).toLocaleString(locale.value) }
function sourceLabel(source: string) {
  if (source === 'history:restore') return t('change_history.restore_source')
  if (source.includes('bulk-meta') || source === 'bulk-edit') return t('change_history.bulk_source')
  return t(source === 'system' ? 'change_history.system_source' : 'change_history.edit_source')
}
function sourceIcon(source: string) {
  return source === 'history:restore' ? 'mdi-backup-restore' : source === 'system' ? 'mdi-cog-outline' : source.includes('bulk') ? 'mdi-layers-outline' : 'mdi-pencil-outline'
}
function fieldLabel(field: HistoryField) {
  const key = `change_history.fields.${field.field === '$record' ? 'record' : field.field}`
  return te(key) ? t(key) : field.fieldLabel
}
function value(input: unknown): string {
  if (input === null || input === undefined) return t('change_history.no_value')
  if (input === '') return t('change_history.empty_value')
  if (typeof input === 'boolean') return t(input ? 'change_history.present' : 'change_history.absent')
  if (typeof input === 'object' && 'value' in input) return value(input.value)
  return typeof input === 'object' ? JSON.stringify(input, null, 2) : String(input)
}
function failure(cause: unknown) {
  const status = (cause as {response?: {status?: number}})?.response?.status
  error.value = status === 409 ? t('change_history.conflict')
    : getErrorResponseData<{message?: string}>(cause)?.message || t('change_history.error')
}
async function open() {
  if (props.disabled) return
  visible.value = true
  error.value = ''; success.value = ''; selected.value = null; fields.value = []
  await loadOperations(true)
}
async function loadOperations(reset: boolean) {
  loading.value = true
  error.value = ''
  try {
    const result = await typedApi.getChangeHistory({entityType: props.entityType, entityId: props.entityId, offset: reset ? 0 : operations.value.length})
    operations.value = reset ? result.data.items : [...operations.value, ...result.data.items]
    moreOperations.value = result.data.hasMore
    if (reset) {
      selected.value = operations.value.find(op => op.id === selected.value?.id) || operations.value[0] || null
      fields.value = []
      if (selected.value) await loadFields(true)
    }
  } catch (cause) { failure(cause) }
  finally { loading.value = false }
}
async function selectOperation(operation: HistoryOperation) {
  selected.value = operation; fields.value = []; error.value = ''; success.value = ''
  await loadFields(true)
}
async function loadFields(reset: boolean) {
  if (!selected.value) return
  detailsLoading.value = true
  try {
    const result = await typedApi.getChangeHistoryDetails(selected.value.id, reset ? 0 : fields.value.length)
    fields.value = reset ? result.data.items : [...fields.value, ...result.data.items]
    moreFields.value = result.data.hasMore
  } catch (cause) { failure(cause) }
  finally { detailsLoading.value = false }
}
async function restore(fieldId?: number) {
  if (!selected.value || busy.value) return
  busy.value = true; error.value = ''; success.value = ''
  try {
    const result = await typedApi.restoreChangeHistory(selected.value.id, fieldId)
    success.value = t('change_history.success', {count: result.data.restored})
    listSync.getItemsFromDb({type: 'media'})
    listSync.getItemsFromDb({type: 'tag'})
    eventBus.emit('markers:reload')
    void reloadTagsCatalog()
    await loadOperations(true)
    emit('restored')
  } catch (cause) { failure(cause) }
  finally { busy.value = false }
}
</script>

<style scoped lang="scss" src="@/assets/styles/operation-dialog.scss"></style>

<style scoped lang="scss">
.history-trigger {
  min-height: 40px;
  padding-inline: 14px;
  border: 1px solid rgba(var(--v-theme-primary), .14);
  font-size: .8125rem;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  :deep(.v-btn__prepend) { margin-inline-end: 10px; }
  :deep(.v-btn__append) { margin-inline-start: 16px; opacity: .6; }
}
.history-dialog {
  --operation-border: rgba(var(--v-theme-on-surface), .1);
  --operation-muted: rgba(var(--v-theme-on-surface), .6);
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 24px 80px rgba(0, 0, 0, .24);

  :deep(.dialog-header) {
    background: transparent;
    box-shadow: none;
    border-bottom: 1px solid var(--operation-border);
  }
  :deep(.dialog-header .content) { min-height: 52px; padding: 8px 20px; }
  :deep(.dialog-header .headline__title) { font-size: 1rem; font-weight: 600; }
  :deep(.dialog-header__close) { width: 32px; height: 32px; }
  .operation-body { padding: 20px !important; }
  .operation-hero { padding: 0 0 16px; margin-bottom: 16px; border: 0; border-bottom: 1px solid var(--operation-border); border-radius: 0; background: transparent; }
  .operation-hero p { font-size: .8125rem; }
  .v-btn { min-height: 32px; font-size: .75rem; }
  .history-layout { grid-template-columns: 248px minmax(0, 1fr); gap: 24px; }
  .operation-section-heading { margin-bottom: 12px; }
  .operation-section-heading h3 { font-size: .8125rem; font-weight: 600; }
  .history-timeline { max-height: min(480px, 55vh); padding-right: 4px; scrollbar-width: thin; }
  .history-operation {
    padding: 12px !important;
    margin-bottom: 6px;
    border-color: transparent;
    border-radius: 8px !important;
    &__top { font-size: .6875rem; gap: 6px; }
    &__title { font-size: .8125rem; margin: 6px 0 3px; }
    &__summary { font-size: .75rem; }
    &.v-list-item--active { border-color: rgba(var(--v-theme-primary), .22); }
  }
  .history-detail { padding-left: 24px; }
  .history-detail__header { margin-bottom: 16px; }
  .operation-eyebrow { font-size: .6875rem; margin-bottom: 4px; }
  .history-detail h2 { display: block; font-size: 1.125rem; font-weight: 600; margin: 0 0 4px; }
  .history-detail__date { font-size: .75rem; }
  .history-detail__summary { gap: 8px; margin-bottom: 18px; }
  .history-stat { border: 0; border-radius: 6px; padding: 6px 8px; background: rgba(var(--v-theme-on-surface), .045); }
  .history-stat strong { font-weight: 600; }
  .history-undo { align-items: flex-start; gap: 12px; margin-bottom: 20px; }
  .history-undo__hint { font-size: .75rem; line-height: 1.6; }
  .history-field { margin-bottom: 12px; border-radius: 10px; background: rgb(var(--v-theme-surface)); }
  .history-field__header { padding: 12px; gap: 10px; }
  .history-field__entity-icon { align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; background: rgba(var(--v-theme-on-surface), .045); }
  .history-field h3 { display: block; margin: 0 0 3px; font-size: .8125rem; font-weight: 600; }
  .history-field__name > span { font-size: .6875rem; }
  .history-values { padding: 0 12px 12px; gap: 10px; grid-template-columns: minmax(0, 1fr) 18px minmax(0, 1fr); }
  .history-value-panel { padding: 10px 12px; border-radius: 8px; }
  .history-value-label { font-size: .6875rem; margin-bottom: 8px; }
  .history-value { font-size: .8125rem; line-height: 1.6; }
  .operation-footer { padding: 12px 20px; background: transparent; font-size: .6875rem; }
  .history-empty { min-height: 260px; }
}
@media (max-width: 700px) {
  .history-dialog {
    .operation-body { padding: 14px !important; }
    :deep(.dialog-header .content) { padding-inline: 14px; }
    .history-layout { grid-template-columns: 1fr; gap: 16px; }
    .history-timeline { max-height: 180px; }
    .history-detail { padding: 16px 0 0; }
    .history-field__header > .v-btn { margin-left: auto; }
    .history-values { grid-template-columns: minmax(0, 1fr); }
    .history-values__arrow { justify-self: center; transform: rotate(90deg); }
    .operation-footer { padding: 12px 14px; }
  }
}
</style>
