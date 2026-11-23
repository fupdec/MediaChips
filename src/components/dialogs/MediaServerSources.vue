<template>
  <div class="media-server-sources">
    <template v-if="selectedServer">
      <component :is="selectedServer.component" :key="selectedServer.value" ref="importer" embedded
                 @imported="refreshLibrary">
        <template #server-selector>
          <v-select v-model="server" :items="availableServers" :label="t('sources.media_servers.server')"
                    :disabled="busy" variant="outlined" density="compact" rounded="lg" hide-details />
        </template>
      </component>
    </template>
    <v-alert v-else type="info" variant="tonal" density="compact" rounded="lg">
      {{ t('sources.media_servers.enable_plugins') }}
    </v-alert>
    <aside class="media-server-sources__notes text-caption">
      <p v-if="selectedServer">
        <v-icon icon="mdi-folder-play-outline" size="16" aria-hidden="true" />
        <span>{{ t('sources.media_servers.path_hint') }}</span>
      </p>
      <p>
        <v-icon icon="mdi-database-outline" size="16" aria-hidden="true" />
        <span>{{ t('sources.media_servers.stash_hint') }}</span>
      </p>
    </aside>
  </div>
</template>

<script setup lang="ts">
import {computed, defineAsyncComponent, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {BUILTIN_PLUGIN_IDS} from '@shared/plugins'
import {usePluginsStore} from '@/stores/plugins'
import {useEventBus} from '@/utils/eventBus'
import {useFreeLibraryGate} from '@/composable/useFreeLibraryGate'
import {useProFeatureGate} from '@/composable/useProFeatureGate'
import {useItemsListSync} from '@/composable/itemsListSync'
import {PLEX_COMPONENT_KEYS, plexHostComponentMap} from '@/plugins/plex/hostBridge'
import {JELLYFIN_COMPONENT_KEYS, jellyfinHostComponentMap} from '@/plugins/jellyfin/hostBridge'
import {EMBY_COMPONENT_KEYS, embyHostComponentMap} from '@/plugins/emby/hostBridge'

const {t} = useI18n()
const plugins = usePluginsStore()
const gate = useFreeLibraryGate()
const proGate = useProFeatureGate()
const sync = useItemsListSync()
const events = useEventBus()
const servers = [
  {value: BUILTIN_PLUGIN_IDS.plex, title: 'Plex', component: defineAsyncComponent(plexHostComponentMap[PLEX_COMPONENT_KEYS.settingsImportPlex])},
  {value: BUILTIN_PLUGIN_IDS.jellyfin, title: 'Jellyfin', component: defineAsyncComponent(jellyfinHostComponentMap[JELLYFIN_COMPONENT_KEYS.settingsImportJellyfin])},
  {value: BUILTIN_PLUGIN_IDS.emby, title: 'Emby', component: defineAsyncComponent(embyHostComponentMap[EMBY_COMPONENT_KEYS.settingsImportEmby])},
]
const availableServers = computed(() => servers.filter(({value}) => plugins.enabledPluginIds.includes(value)))
const server = ref<string>()
watch(availableServers, items => {
  if (!items.some(item => item.value === server.value)) server.value = items[0]?.value
}, {immediate: true})
const selectedServer = computed(() => availableServers.value.find(item => item.value === server.value))
const importer = ref<{busy: boolean; canSubmit: boolean; submit: () => Promise<void>}>()
const submitting = ref(false)
const busy = computed(() => submitting.value || !!importer.value?.busy)
const canSubmit = computed(() => !busy.value && !!importer.value?.canSubmit)

async function submit() {
  const current = importer.value
  if (!current || !canSubmit.value) return
  if (!proGate.requirePro('media_servers')) return
  submitting.value = true
  try {
    if (await gate.ensureCanImportMedia() && importer.value === current) await current.submit()
  } finally {
    submitting.value = false
  }
}

function refreshLibrary() {
  sync.getItemsFromDb({ids: [], type: 'media'})
  events.emit('library:nav-counts-changed')
  void gate.refreshLibraryCount()
}

defineExpose({busy, canSubmit, submit})
</script>

<style scoped>
.media-server-sources__notes {
  display: grid;
  gap: 6px;
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), .04);
  color: rgba(var(--v-theme-on-surface), .72);
}
.media-server-sources__notes p {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.media-server-sources__notes .v-icon { color: rgb(var(--v-theme-primary)); }
.media-server-sources :deep(.integration-settings__form) {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.media-server-sources :deep(.plugin-scraper-settings__block) {
  padding: 0;
  border: 0;
  background: transparent;
}
.media-server-sources :deep(.plugin-scraper-settings__block:first-child) {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border: 1px solid rgba(var(--v-theme-primary), .22);
  border-radius: 12px;
  background: rgba(var(--v-theme-primary), .07);
}
.media-server-sources :deep(.integration-settings__connection) {
  display: grid;
  grid-template-columns: minmax(110px, 1fr) minmax(0, 2fr) minmax(0, 1.5fr);
  align-items: center;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
}
@media (max-width: 600px) {
  .media-server-sources :deep(.integration-settings__connection) { grid-template-columns: minmax(0, 1fr); }
  .media-server-sources :deep(.plugin-scraper-settings__block:first-child) { align-items: flex-end; }
}
</style>
