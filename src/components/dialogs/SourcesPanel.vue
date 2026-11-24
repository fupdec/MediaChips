<template>
  <section class="sources-panel" :aria-label="t('sources.title')">
    <Teleport :to="providerTabsTarget" :disabled="!providerTabsTarget">
      <SettingsSegmentedControl
        v-model="provider"
        :label="t('sources.provider')"
        :disabled="busy"
        :items="[
          {value: 'cloud', title: t('remote_sources_ui.cloud'), icon: 'mdi-cloud-outline'},
          {value: 'nas', title: t('nas.title'), icon: 'mdi-server-network-outline'},
          ...(mediaServersAvailable ? [{value: 'media-servers', title: t('sources.media_servers.title'), icon: 'mdi-server'}] : []),
        ]"
        :compact="!!providerTabsTarget"
        :class="{'mb-4': !providerTabsTarget}"
      />
    </Teleport>
    <div :id="embedded ? undefined : 'settings-google-drive'" v-show="provider === 'cloud'">
    <div class="sources-panel__cloud-picker source-connection-panel">
      <v-select :model-value="selectedAccount" :items="cloudAccounts" :placeholder="t('remote_sources_ui.new_account')" :aria-label="t('remote_sources_ui.cloud_account')" :disabled="busy" variant="outlined" rounded="lg" density="compact" hide-details @update:model-value="selectAccount">
        <template #selection="{item}">
          <v-icon :icon="item.raw.icon" size="20" class="mr-2" />
          <span class="text-truncate">{{ item.title }}</span>
          <span class="sources-panel__account-status" :class="{'sources-panel__account-status--connected': item.raw.connected}"><span class="sources-panel__status-light" aria-hidden="true" />{{ item.raw.connected ? t('remote_sources_ui.connected') : t('remote_sources_ui.disconnected') }}</span>
        </template>
        <template #item="{props: itemProps, item}">
          <v-list-item v-bind="itemProps" :subtitle="item.raw.subtitle">
            <template #prepend><v-icon :icon="item.raw.icon" size="22" /></template>
          </v-list-item>
        </template>
      </v-select>
      <div class="nas-sources__connection-actions">
        <v-btn size="small" variant="tonal" color="primary" rounded="lg" class="connection-action--primary" icon="mdi-plus" :disabled="busy" :aria-label="t('remote_sources_ui.add_account')" v-tooltip:top="t('remote_sources_ui.add_account')" @click="addAccount" />
        <div v-show="driveSelected" ref="accountActions" class="sources-panel__account-actions" />
        <template v-if="!driveSelected">
          <v-btn v-if="cloud?.account" size="small" variant="text" rounded="lg" icon="mdi-key-outline" :disabled="busy" :aria-label="t('remote_sources_ui.configure_account')" v-tooltip:top="t('remote_sources_ui.configure_account')" @click="cloud?.editAccount()" />
          <v-btn v-if="cloud?.account" size="small" variant="text" rounded="lg" icon="mdi-login" :disabled="busy" :aria-label="t('remote_sources_ui.connect_sign_in_again')" v-tooltip:top="t('remote_sources_ui.connect_sign_in_again')" @click="cloud?.connect()" />
          <v-btn size="small" variant="text" rounded="lg" icon="mdi-refresh" :disabled="busy" :aria-label="t('remote_sources_ui.refresh')" v-tooltip:top="t('remote_sources_ui.refresh')" @click="cloud?.refresh()" />
          <v-btn v-if="cloud?.account?.authenticated" size="small" variant="text" rounded="lg" class="connection-action--disconnect" icon="mdi-link-off" :disabled="busy" :aria-label="t('remote_sources_ui.disconnect')" v-tooltip:top="t('remote_sources_ui.disconnect')" @click="cloud?.logout()" />
          <v-btn v-if="cloud?.account" size="small" variant="text" rounded="lg" icon="mdi-delete-outline" :disabled="busy"
                 :aria-label="t('sources.remove_connection')" v-tooltip:top="t('sources.remove_connection')" @click="cloud?.removeAccount()" />
        </template>
      </div>
    </div>
    <div v-show="driveSelected"><GoogleDriveSource ref="drive" :actions-target="accountActions" unified @started="emit('started')" embedded :extensions="extensions" v-model:import-options="importOptions">
      <template v-if="$slots['browser-footer']" #browser-footer><slot name="browser-footer"/></template>
    </GoogleDriveSource></div>
    </div>
    <div :id="embedded ? undefined : 'settings-nas'" v-if="visitedNas" v-show="provider === 'nas'"><NasSources ref="nas" @started="emit('started')" embedded :extensions="extensions" v-model:import-options="importOptions">
      <template v-if="$slots['browser-footer']" #browser-footer><slot name="browser-footer"/></template>
    </NasSources></div>
    <CloudAccountsSource v-show="provider === 'cloud' && !driveSelected" unified ref="cloud" :extensions="extensions" :import-options="importOptions" @started="emit('started')">
      <template #browser-footer="{folderBrowser}">
        <slot name="browser-footer"/>
        <MediaImportOptions v-model="importOptions" :disabled="busy" :folder-browser="folderBrowser" />
      </template>
    </CloudAccountsSource>
    <MediaServerSources v-if="mediaServersAvailable && provider === 'media-servers'" ref="mediaServers" />
    <div v-if="!embedded" class="d-flex flex-wrap justify-end ga-2 mt-3">
      <v-btn v-if="provider !== 'media-servers' && active?.canStop" variant="text" :disabled="active.stopping" @click="active.stop()">{{ t(active.stopping ? 'nas.stopping' : 'nas.stop_import') }}</v-btn>
      <v-btn color="primary" :disabled="!activeImport?.canSubmit || busy" @click="activeImport?.submit()">{{ t('nas.import_selected') }}</v-btn>
    </div>
  </section>
