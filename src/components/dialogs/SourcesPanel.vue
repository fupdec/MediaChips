<template>
  <section class="sources-panel" :aria-label="t('sources.title')">
    <v-tabs v-model="provider" :aria-label="t('sources.provider')" color="primary" class="mb-4">
      <v-tab value="drive" :disabled="busy" prepend-icon="mdi-google-drive">{{ t('drive.title') }}</v-tab>
      <v-tab value="nas" :disabled="busy" prepend-icon="mdi-server-network-outline">{{ t('nas.title') }}</v-tab>
    </v-tabs>
    <div :id="embedded ? undefined : 'settings-google-drive'" v-show="provider === 'drive'"><GoogleDriveSource ref="drive" @started="emit('started')" embedded :extensions="extensions" v-model:import-options="importOptions" /></div>
    <div :id="embedded ? undefined : 'settings-nas'" v-if="visitedNas" v-show="provider === 'nas'"><NasSources ref="nas" @started="emit('started')" embedded :extensions="extensions" v-model:import-options="importOptions" /></div>
    <MediaImportOptions v-if="!embedded" v-model="importOptions" :disabled="busy" />
    <div v-if="!embedded" class="d-flex flex-wrap justify-end ga-2 mt-3">
      <v-btn v-if="active?.canStop" variant="text" :disabled="active.stopping" @click="active.stop()">{{ t(active.stopping ? 'nas.stopping' : 'nas.stop_import') }}</v-btn>
      <v-btn color="primary" :disabled="!active?.canSubmit || busy" @click="active?.submit()">{{ t('nas.import_selected') }}</v-btn>
    </div>
  </section>
</template>
<script setup lang="ts">
import {computed, nextTick, ref, watch} from 'vue'
import {useRememberedTab} from '@/composable/useRememberedTab'
import {useI18n} from 'vue-i18n'
import GoogleDriveSource from './GoogleDriveSource.vue'
import NasSources from './NasSources.vue'
import MediaImportOptions from './MediaImportOptions.vue'
import {defaultRemoteImportOptions, type RemoteImportOptions} from '@/services/remoteImportOptions'
defineProps<{embedded?: boolean; extensions?: string}>()
const importOptions = defineModel<RemoteImportOptions>('importOptions', {default: defaultRemoteImportOptions})
const {t} = useI18n()
const emit = defineEmits<{started: []}>()
const {tab: provider, restore: restoreProviderTab} = useRememberedTab('mediachips.sources.provider', ['drive', 'nas'] as const, 'drive')
const visitedNas = ref(provider.value === 'nas')
watch(provider, value => { if (value === 'nas') visitedNas.value = true })
const drive = ref<InstanceType<typeof GoogleDriveSource>>()
const nas = ref<InstanceType<typeof NasSources>>()
const active = computed(() => provider.value === 'nas' ? nas.value : drive.value)
const busy = computed(() => !!drive.value?.busy || !!nas.value?.busy)
defineExpose({busy, canSubmit: computed(() => !!active.value?.canSubmit), selectionCount: computed(() => active.value?.selectionCount || 0),
  submit: () => active.value?.submit(), canStop: computed(() => !!active.value?.canStop), stopping: computed(() => !!active.value?.stopping), stop: () => active.value?.stop(),
  refresh: async () => {
    restoreProviderTab()
    await nextTick()
    await Promise.all([drive.value?.refresh(), nas.value?.refreshConnections()])
  }})
</script>
<style scoped>.sources-panel { min-width: 0; }</style>
