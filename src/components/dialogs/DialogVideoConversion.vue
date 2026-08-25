<template>
  <v-dialog :model-value="dialogs.videoConversion.show" width="760" persistent>
    <DialogBrowseFolder
      v-if="showBrowseDialog"
      v-model="showBrowseDialog"
      :initial-path="destination"
      :z-index="2700"
      persistent
      @confirm="onDestinationSelected"
    />
    <v-card rounded="xl">
      <DialogHeader
        :header="t('video_conversion.title')"
        icon="video-outline"
        :buttons="headerButtons"
        closable
        @close="close"
      />
      <v-card-text>
        <v-select v-model="codec" :label="t('video_conversion.codec')" :items="codecItems" item-title="title" item-value="value" />
        <v-select v-model="resolution" :label="t('video_conversion.resolution')" :items="resolutionItems" item-title="title" item-value="value" />
        <v-select v-model="quality" :label="t('video_conversion.quality')" :items="qualityItems" item-title="title" item-value="value" />
        <v-text-field
          v-model="destination"
          :label="t('video_conversion.destination')"
          :hint="t('video_conversion.destination_hint')"
          persistent-hint
        >
          <template #append-inner>
            <v-btn
              icon="mdi-folder-search-outline"
              variant="text"
              size="small"
              :aria-label="t('video_conversion.choose_folder')"
              :title="t('video_conversion.choose_folder')"
              @click.stop="openDestinationBrowser"
            />
          </template>
        </v-text-field>
        <v-checkbox v-model="deleteOriginal" :label="t('video_conversion.delete_original')" color="primary" />
        <div v-if="!job && preflightText" class="text-caption text-medium-emphasis mb-3">{{ preflightText }}</div>
        <template v-if="job">
          <v-progress-linear :model-value="overallProgress" color="primary" class="mb-2" />
          <div class="text-caption text-medium-emphasis mb-1">{{ summaryText }}</div>
          <div v-if="job.items.length === 1 && sizeText" class="text-caption text-medium-emphasis mb-3">{{ sizeText }}</div>
          <v-list density="compact">
            <v-list-item v-for="entry in job.items" :key="`${entry.id}-${entry.outputPath || entry.status}`" :title="entry.path">
              <template #subtitle>
                <span>{{ statusLabel(entry) }}</span>
                <span v-if="entry.error">: {{ entry.error }}</span>
                <span v-if="entry.warning"> — {{ entry.warning }}</span>
              </template>
              <template #append>
                <v-chip v-if="entry.fallback" size="small" color="warning">{{ t('video_conversion.fallback') }}</v-chip>
              </template>
            </v-list-item>
          </v-list>
        </template>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import DialogBrowseFolder from '@/components/dialogs/DialogBrowseFolder.vue'
import {useDialogsStore} from '@/stores/dialogs'
import {useSettingsStore} from '@/stores/settings'
import {setOption} from '@/services/settingsService'
import {typedApi} from '@/services/typedApi'
import {useNotificationsStore} from '@/stores/notifications'
import {useItemsListSync} from '@/composable/itemsListSync'
import type {ConvertVideosPayload, ConversionJobResponse} from '@shared/api/payloads'

type ConversionEntry = ConversionJobResponse['items'][number]
type Job = ConversionJobResponse

