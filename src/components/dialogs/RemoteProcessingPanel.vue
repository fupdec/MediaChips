<template>
  <v-expansion-panels class="mt-4 processing-panel" variant="accordion" flat>
    <v-expansion-panel rounded="lg">
      <v-expansion-panel-title>
        <span class="processing-panel__icon"><v-icon icon="mdi-cloud-cog-outline" size="22" /></span>
        <span class="processing-panel__heading">{{ tr('Фоновая обработка на сервере', 'Background server processing') }}</span>
      </v-expansion-panel-title>
      <v-expansion-panel-text>
        <v-alert v-if="error" type="error" class="mb-3">{{ error }}</v-alert>
        <p class="processing-panel__description">{{ tr('Обработка облачного видео. Результаты хранятся 30 минут; очередь ограничена, задачу можно отменить.', 'Process cloud video. Results are kept for 30 minutes; the queue is bounded and jobs can be cancelled.') }}</p>
        <div class="processing-panel__meta">
          <span><v-icon icon="mdi-clock-outline" size="15" />{{ tr('Хранение результатов · 30 мин', 'Results kept · 30 min') }}</span>
          <span><v-icon icon="mdi-close-circle-outline" size="15" />{{ tr('Можно отменить', 'Cancellable') }}</span>
        </div>
        <div class="processing-panel__fields">
          <v-number-input control-variant="hidden" v-model="mediaId" :label="tr('ID импортированного медиа', 'Imported media ID')" :min="1" :disabled="busy" density="comfortable" variant="outlined" hide-details="auto" persistent-placeholder />
          <v-select v-model="kind" :items="kinds" item-title="title" item-value="value" :label="tr('Задача', 'Task')" :disabled="busy" density="comfortable" variant="outlined" hide-details="auto" persistent-placeholder />
          <v-number-input control-variant="hidden" v-if="kind === 'frame'" v-model="seconds" :min="0" :max="86400" :disabled="busy" :label="tr('Время кадра (секунды)', 'Frame time (seconds)')" density="comfortable" variant="outlined" hide-details="auto" persistent-placeholder />
          <v-number-input control-variant="hidden" v-if="kind === 'storyboard'" v-model="intervalSeconds" :min="1" :max="3600" :disabled="busy" :label="tr('Интервал кадров (секунды)', 'Frame interval (seconds)')" density="comfortable" variant="outlined" hide-details="auto" persistent-placeholder />
        </div>
        <div class="processing-panel__actions"><v-btn color="primary" variant="flat" prepend-icon="mdi-play" :loading="busy" :disabled="busy || !mediaId" @click="submit">{{ tr('Запустить', 'Start') }}</v-btn><v-btn variant="text" prepend-icon="mdi-refresh" :disabled="busy" @click="refresh">{{ tr('Обновить задачи', 'Refresh jobs') }}</v-btn></div>
        <v-list v-if="jobs.length" density="compact" class="processing-panel__jobs">
          <v-list-item v-for="job in jobs" :key="job.id" :title="`${job.mediaId} · ${job.kind}`" :subtitle="job.error || status(job.state)">
            <template #append>
              <v-btn v-if="['queued','running'].includes(job.state)" variant="text" @click="cancel(job.id)">{{ tr('Отменить', 'Cancel') }}</v-btn>
              <v-btn v-if="job.resultUrl" :href="resultUrl(job.resultUrl)" target="_blank" rel="noopener" variant="text">{{ tr('Открыть', 'Open') }}</v-btn>
              <v-btn v-if="!['queued','running'].includes(job.state)" variant="text" @click="remove(job.id)">{{ tr('Удалить', 'Delete') }}</v-btn>
            </template>
          </v-list-item>
        </v-list>
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {apiClient, buildApiUrl} from '@/services/apiClient'
import {getAuthToken} from '@/services/authSession'
import type {RemoteProcessingJob} from '@shared/remoteProcessing'
const mediaId = defineModel<number>('mediaId')
const {locale} = useI18n(), tr = (ru: string, en: string) => locale.value.startsWith('ru') ? ru : en
const kind = ref<'transcode' | 'storyboard' | 'frame'>('storyboard'), seconds = ref(0), intervalSeconds = ref(10)
const kinds = computed(() => [{title: tr('Перекодирование MP4', 'Transcode MP4'), value: 'transcode'}, {title: 'Storyboard', value: 'storyboard'}, {title: tr('Извлечение кадра', 'Extract frame'), value: 'frame'}])
const jobs = ref<RemoteProcessingJob[]>([]), error = ref(''), busy = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined, disposed = false
const status = (value: string) => ({queued: tr('В очереди', 'Queued'), running: tr('Выполняется', 'Running'), completed: tr('Готово', 'Completed'), failed: tr('Ошибка', 'Failed'), cancelled: tr('Отменено', 'Cancelled')})[value] || value
async function refresh() {
  clearTimeout(timer)
  try { const response = await apiClient.get<RemoteProcessingJob[]>('/api/remote-processing/jobs'); if (disposed) return; jobs.value = response.data
    if (jobs.value.some(j => ['queued', 'running'].includes(j.state))) timer = setTimeout(refresh, 3000)
  } catch { if (!disposed) error.value = tr('Не удалось обновить задачи.', 'Could not refresh jobs.') }
}
async function action(fn: () => Promise<unknown>) { busy.value = true; error.value = ''; try { await fn(); await refresh() } catch { error.value = tr('Не удалось выполнить задачу. Проверьте лимиты и подключение.', 'Request failed. Check processing limits and the connection.') } finally { busy.value = false } }
async function submit() { await action(() => apiClient.post('/api/remote-processing/jobs', {mediaId: mediaId.value, kind: kind.value, seconds: seconds.value, intervalSeconds: intervalSeconds.value})) }
async function cancel(id: string) { await action(() => apiClient.post(`/api/remote-processing/jobs/${id}/cancel`)) }
async function remove(id: string) { await action(() => apiClient.delete(`/api/remote-processing/jobs/${id}`)) }
function resultUrl(url: string) { const token = getAuthToken(); return buildApiUrl(url) + (token ? `?token=${encodeURIComponent(token)}` : '') }
onBeforeUnmount(() => { disposed = true; clearTimeout(timer) })
</script>

