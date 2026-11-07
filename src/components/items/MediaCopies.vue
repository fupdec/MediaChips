<template>
  <v-expansion-panels class="media-copies mb-2" variant="accordion" v-model="expandedPanel">
    <v-expansion-panel elevation="0" @group:selected="onExpanded">
      <v-expansion-panel-title v-if="!initiallyExpanded" class="media-copies__header" hide-actions v-slot="{expanded}">
        <v-icon size="16" class="media-copies__chevron" aria-hidden="true">{{ expanded ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
        <span class="media-copies__heading">{{ t('copies.title') }}</span>
        <span v-if="data" class="media-copies__count" aria-hidden="true">{{ data.copies.length }}</span>
      </v-expansion-panel-title>
      <v-expansion-panel-text>
        <div class="media-copies__body" :class="{'media-copies__body--standalone': initiallyExpanded}">
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
                rounded="lg"
                hide-details
                density="compact"
                @update:model-value="prefer"
                single-line
              />
            </div>
            <ul class="media-copies__list">
              <li v-for="copy in data.copies" :key="copy.id" class="media-copies__copy" :class="{'media-copies__copy--preferred': copy.id === data.preferredId}">
                <span class="media-copies__provider-icon" aria-hidden="true"><v-icon size="22">{{ providerIcon(copy.provider) }}</v-icon></span>
                <div class="media-copies__copy-content">
                  <div class="media-copies__copy-heading">
                    <span class="media-copies__filename" :title="copy.path">{{ fileName(copy.path) }}</span>
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
            <form class="media-copies__add" @submit.prevent="attach">
              <div class="media-copies__add-heading"><v-icon size="18" aria-hidden="true">mdi-file-plus-outline</v-icon>{{ t('copies.add_local') }}</div>
              <div class="media-copies__add-fields">
                <v-text-field v-model="localPath" :aria-label="t('copies.local_path')" :placeholder="t('copies.local_path')" variant="outlined" rounded="lg" density="compact" hide-details single-line :disabled="pending || loading" />
                <v-btn type="submit" class="media-copies__attach" color="primary" variant="tonal" size="small" prepend-icon="mdi-file-check-outline" :title="t('copies.attach')" :aria-label="t('copies.attach')" :loading="checking" :disabled="!localPath.trim() || pending || loading">{{ t('copies.attach') }}</v-btn>
              </div>
              <p v-if="checking" class="media-copies__checking" role="status">{{ t(settings.copyVerificationSha256 === '1' ? 'copies.checking_full' : 'copies.checking') }}</p>
            </form>
            <div class="media-copies__search-row">
              <details class="media-copies__search">
                <summary><v-icon size="15" aria-hidden="true">mdi-folder-search-outline</v-icon>{{ t('copyDiscovery.title') }}</summary>
                <MediaCopyDiscovery class="media-copies__discovery" :media-id="mediaId" :show-heading="false" compact collapse-history @changed="load" />
              </details>
              <div class="media-copies__help">
                <v-tooltip location="top" max-width="440" open-on-focus>
                  <template #activator="{props: tooltipProps}">
                    <v-btn v-bind="tooltipProps" icon="mdi-information-outline" variant="text"
                      size="x-small" :aria-label="t('copies.help')" />
                  </template>
                  <strong>{{ t('copies.help') }}</strong>
                  <p class="mt-2">{{ t('copies.hint') }}</p>
                  <p class="mt-2">{{ t('copies.merge_hint') }}</p>
                </v-tooltip>
              </div>
            </div>
          </template>
          <v-alert v-if="error" type="error" variant="tonal" density="compact" class="media-copies__error" role="alert">{{ error }}</v-alert>
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
const props = defineProps<{mediaId: number; initiallyExpanded?: boolean}>()
const expandedPanel = ref<number | undefined>(props.initiallyExpanded ? 0 : undefined)
const {t, te} = useI18n()
const fileName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() || path
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
}, {immediate: true})
</script>