const {t} = useI18n()
const dialogs = useDialogsStore()
const settings = useSettingsStore()
const notifications = useNotificationsStore()
const listSync = useItemsListSync()
const codec = ref<ConvertVideosPayload['options']['codec']>((settings.conversionCodec || 'auto') as ConvertVideosPayload['options']['codec'])
const resolution = ref<ConvertVideosPayload['options']['resolution']>((settings.conversionResolution || '1080') as ConvertVideosPayload['options']['resolution'])
const quality = ref<ConvertVideosPayload['options']['quality']>((settings.conversionQuality || 'balanced') as ConvertVideosPayload['options']['quality'])
const destination = ref(settings.conversionDestination || '')
const deleteOriginal = ref(settings.conversionDeleteOriginal === '1')
const showBrowseDialog = ref(false)
const job = ref<Job | null>(null)
const starting = ref(false)
const testing = ref(false)
const cancelling = ref(false)
const timer = ref<ReturnType<typeof setInterval> | null>(null)
const headerButtons = computed(() => {
  if (job.value && !finished.value) return [{icon: 'stop-circle-outline', text: t('video_conversion.cancel'), color: 'warning', outlined: true, disabled: cancelling.value, action: cancel}]
  if (!job.value) return [
    {icon: 'flask-outline', text: t('video_conversion.test_segment'), color: 'secondary', outlined: true, disabled: starting.value || testing.value || !destination.value || dialogs.videoConversion.items.length !== 1, action: createTestSegment},
    {icon: 'play', text: t('video_conversion.start'), color: 'primary', disabled: starting.value || testing.value || !destination.value || !dialogs.videoConversion.items.length, action: start},
  ]
  return [{icon: 'check', text: t('common.close'), color: 'primary', action: close}]
})
const codecItems = [
  {title: t('video_conversion.codec_auto'), value: 'auto'},
  {title: t('video_conversion.codec_hevc'), value: 'hevc'},
  {title: t('video_conversion.codec_h264'), value: 'h264'},
]
const resolutionItems = [
  {title: t('video_conversion.original'), value: 'original'},
  {title: t('video_conversion.4k'), value: 2160},
  {title: '1080p', value: 1080},
  {title: '720p', value: 720},
  {title: '480p', value: 480},
]
const qualityItems = [
  {title: t('video_conversion.quality_economy'), value: 'economy'},
  {title: t('video_conversion.quality_balanced'), value: 'balanced'},
  {title: t('video_conversion.quality_high'), value: 'quality'},
]
const finished = computed(() => Boolean(job.value && ['done', 'cancelled'].includes(job.value.status)))
const preflightText = computed(() => {
  const item = dialogs.videoConversion.items.length === 1 ? dialogs.videoConversion.items[0] : null
  const sourceSize = Number(item?.filesize)
  if (!item || !Number.isFinite(sourceSize) || sourceSize <= 0) return ''
  const sourceHeight = Number(item.height) || 0
  const targetHeight = resolution.value === 'original' ? sourceHeight : Math.min(sourceHeight || Number(resolution.value), Number(resolution.value))
  const dimensionFactor = sourceHeight > 0 ? Math.min(1, (targetHeight / sourceHeight) ** 1.5) : 1
  const selectedCodec = codec.value === 'hevc' ? 'hevc' : 'h264'
  const codecFactor = selectedCodec === 'hevc' ? 0.62 : 0.82
  const qualityFactor = {economy: 0.72, balanced: 1, quality: 1.35}[quality.value]
  const estimatedBytes = Math.max(1, Math.round(sourceSize * dimensionFactor * codecFactor * qualityFactor))
  const speedFactor = {economy: 1.5, balanced: 0.8, quality: 0.45}[quality.value] * (dimensionFactor < 1 ? 1.25 : 1)
  const estimatedSeconds = Math.max(1, Math.round((Number(item.duration) || 0) / speedFactor))
  return `${t('video_conversion.estimated_size')}: ${formatBytes(estimatedBytes)} · ${t('video_conversion.estimated_time')}: ${formatEta(estimatedSeconds)}`
})
const overallProgress = computed(() => {
  const items = job.value?.items || []
  return items.length ? items.reduce((sum, item) => sum + (item.progress || 0), 0) / items.length : 0
})
const counts = computed(() => {
  const items = job.value?.items || []
  return {
    done: items.filter((item) => item.status === 'done').length,
    errors: items.filter((item) => item.status === 'error').length,
    fallback: items.filter((item) => item.fallback).length,
    warnings: items.filter((item) => item.warning).length,
  }
})
const currentEta = computed(() => job.value?.items.find((item) => item.status === 'running')?.etaSeconds)
const sizeText = computed(() => {
  const entry = job.value?.items[0]
  if (!entry) return ''
  const bytes = entry.outputSizeBytes ?? entry.estimatedSizeBytes
  if (!bytes) return ''
  const label = entry.outputSizeBytes ? t('video_conversion.result_size') : t('video_conversion.estimated_size')
  return `${label}: ${formatBytes(bytes)}`
})
function formatBytes(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1 }
  return `${value >= 100 ? Math.round(value) : value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[unit]}`
}
const summaryText = computed(() => {
  const text = t('video_conversion.summary', {done: counts.value.done, total: job.value?.items.length || 0, errors: counts.value.errors, fallback: counts.value.fallback, warnings: counts.value.warnings})
  return currentEta.value == null ? text : `${text} · ${t('video_conversion.eta_label', {eta: formatEta(currentEta.value)})}`
})
function statusLabel(entry: ConversionEntry) { return t(`video_conversion.status_${entry.status}`, entry.status) }
function formatEta(seconds: number) {
  const value = Math.max(0, Math.round(seconds))
  if (value < 60) return t('video_conversion.eta_seconds', {seconds: value})
  const minutes = Math.floor(value / 60)
  const remaining = value % 60
  return t('video_conversion.eta_minutes', {minutes, seconds: remaining})
}
function openDestinationBrowser() {
  // Defer opening so the parent dialog does not treat the nested picker as an outside click.
  window.setTimeout(() => { showBrowseDialog.value = true }, 0)
}
function onDestinationSelected(paths: string[]) {
  if (paths[0]) destination.value = paths[0]
}
async function createTestSegment() {
  if (testing.value || dialogs.videoConversion.items.length !== 1 || !destination.value) return
  const item = dialogs.videoConversion.items[0]
  testing.value = true
  try {
    const response = await typedApi.createTestVideoSegment({id: Number(item.id), path: String(item.path), destination: destination.value})
    notifications.setNotification({type: 'success', title: t('video_conversion.title'), text: `${t('video_conversion.test_segment_created')}: ${response.data.outputPath}`})
  } catch (error) {
    notifications.setNotification({type: 'error', title: t('video_conversion.title'), text: error instanceof Error ? error.message : String(error)})
  } finally { testing.value = false }
}

