<template>
  <div class="mx-4">
    <v-alert
      class="mb-4"
      type="info"
      variant="tonal"
      density="comfortable"
      rounded="xl"
    >
      <div class="text-body-2 mb-2">
        {{ t('settings_labels.plugins.download_alert') }}
      </div>
      <v-btn
        color="primary"
        rounded="xl"
        variant="flat"
        size="small"
        prepend-icon="mdi-open-in-new"
        class="mb-3"
        @click="openPluginsSite"
      >
        {{ t('settings_labels.plugins.download_button') }}
      </v-btn>
      <div class="text-caption text-medium-emphasis mb-1">
        {{ t('settings_labels.plugins.install_how_title') }}
      </div>
      <ol class="plugins-install-steps text-caption text-medium-emphasis mb-0 pl-4">
        <li>{{ t('settings_labels.plugins.install_how_1') }}</li>
        <li>{{ t('settings_labels.plugins.install_how_2') }}</li>
        <li>{{ t('settings_labels.plugins.install_how_3') }}</li>
      </ol>
    </v-alert>

    <div class="d-flex flex-wrap ga-2 mb-4">
      <v-btn
        rounded="xl"
        variant="tonal"
        prepend-icon="mdi-zip-box-outline"
        :loading="installing"
        :disabled="installing"
        @click="installFromZip"
      >
        {{ t('settings_labels.plugins.install_zip') }}
      </v-btn>
    </div>

    <v-alert
      v-if="pluginsStore.installError"
      class="mb-4"
      type="error"
      variant="tonal"
      density="comfortable"
      rounded="xl"
      closable
      @click:close="pluginsStore.installError = null"
    >
      {{ pluginsStore.installError }}
    </v-alert>

    <div class="d-flex flex-wrap ga-2 mb-4 text-caption text-medium-emphasis">
      <span>{{ t('settings_labels.plugins.stats_installed', {count: pluginsStore.installedCount}) }}</span>
      <span>·</span>
      <span>{{ t('settings_labels.plugins.stats_enabled', {count: pluginsStore.enabledCount}) }}</span>
    </div>

    <div v-if="installedEntries.length" class="plugins-catalog">
      <div class="text-subtitle-2 plugins-catalog__heading">{{ t('settings_labels.plugins.section_installed') }}</div>
      <v-card
        v-for="entry in installedEntries"
        :key="entry.manifest.id"
        class="plugin-card"
        rounded="xl"
        variant="flat"
      >
        <v-card-item>
          <template #prepend>
            <v-avatar color="primary" variant="tonal" rounded="lg">
              <v-icon>{{ `mdi-${entry.manifest.icon || 'puzzle'}` }}</v-icon>
            </v-avatar>
          </template>

          <v-card-title class="text-body-1">
            {{ pluginName(entry) }}
            <v-chip
              class="ml-2"
              size="x-small"
              label
              :color="stateColor(entry.state)"
              variant="tonal"
            >
              {{ t(`settings_labels.plugins.state.${entry.state}`) }}
            </v-chip>
          </v-card-title>

          <v-card-subtitle class="text-wrap">
            {{ pluginDescription(entry) }}
          </v-card-subtitle>
        </v-card-item>

        <v-card-text class="pt-0">
          <div class="text-caption text-medium-emphasis mb-3">
            {{ t('settings_labels.plugins.version', {version: entry.manifest.version}) }}
            <span v-if="entry.manifest.author"> · {{ entry.manifest.author }}</span>
            <v-tooltip location="bottom">
              <template #activator="{ props: tipProps }">
                <span
                  v-bind="tipProps"
                  class="plugin-id-hint ml-1"
                >· ID</span>
              </template>
              <span>{{ entry.manifest.id }}</span>
            </v-tooltip>
          </div>

          <div
            v-if="entry.error"
            class="text-caption text-error mb-3"
          >
            {{ entry.error }}
          </div>

          <div class="text-caption text-medium-emphasis mb-1">
            {{ t('settings_labels.plugins.permissions_label') }}
          </div>
          <div class="d-flex flex-wrap ga-1 mb-4">
            <v-chip
              v-for="permission in entry.manifest.permissions"
              :key="permission"
              size="x-small"
              label
              variant="outlined"
            >
              {{ permissionLabel(permission) }}
            </v-chip>
          </div>

          <div class="d-flex align-center flex-wrap ga-2">
            <v-switch
              :model-value="entry.enabled"
              :disabled="entry.state === 'error' || togglingId === entry.manifest.id"
              :loading="togglingId === entry.manifest.id"
              :label="t('settings_labels.plugins.enabled')"
              color="primary"
              density="compact"
              hide-details
              @update:model-value="(value) => onToggle(entry.manifest.id, Boolean(value))"
            />
            <v-btn
              v-if="pluginSettingsLink(entry.manifest.id)"
              :to="pluginSettingsLink(entry.manifest.id)"
              prepend-icon="mdi-cog-outline" size="small" variant="text"
            >{{ t('settingsLayout.open_settings') }}</v-btn>
            <v-btn
              v-if="entry.source === 'user'"
              size="small"
              rounded="xl"
              variant="text"
              color="error"
              :disabled="uninstallingId === entry.manifest.id"
              :loading="uninstallingId === entry.manifest.id"
              @click="onUninstall(entry.manifest.id)"
            >
              {{ t('settings_labels.plugins.uninstall') }}
            </v-btn>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <div
      v-else
      class="settings-empty text-center py-10 px-4 mb-2"
    >
      <div class="settings-empty__icon mb-3" aria-hidden="true">
        <v-icon icon="mdi-puzzle-outline" size="28"/>
      </div>
      <div class="text-body-1 font-weight-medium mb-1">
        {{ t('settings_labels.plugins.empty_installed') }}
      </div>
      <div class="text-caption text-medium-emphasis">
        {{ t('settings_labels.plugins.empty_installed_hint') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {settingsPanelTab} from '@/utils/settingsNavigation'
import {usePluginsStore} from '@/stores/plugins'
import {showElectronOpenDialog} from '@/services/electronBridge'
import {openExternal} from '@/services/shellService'
import type {PluginCatalogEntry, PluginInstallState, PluginPermission} from '@shared/plugins'

const PLUGINS_SITE_URL = 'https://mediachips.app/plugins'

const {t, te} = useI18n()
const pluginsStore = usePluginsStore()
const togglingId = ref<string | null>(null)
const uninstallingId = ref<string | null>(null)
const installing = ref(false)

const installedEntries = computed(() =>
  pluginsStore.catalog.filter((entry) => entry.state !== 'planned'),
)

function pluginSettingsLink(pluginId: string) {
  const panel = pluginsStore.settingsPanels.find(panel => panel.pluginId === pluginId)
  return panel ? {path: '/settings', query: {tab: settingsPanelTab(panel), ...(panel.sectionId ? {section: panel.sectionId} : {})}} : undefined
}

function openPluginsSite() {
  void openExternal(PLUGINS_SITE_URL)
}

async function installFromZip() {
  installing.value = true
  pluginsStore.installError = null
  try {
    const result = await showElectronOpenDialog({
      properties: ['openFile'],
      filters: [{name: 'Plugin zip', extensions: ['zip']}],
    })
    if (!result || result.canceled || !result.filePaths?.[0]) return
    await pluginsStore.installFromPath(result.filePaths[0])
  } catch {
    // installError is set on the store
  } finally {
    installing.value = false
  }
}

function permissionLabel(permission: PluginPermission | string): string {
  const key = `settings_labels.plugins.permissions.${permission}`
  return te(key) ? t(key) : String(permission)
}

function pluginName(entry: PluginCatalogEntry): string {
  const key = `settings_labels.plugins.catalog.${entry.manifest.id}.name`
  return te(key) ? t(key) : entry.manifest.name
}

function pluginDescription(entry: PluginCatalogEntry): string {
  const key = `settings_labels.plugins.catalog.${entry.manifest.id}.description`
  if (te(key)) return t(key)
  return entry.manifest.description || ''
}

function stateColor(state: PluginInstallState): string {
  switch (state) {
    case 'enabled':
      return 'success'
    case 'disabled':
      return 'secondary'
    case 'error':
      return 'error'
    case 'installed':
      return 'info'
    case 'planned':
    default:
      return 'warning'
  }
}

async function onToggle(pluginId: string, enabled: boolean) {
  togglingId.value = pluginId
  try {
    await pluginsStore.setEnabled(pluginId, enabled)
  } finally {
    togglingId.value = null
  }
}

async function onUninstall(pluginId: string) {
  uninstallingId.value = pluginId
  try {
    await pluginsStore.uninstall(pluginId)
  } catch (error) {
    pluginsStore.installError = error instanceof Error ? error.message : String(error)
  } finally {
    uninstallingId.value = null
  }
}

onMounted(() => {
  pluginsStore.refresh()
})
</script>

<style scoped>
.plugins-catalog {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
  gap: 12px;
}

.plugins-catalog__heading { grid-column: 1 / -1; }

.plugin-card {
  min-width: 0;
  border: 1px solid rgba(var(--v-theme-on-surface), .08);
  background: rgba(var(--v-theme-surface), .55);
  border-radius: 16px !important;
}

.plugin-card :deep(.v-card-item) { padding: 14px 16px 10px; }
.plugin-card :deep(.v-card-text) { padding: 0 16px 14px; }
.plugin-card :deep(.v-card-title) { white-space: normal; font-size: .875rem !important; }
.plugin-card :deep(.v-card-subtitle) { font-size: .75rem; line-height: 1.5; }
.plugin-card :deep(.v-selection-control) { min-height: 36px; }


.plugin-id-hint {
  cursor: help;
  text-decoration: underline dotted;
  text-underline-offset: 2px;
  opacity: 0.75;
}

.plugins-install-steps {
  line-height: 1.5;
}

.settings-empty {
  border-radius: 22px;
  border: 1px dashed rgba(var(--v-theme-on-surface), 0.14);
  background:
    radial-gradient(80% 120% at 50% 0%, rgba(var(--v-theme-primary), 0.08), transparent 65%),
    rgba(var(--v-theme-on-surface), 0.02);
}

.settings-empty__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 18px;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
}
</style>