<style scoped lang="scss">
.media-copies {
  font-size: .8125rem;
  :deep(.v-expansion-panel) {
    overflow: hidden;
    border: 1px solid rgba(var(--v-theme-primary), .16);
    border-radius: var(--edit-deck-radius, 16px) !important;
    background: rgba(var(--v-theme-primary), .03);
    box-shadow: 0 4px 20px -12px rgba(0, 0, 0, .18);
  }
  :deep(.v-expansion-panel-title) { min-height: 28px; padding: 6px 10px; gap: 6px; justify-content: flex-start; }
  :deep(.v-expansion-panel-text__wrapper) { padding: 0; }
  &__section-icon { color: rgb(var(--v-theme-primary)); }
  &__heading { font-size: .75rem; font-weight: 500; line-height: 1.2; }
  &__chevron { opacity: .65; }
  &__count { padding: 2px 8px; border-radius: 7px; background: rgba(var(--v-theme-primary), .09); color: rgb(var(--v-theme-primary)); font-size: .6875rem; font-weight: 600; font-variant-numeric: tabular-nums; }
  &__body { border-top: 1px solid rgba(var(--v-theme-on-surface), .08); padding: 6px 10px; }
  &__body--standalone { border-top: 0; }
  &__preference-row { display: flex; align-items: center; gap: 10px; padding: 4px 0 8px; }
  &__label { flex-shrink: 0; font-size: .75rem; color: rgba(var(--v-theme-on-surface), .65); }
  &__preferred { max-width: 480px; min-width: 0; }
  &__preferred :deep(.v-select__selection-text) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  :deep(.v-field) { font-size: .75rem; --v-field-padding-start: 10px; --v-field-padding-end: 10px; }
  :deep(.v-field__input) { min-height: 28px; padding-block: 3px; line-height: 22px; }
  :deep(.v-field__append-inner) { padding-top: 0; align-items: center; }
  :deep(.v-field__outline) { --v-field-border-opacity: .18; }
  &__list { display: grid; gap: 5px; min-width: 0; padding: 0; margin: 0; list-style: none; }
  &__copy { display: flex; align-items: flex-start; gap: 8px; min-width: 0; padding: 8px 10px; border: 1px solid rgba(var(--v-theme-on-surface), .09); border-radius: 12px; background: rgba(var(--v-theme-on-surface), .018); }
  &__copy--preferred { border-color: rgba(var(--v-theme-primary), .32); background: rgba(var(--v-theme-primary), .045); }
  &__provider-icon { display: grid; place-items: center; flex-shrink: 0; width: 28px; height: 28px; border-radius: 7px; color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .08); }
  &__copy-content { flex: 1; min-width: 0; }
  &__copy-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; }
  &__filename { flex: 0 1 auto; min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .75rem; font-weight: 500; line-height: 1.5; }
  &__provider { font-size: .6875rem; color: rgba(var(--v-theme-on-surface), .55); }
  &__path { margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .6875rem; line-height: 1.5; color: rgba(var(--v-theme-on-surface), .6); user-select: text; }
  &__statuses { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 3px; font-size: .6875rem; line-height: 1.5; }
  &__availability, &__verification { display: inline-flex; align-items: center; gap: 5px; }
  &__status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  &__verification { color: rgba(var(--v-theme-on-surface), .6); }
  &__detach { flex-shrink: 0; color: rgba(var(--v-theme-on-surface), .5); }
  &__detach:hover { color: rgb(var(--v-theme-error)); background: rgba(var(--v-theme-error), .07); }
  &__add { margin-top: 8px; padding: 8px 10px; border: 1px dashed rgba(var(--v-theme-primary), .25); border-radius: 12px; }
  &__add-heading { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: .6875rem; font-weight: 600; }
  &__add-heading .v-icon { color: rgb(var(--v-theme-primary)); }
  &__add-fields { display: flex; align-items: center; gap: 10px; }
  &__add-fields > .v-input { min-width: 0; }
  &__attach { flex-shrink: 0; min-height: 30px; border-radius: 8px; font-size: .6875rem; letter-spacing: 0; }
  &__checking { margin: 10px 0 0; font-size: .75rem; color: rgba(var(--v-theme-on-surface), .65); }
  &__error { margin-top: 12px; font-size: .75rem; }
  &__search-row { position: relative; }
  &__help { position: absolute; inset-block-start: 4px; inset-inline-end: 4px; }
  &__search { margin-top: 8px; border-top: 1px solid rgba(var(--v-theme-on-surface), .08); font-size: .75rem; }
  &__search > summary { cursor: pointer; padding: 8px 0 2px; padding-inline-end: 40px; }
  &__search > summary .v-icon { margin-inline: 4px 6px; }
  &__search > summary:focus-visible { outline: none; }
  &__provider-icon .v-icon { font-size: 17px !important; }
  &__detach { width: 28px; height: 28px; }
  @media (max-width: 599px) {
    &__body { padding: 12px; }
    &__preference-row { align-items: stretch; flex-direction: column; gap: 8px; }
    &__preferred { max-width: none; }
    &__copy { padding: 12px; gap: 10px; }
    &__provider-icon { width: 30px; height: 34px; }
    &__add-fields { align-items: stretch; flex-direction: column; }
    &__detach { width: 32px; height: 36px; }
  }
}
</style>