async function start() {
  if (starting.value) return
  starting.value = true
  try {
    await Promise.all([
      setOption(String(codec.value), 'conversionCodec'),
      setOption(String(resolution.value), 'conversionResolution'),
      setOption(String(quality.value), 'conversionQuality'),
      setOption(destination.value, 'conversionDestination'),
      setOption(deleteOriginal.value ? '1' : '0', 'conversionDeleteOriginal'),
    ])
    const detectedCodec: ConvertVideosPayload['options']['codec'] = codec.value === 'auto'
      ? (document.createElement('video').canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"') ? 'hevc' : 'h264')
      : codec.value
    const options: ConvertVideosPayload['options'] = {codec: detectedCodec, resolution: resolution.value, quality: quality.value, destination: destination.value, deleteOriginal: deleteOriginal.value}
    const response = await typedApi.convertVideos({items: dialogs.videoConversion.items.map((item) => ({id: Number(item.id), path: String(item.path)})), options})
    job.value = response.data as Job
    timer.value = setInterval(() => { void poll() }, 700)
    notifications.setNotification({type: 'info', title: t('video_conversion.title'), text: t('video_conversion.queued', {count: job.value.items.length})})
  } catch (error) {
    notifications.setNotification({type: 'error', title: t('video_conversion.title'), text: error instanceof Error ? error.message : String(error)})
  } finally { starting.value = false }
}
async function poll() {
  if (!job.value?.id) return
  try {
    const response = await typedApi.getConversionJob(job.value.id)
    if (response.data) job.value = response.data
    if (finished.value && timer.value) {
      clearInterval(timer.value); timer.value = null
      listSync.getItemsFromDb({ids: dialogs.videoConversion.items.map((item) => Number(item.id)), type: 'media'})
      notifications.setNotification({type: job.value.status === 'cancelled' ? 'warning' : 'success', title: t('video_conversion.title'), text: t('video_conversion.finished', counts.value)})
    }
  } catch (error) {
    if (timer.value) { clearInterval(timer.value); timer.value = null }
    notifications.setNotification({type: 'error', title: t('video_conversion.title'), text: error instanceof Error ? error.message : String(error)})
  }
}
async function cancel() {
  if (!job.value || cancelling.value) return
  cancelling.value = true
  try { await typedApi.cancelAllConversions() } finally { cancelling.value = false }
}
function close() { if (timer.value) clearInterval(timer.value); timer.value = null; dialogs.closeVideoConversion() }
onBeforeUnmount(() => { if (timer.value) clearInterval(timer.value) })
</script>