</template>
<script setup lang="ts">
import {computed, nextTick, ref, watch} from 'vue'
import {useRoute} from 'vue-router'
import {isSfwBuild} from '@shared/buildFlags'
import MediaServerSources from './MediaServerSources.vue'
import {useRememberedTab} from '@/composable/useRememberedTab'
import {useI18n} from 'vue-i18n'
import CloudAccountsSource from './CloudAccountsSource.vue'
import GoogleDriveSource from './GoogleDriveSource.vue'
import NasSources from './NasSources.vue'
import MediaImportOptions from './MediaImportOptions.vue'
import SettingsSegmentedControl from '@/components/ui/SettingsSegmentedControl.vue'
import {defaultRemoteImportOptions, type RemoteImportOptions} from '@/services/remoteImportOptions'
defineProps<{embedded?: boolean; extensions?: string; providerTabsTarget?: HTMLElement}>()
const importOptions = defineModel<RemoteImportOptions>('importOptions', {default: defaultRemoteImportOptions})
const {t} = useI18n()
const emit = defineEmits<{started: []}>()
const mediaServersAvailable = !isSfwBuild()
const {tab: provider, restore: restoreProviderTab} = useRememberedTab<'drive' | 'nas' | 'cloud' | 'media-servers'>(
  'mediachips.sources.provider', mediaServersAvailable ? ['drive', 'nas', 'cloud', 'media-servers'] : ['drive', 'nas', 'cloud'], 'drive',
)
// Preserve old saved tabs while presenting a single cloud tab.
if (provider.value === 'drive') provider.value = 'cloud'
watch(provider, value => { if (value === 'drive') { driveSelected.value = true; provider.value = 'cloud' } }, {flush: 'sync'})
const cloud = ref<InstanceType<typeof CloudAccountsSource>>()
const route = useRoute()
watch(() => route.query.section, section => {
  if (section === 'nas' || section === 'settings-nas') provider.value = 'nas'
  if (section === 'google_drive' || section === 'settings-google-drive') {
    driveSelected.value = true
    provider.value = 'cloud'
  }
}, {immediate: false})
const visitedNas = ref(provider.value === 'nas')
watch(provider, value => { if (value === 'nas') visitedNas.value = true })
const drive = ref<InstanceType<typeof GoogleDriveSource>>()
const nas = ref<InstanceType<typeof NasSources>>()
const accountActions = ref<HTMLElement>()
const driveSelected = ref(true)
if (route.query.section === 'nas' || route.query.section === 'settings-nas') {
  provider.value = 'nas'
  visitedNas.value = true
} else if (route.query.section === 'google_drive' || route.query.section === 'settings-google-drive') {
  provider.value = 'cloud'
}
const selectedAccount = computed(() => driveSelected.value ? 'drive' : cloud.value?.accountId)
const serviceStyle = (service: string) => service === 'dropbox' ? {icon: 'mdi-dropbox', color: '#0061ff', title: 'Dropbox'}
  : service === 'onedrive' ? {icon: 'mdi-microsoft-onedrive', color: '#0078d4', title: 'OneDrive'}
  : {icon: 'mdi-google-drive', color: '#34a853', title: 'Google Drive'}