<style scoped>
.processing-panel {
  border: 1px solid rgba(var(--v-theme-on-surface), .1);
  border-radius: 16px;
  overflow: hidden;
}
.processing-panel :deep(.v-expansion-panel-title) {
  min-height: 72px;
  padding: 16px 20px;
  gap: 12px;
}
.processing-panel__icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 12px;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), .1);
}
.processing-panel__heading { font-size: 14px; font-weight: 600; line-height: 1.5; }
.processing-panel :deep(.v-expansion-panel-text__wrapper) { padding: 0 20px 20px; }
.processing-panel__description {
  font-size: 13px;
  line-height: 1.65;
  color: rgba(var(--v-theme-on-surface), .65);
  margin-bottom: 12px;
}
.processing-panel__meta { display: flex; flex-wrap: wrap; gap: 8px 16px; margin-bottom: 24px; }
.processing-panel__meta span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), .6);
}
.processing-panel__fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px 12px; }
.processing-panel__fields > * { min-width: 0; }
.processing-panel__fields :deep(.v-field) { border-radius: 10px; font-size: 14px; }
.processing-panel__actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
.processing-panel__actions :deep(.v-btn) { border-radius: 10px; text-transform: none; letter-spacing: 0; }
.processing-panel__jobs { margin-top: 20px; border-top: 1px solid rgba(var(--v-theme-on-surface), .1); background: transparent; }
@media (max-width: 700px) {
  .processing-panel__fields { grid-template-columns: minmax(0, 1fr); }
  .processing-panel :deep(.v-expansion-panel-title) { padding: 16px; }
  .processing-panel :deep(.v-expansion-panel-text__wrapper) { padding: 0 16px 16px; }
}
</style>
