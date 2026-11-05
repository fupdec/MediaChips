<template>
  <v-expansion-panels class="media-copies mb-2" variant="accordion">
    <v-expansion-panel elevation="0" @group:selected="onExpanded">
      <v-expansion-panel-title class="media-copies__header" hide-actions v-slot="{expanded}">
        <v-icon size="16" class="media-copies__chevron" aria-hidden="true">{{ expanded ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
        <span class="media-copies__heading">{{ t('copies.title') }}</span>
        <span v-if="data" class="media-copies__count" aria-hidden="true">{{ data.copies.length }}</span>
      </v-expansion-panel-title>
      <v-expansion-panel-text>
        <div class="media-copies__body">
          <slot name="source" />
          <v-progress-linear v-if="loading" indeterminate color="primary" rounded :aria-label="t('copies.title')" />
          <template v-if="data">
            <div class="media-copies__preference-row">
              <span class="media-copies__label">{{ t('copies.preferred') }}</span>
              <v-select :menu-props="{contentClass: 'media-detail-select-menu', maxHeight: 260}" :list-props="{density: 'compact', slim: true}"
                class="media-copies__preferred"
                :model-value="data.preferredId"
                :items="choices"
                :aria-label="t('copies.preferred')"
                :disabled="pending || loading"
                variant="outlined"
                rounded="pill"
                hide-details
                density="compact"
                @update:model-value="prefer"
                single-line
              />
            </div>
            <ul class="media-copies__list">
              <li v-for="copy in data.copies" :key="copy.id" class="media-copies__copy" :class="{'media-copies__copy--preferred': copy.id === data.preferredId}">
                <span class="media-copies__provider-icon" aria-hidden="true"><v-icon size="14">{{ providerIcon(copy.provider) }}</v-icon></span>
                <div class="media-copies__copy-content">
                  <div class="media-copies__copy-heading">
                    <span class="media-copies__provider">{{ providerLabel(copy.provider) }}</span>
                    <v-chip v-if="copy.id === data.preferredId" size="x-small" color="primary" variant="tonal" prepend-icon="mdi-star-four-points-outline">{{ t('copies.preferred') }}</v-chip>
                  </div>
                  <div class="media-copies__path" :title="copy.path">{{ copy.path }}</div>
                  <div class="media-copies__statuses">
                    <span class="media-copies__availability" :class="availabilityColor(copy.availability) && `text-${availabilityColor(copy.availability)}`">
                      <span class="media-copies__status-dot" aria-hidden="true" />
                      {{ t('sources.catalog.states.' + copy.availability) }}
                    </span>
                    <span class="media-copies__verification">
                      <v-icon size="14" :color="copy.relationship === 'version' ? 'info' : copy.verified ? 'success' : undefined" aria-hidden="true">{{ copy.relationship === 'version' ? 'mdi-file-compare' : copy.verified ? 'mdi-check-decagram-outline' : 'mdi-shield-outline' }}</v-icon>
                      {{ t(copy.relationship === 'version' ? 'duplicateSimilarity.version' : copy.verified ? copy.verificationMethod ? 'copies.verified_' + copy.verificationMethod : 'copies.verified' : 'copies.unverified') }}
                    </span>
                  </div>
                </div>
                <v-btn v-if="copy.verified && data.copies.length > 1" class="media-copies__detach" icon="mdi-link-off" variant="text" size="small" :title="t('copies.detach')" :aria-label="t('copies.detach') + ': ' + copy.path" :disabled="pending || loading" @click="detach(copy.id)" />
              </li>
            </ul>
            <MediaCopyDiscovery :media-id="mediaId" @changed="load" />
            <form class="media-copies__add" @submit.prevent="attach">
              <div class="media-copies__add-fields">
                <span class="media-copies__label">{{ t('copies.add_local') }}</span>
                <v-text-field v-model="localPath" :aria-label="t('copies.local_path')" :placeholder="t('copies.local_path')" variant="outlined" rounded="pill" density="compact" hide-details single-line :disabled="pending || loading" />
                <v-btn type="submit" class="media-copies__attach" color="primary" variant="tonal" size="x-small" icon="mdi-file-check-outline" :title="t('copies.attach')" :aria-label="t('copies.attach')" :loading="checking" :disabled="!localPath.trim() || pending || loading" />
              </div>
              <p v-if="checking" class="media-copies__checking" role="status">{{ t(settings.copyVerificationSha256 === '1' ? 'copies.checking_full' : 'copies.checking') }}</p>
            </form>
          </template>
          <v-alert v-if="error" type="error" variant="tonal" density="compact" class="media-copies__error" role="alert">{{ error }}</v-alert>
          <details class="media-copies__help">
            <summary>{{ t('copies.help') }}</summary>
            <p>{{ t('copies.hint') }}</p>
            <p>{{ t('copies.merge_hint') }}</p>
          </details>
        </div>
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import MediaCopyDiscovery from './MediaCopyDiscovery.vue'
import {useI18n} from 'vue-i18n'
import {useSettingsStore} from '@/stores/settings'
import {useAppStore} from '@/stores/app'
import {mediaCopiesApi as api} from '@/services/typedApi/mediaCopies'
import {useItemsListSync} from '@/composable/itemsListSync'
import type {MediaCopy, MediaCopies} from '@shared/mediaCopies'
const props = defineProps<{mediaId: number}>()
const {t, te} = useI18n()
const providerIcon = (provider: MediaCopy['provider']) => provider === 'local' ? 'mdi-harddisk' : provider === 'nas' ? 'mdi-server-network' : provider === 'gdrive' ? 'mdi-google-drive' : provider === 'dropbox' ? 'mdi-dropbox' : 'mdi-microsoft-onedrive'
const providerLabel = (provider: MediaCopy['provider']) => provider === 'nas' ? 'NAS' : t(`sources.catalog.kinds.${provider}`)
const availabilityColor = (availability: MediaCopy['availability']) => availability === 'available' ? 'success' : availability === 'unavailable' ? 'warning' : undefined
const app = useAppStore()
const settings = useSettingsStore()
const sync = useItemsListSync()
const data = ref<MediaCopies>()
const loading = ref(false)
const pending = ref(false)
const checking = ref(false)
const localPath = ref('')
const error = ref('')
let generation = 0
const choices = computed(() => [{title: t('copies.automatic'), value: null as string | null},
  ...(data.value?.copies.filter(copy => copy.verified).map(copy => ({title: copy.path, value: copy.id})) || [])])
const showError = (err: unknown) => {
  const code = (err as {response?: {data?: {code?: string}}})?.response?.data?.code || 'failed'
  error.value = t(te(`copies.errors.${code}`) ? `copies.errors.${code}` : 'copies.errors.failed')
}
async function load() {
  const current = generation
  loading.value = true; error.value = ''
  try { const response = await api.list(props.mediaId); if (current === generation) data.value = response.data }
  catch (err) { if (current === generation) showError(err) }
  finally { if (current === generation) loading.value = false }
}
function onExpanded(value: {value: boolean}) { if (value.value) void load() }
defineExpose({refresh: load})
async function action(run: () => ReturnType<typeof api.list>, refresh = false) {
  if (pending.value) return
  const current = generation
  pending.value = true; error.value = ''
  try {
    const response = await run()
    if (current !== generation) return
    data.value = response.data
    if (refresh) { localPath.value = ''; sync.getItemsFromDb({ids: [props.mediaId], type: 'media'}) }
  } catch (err) { if (current === generation) showError(err) }
  finally { if (current === generation) pending.value = false }
}
const prefer = (id: string | null) => action(() => api.prefer(props.mediaId, id))
const detach = (id: string) => action(() => api.detach(props.mediaId, id), true)
const attach = async () => {
  if (!localPath.value.trim() || pending.value) return
  checking.value = true
  try { await action(() => api.attachLocal(props.mediaId, localPath.value.trim()), true) } finally { checking.value = false }
}
onBeforeUnmount(() => { generation++ })
watch([() => props.mediaId, () => app.dbPath, () => app.localhost], () => {
  generation++; data.value = undefined; localPath.value = ''; pending.value = false; error.value = ''
  void load()
})
</script>

<style scoped lang="scss">
.media-copies {
  font-size: 0.75rem;

  :deep(.v-expansion-panel) {
    overflow: hidden;
    border: 1px solid rgba(var(--v-theme-primary), 0.16);
    border-radius: var(--edit-deck-radius, 16px) !important;
    background: rgba(var(--v-theme-primary), 0.03);
    box-shadow: 0 1px 0 rgba(var(--v-theme-primary), 0.04), 0 8px 22px -16px rgba(0, 0, 0, 0.22);
  }
  :deep(.v-expansion-panel-title) { min-height: 28px; padding: 6px 10px; gap: 6px; justify-content: flex-start; }
  :deep(.v-expansion-panel-text__wrapper) { padding: 0; }
  &__heading { font-size: 0.75rem; font-weight: 500; line-height: 1.2; }
  &__chevron { opacity: 0.65; }
  &__count { font-size: 0.6875rem; opacity: 0.55; font-variant-numeric: tabular-nums; }
  &__body { border-top: 1px solid rgba(var(--v-theme-primary), 0.1); }
  &__preference-row, &__add-fields { display: flex; align-items: center; gap: 8px; padding: 6px 12px; }
  &__label { flex-shrink: 0; font-size: 0.6875rem; color: rgba(var(--v-theme-on-surface), 0.55); }
  &__preferred { max-width: 380px; min-width: 0; }
  &__preferred :deep(.v-select__selection-text) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  :deep(.v-field) { font-size: 0.75rem; --v-field-padding-start: 10px; --v-field-padding-end: 6px; }
  :deep(.v-field__input) { min-height: 28px; padding-block: 3px; line-height: 20px; }
  :deep(.v-field__append-inner) { padding-top: 0; align-items: center; }
  :deep(.v-field__outline) { --v-field-border-opacity: 0.16; }
  &__list { padding: 0; margin: 0; list-style: none; }
  &__copy { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-top: 1px solid rgba(var(--v-theme-primary), 0.1); }
  &__copy--preferred { background: rgba(var(--v-theme-primary), 0.045); }
  &__provider-icon { display: flex; color: rgba(var(--v-theme-on-surface), 0.6); }
  &__copy-content { flex: 1; min-width: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; }
  &__copy-heading { display: flex; align-items: center; gap: 5px; }
  &__provider { font-weight: 500; }
  &__path { flex: 1 1 200px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.6875rem; color: rgba(var(--v-theme-on-surface), 0.7); }
  &__statuses { display: flex; flex-wrap: wrap; gap: 4px 6px; font-size: 0.6875rem; line-height: 1.2; }
  &__availability, &__verification { display: inline-flex; align-items: center; gap: 4px; min-height: 22px; padding: 0 7px; border: 1px solid rgba(var(--v-theme-primary), 0.12); border-radius: 999px; background: rgba(var(--v-theme-surface), 0.92); }
  &__status-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
  &__verification { color: rgba(var(--v-theme-on-surface), 0.62); }
  &__detach { width: 24px; height: 24px; color: rgba(var(--v-theme-on-surface), 0.5); }
  &__detach :deep(.v-icon) { font-size: 16px; }
  &__add { border-top: 1px solid rgba(var(--v-theme-primary), 0.1); }
  &__add-fields > .v-input { min-width: 0; }
  &__attach { width: 28px; height: 28px; flex-shrink: 0; }
  &__checking { margin: 0; padding: 0 12px 6px; font-size: 0.6875rem; }
  &__error { margin: 4px 12px; padding: 6px 8px; font-size: 0.6875rem; }
  &__help { padding: 4px 12px 6px; border-top: 1px solid rgba(var(--v-theme-primary), 0.1); color: rgba(var(--v-theme-on-surface), 0.55); font-size: 0.6875rem; line-height: 1.5; }
  &__help summary { cursor: pointer; width: fit-content; }
  &__help p { margin: 6px 0 0; max-width: 85ch; }

  @media (max-width: 599px) {
    &__preference-row, &__add-fields { flex-wrap: wrap; gap: 4px 6px; }
    &__label { width: 100%; }
    &__copy-content { column-gap: 6px; }
    &__path { flex-basis: 100%; order: 1; white-space: normal; overflow-wrap: anywhere; }
    &__statuses { flex: 1 1 auto; }
  }
}
</style>
