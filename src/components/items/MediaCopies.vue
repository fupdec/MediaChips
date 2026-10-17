<template>
  <v-expansion-panels class="media-copies mb-3" variant="accordion">
    <v-expansion-panel :title="t('copies.title')" @group:selected="onExpanded">
      <v-expansion-panel-text>
        <p class="text-caption text-medium-emphasis mb-3">{{ t('copies.hint') }}</p>
        <v-progress-linear v-if="loading" indeterminate />
        <template v-if="data">
          <v-select
            :model-value="data.preferredId"
            :items="choices"
            :label="t('copies.preferred')"
            :disabled="pending"
            hide-details
            density="compact"
            @update:model-value="prefer"
          />
          <v-list density="compact" class="mt-2">
            <v-list-item v-for="copy in data.copies" :key="copy.id" :prepend-icon="copy.provider === 'local' ? 'mdi-harddisk' : copy.provider === 'nas' ? 'mdi-server-network' : 'mdi-cloud-outline'">
              <v-list-item-title class="text-body-2 text-break" style="white-space: normal">{{ copy.path }}</v-list-item-title>
              <v-list-item-subtitle>{{ t('sources.catalog.states.' + copy.availability) }} · {{ t(copy.verified ? 'copies.verified' : 'copies.unverified') }}</v-list-item-subtitle>
              <template #append>
                <v-btn v-if="copy.verified && data.copies.length > 1" icon="mdi-link-off" variant="text" size="small" :title="t('copies.detach')" :disabled="pending" @click="detach(copy.id)" />
              </template>
            </v-list-item>
          </v-list>
          <v-text-field v-model="localPath" :label="t('copies.local_path')" density="compact" hide-details :disabled="pending" @keydown.enter.prevent="attach" />
          <v-btn class="mt-2" size="small" variant="tonal" prepend-icon="mdi-file-check-outline" :loading="pending" :disabled="!localPath.trim() || pending" @click="attach">{{ t('copies.attach') }}</v-btn>
          <p v-if="checking" class="text-caption mt-2" role="status">{{ t('copies.checking') }}</p>
          <p class="text-caption text-medium-emphasis mt-2">{{ t('copies.merge_hint') }}</p>
        </template>
        <p v-if="error" role="alert" class="text-error text-caption mt-2">{{ error }}</p>
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {mediaCopiesApi as api} from '@/services/typedApi/mediaCopies'
import {useItemsListSync} from '@/composable/itemsListSync'
import type {MediaCopies} from '@shared/mediaCopies'
const props = defineProps<{mediaId: number}>()
const {t, te} = useI18n()
const app = useAppStore()
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