const cloudAccounts = computed(() => [
  {value: 'drive', title: 'Google Drive', connected: !!drive.value?.status?.authenticated, icon: 'mdi-google-drive', color: '#34a853',
    subtitle: t('remote_sources_ui.main_connection') + ' · ' + t(drive.value?.status?.authenticated ? 'remote_sources_ui.connected' : 'remote_sources_ui.disconnected')},
  ...(cloud.value?.accounts || []).map(account => ({value: account.id, title: account.name, connected: account.authenticated,
    ...{icon: serviceStyle(account.provider).icon, color: serviceStyle(account.provider).color},
    subtitle: serviceStyle(account.provider).title + ' · ' + t(account.authenticated ? 'remote_sources_ui.connected' : 'remote_sources_ui.disconnected')
      + (account.provider === 'gdrive' ? ' · ' + t('remote_sources_ui.read_only') : '')})),
])
// The panel used to open on the main Google Drive even when it is not connected
// and another account is. Remember the last choice and otherwise prefer a connected account.
const ACCOUNT_KEY = 'mediachips.sources.account'
const readSavedAccount = () => { try { return localStorage.getItem(ACCOUNT_KEY) || '' } catch { return '' } }
const saveAccount = (id: string) => { try { localStorage.setItem(ACCOUNT_KEY, id) } catch { /* the choice just isn't remembered */ } }
let initialAccountChosen = route.query.section === 'google_drive' || route.query.section === 'settings-google-drive'
async function selectAccount(id: string) {
  initialAccountChosen = true
  saveAccount(id)
  driveSelected.value = id === 'drive'
  if (!driveSelected.value) await cloud.value?.selectAccount(id)
}
watch([() => drive.value?.status, () => cloud.value?.accounts, () => cloud.value?.busy], async () => {
  if (initialAccountChosen || cloud.value?.busy) return
  const status = drive.value?.status
  const accounts = cloud.value?.accounts ?? []
  if (!status || !accounts.length) return
  initialAccountChosen = true
  const saved = readSavedAccount()
  let target = ''
  if (saved === 'drive' || accounts.some(account => account.id === saved)) target = saved
  else if (!status.authenticated) target = [...accounts].reverse().find(account => account.authenticated)?.id ?? ''
  if (target && target !== 'drive') {
    driveSelected.value = false
    await cloud.value?.selectAccount(target)
  }
}, {flush: 'post'})
watch(() => cloud.value?.accountId, id => { if (!id && !cloud.value?.busy) driveSelected.value = true }, {flush: 'post'})
function addAccount() { cloud.value?.addAccount() }
let accountBeforeEditing: string | undefined
watch(() => cloud.value?.editing, (editing, wasEditing) => {
  if (editing) { accountBeforeEditing = cloud.value?.accountId; return }
  if (!wasEditing) return
  if (cloud.value?.accountId && cloud.value.accountId !== accountBeforeEditing) {
    initialAccountChosen = true
    saveAccount(cloud.value.accountId)
    driveSelected.value = false
  } else if (!cloudAccounts.value.some(account => account.value === selectedAccount.value)) {
    const fallback = cloudAccounts.value[0]
    if (fallback) void selectAccount(fallback.value)
  }
})
const mediaServers = ref<InstanceType<typeof MediaServerSources>>()
const active = computed(() => provider.value === 'nas' ? nas.value : driveSelected.value ? drive.value : cloud.value)
const activeImport = computed(() => provider.value === 'media-servers' ? mediaServers.value : active.value)
const busy = computed(() => !!cloud.value?.busy || !!drive.value?.busy || !!nas.value?.busy || !!mediaServers.value?.busy)
defineExpose({busy, canSubmit: computed(() => !!activeImport.value?.canSubmit), selectionCount: computed(() => provider.value === 'media-servers' ? 0 : active.value?.selectionCount || 0),
  submit: () => activeImport.value?.submit(), canStop: computed(() => !!active.value?.canStop), stopping: computed(() => !!active.value?.stopping), stop: () => active.value?.stop(),
  refresh: async () => {
    restoreProviderTab()
    await nextTick()
    await Promise.all([drive.value?.refresh(), nas.value?.refreshConnections(), cloud.value?.refresh()])
  }})
</script>
<style scoped>.sources-panel { min-width: 0; }
.sources-panel__cloud-picker { display: flex; align-items: center; gap: 12px; }
.sources-panel :deep(.google-drive-source > :first-child),
.sources-panel :deep(.cloud-accounts-source > :first-child) { margin-top: 16px; }
.sources-panel__cloud-picker :deep(.v-select) { min-width: 0; }
.sources-panel__cloud-picker :deep(.v-field) { border-radius: 12px !important; }
.sources-panel__cloud-picker :deep(.v-select__selection) { width: 100%; max-width: 100%; flex-wrap: nowrap; }
.sources-panel__account-status { display: inline-flex; align-items: center; gap: 7px; margin-left: auto; padding-left: 12px; font-size: 12px; white-space: nowrap; color: rgba(var(--v-theme-on-surface), .55); }
.sources-panel__status-light { width: 7px; height: 7px; flex-shrink: 0; border-radius: 50%; background: rgba(var(--v-theme-on-surface), .35); }
.sources-panel__account-status--connected .sources-panel__status-light { background: rgb(var(--v-theme-success)); box-shadow: 0 0 5px rgba(var(--v-theme-success), .4); }
.sources-panel__account-actions { flex-shrink: 0; }
.sources-panel__account-actions { display: contents; }
.sources-panel__account-actions :deep(.google-drive-source__connection-bar),
.sources-panel__account-actions :deep(.google-drive-source__connection-actions) { display: contents; }
@media (max-width: 600px) { .sources-panel__cloud-picker { flex-wrap: wrap; } .sources-panel__cloud-picker :deep(.v-select) { flex-basis: 100%; } }</style>

<style scoped lang="scss" src="@/assets/styles/source-connection-actions.scss"></style>
