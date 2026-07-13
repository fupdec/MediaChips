<template>
  <div class="mx-4">
    <settings-category-divider
      :title="t('settings_labels.plugins.title')"
      icon="puzzle"
    />

    <div class="text-caption text-medium-emphasis mb-4">
      {{ t('settings_labels.plugins.hint') }}
    </div>

    <div class="d-flex flex-wrap ga-2 mb-4 text-caption text-medium-emphasis">
      <span>{{ t('settings_labels.plugins.stats_planned', {count: pluginsStore.plannedCount}) }}</span>
      <span>·</span>
      <span>{{ t('settings_labels.plugins.stats_installed', {count: pluginsStore.installedCount}) }}</span>
      <span>·</span>
      <span>{{ t('settings_labels.plugins.stats_enabled', {count: pluginsStore.enabledCount}) }}</span>
    </div>

    <v-card
      v-for="entry in pluginsStore.catalog"
      :key="entry.manifest.id"
      class="mb-3 plugin-card"
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
            :disabled="entry.state === 'planned' || togglingId === entry.manifest.id"
            :loading="togglingId === entry.manifest.id"
            :label="t('settings_labels.plugins.enabled')"
            color="primary"
            density="compact"
            hide-details
            @update:model-value="(value) => onToggle(entry.manifest.id, Boolean(value))"
          />

          <span
            v-if="entry.state === 'planned'"
            class="text-caption text-medium-emphasis"
          >
            {{ t('settings_labels.plugins.coming_soon') }}
          </span>
        </div>
      </v-card-text>
    </v-card>

    <v-alert
      type="info"
      variant="tonal"
      density="comfortable"
      rounded="xl"
      class="mt-2 text-caption"
    >
      {{ t('settings_labels.plugins.install_later_hint') }}
    </v-alert>
  </div>
</template>

<script setup lang="ts">
import {onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import {usePluginsStore} from '@/stores/plugins'
import type {PluginCatalogEntry, PluginInstallState, PluginPermission} from '@shared/plugins'

const {t, te} = useI18n()
const pluginsStore = usePluginsStore()
const togglingId = ref<string | null>(null)

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

onMounted(() => {
  pluginsStore.refresh()
})
</script>

<style scoped>
.plugin-card {
  background-color: rgb(120 120 120 / 8%);
}

.plugin-id-hint {
  cursor: help;
  text-decoration: underline dotted;
  text-underline-offset: 2px;
  opacity: 0.75;
}
</style>
