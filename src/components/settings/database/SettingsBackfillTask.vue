<template>
  <SettingsHealthTask :id="config.elementId" :status="taskStatus" compact class="maintenance-task--compact">
    <div>
      <SettingsHealthSectionHeader
        :title="t(titleKey)"
        :icon="config.icon"
        :documentation-id="documentationId"
        :status="taskStatus"
        :show-status="false"
        compact
      />

      <SettingsHealthProgress
        :label="compactStatusText"
        :percent="statusPercent"
        :active="active"
        :striped="active"
      />
      <p class="maintenance-task__hint">{{ t(hintKey) }}</p>
      <v-btn
        v-if="config.prerequisite"
        :to="{path: '/settings', query: {tab: 'maintenance', section: config.prerequisite.section}}"
        color="primary"
        rounded
        size="small"
        variant="tonal"
        class="backfill-task__prerequisite pr-4"
      >
        <v-icon icon="mdi-view-grid-outline" start/>
        {{ t(config.prerequisite.labelKey) }}
      </v-btn>
      <div v-if="active && currentPath" class="text-caption text-medium-emphasis mb-3 selectable">
        {{ currentPath }}
      </div>

      <div v-if="active" class="text-caption text-medium-emphasis mb-3">
        {{ progressText }}
      </div>

      <div v-if="lastSummary" class="text-body-2 mb-3">
        {{ summaryText }}
      </div>

      <v-alert
        v-if="missingHint"
        type="warning"
        variant="tonal"
        density="compact"
        rounded="xl"
        class="mb-3"
      >
        <span class="text-caption">{{ missingHint }}</span>
      </v-alert>

      <div class="d-flex flex-wrap align-center ga-2">
        <ModelDownloadMenu v-if="config.kind === 'clipEmbedding'" :kinds="['clip']" size="default" :disabled="active || modelBusy" @installed="refreshStatus" v-slot="{importing}">
          <v-btn color="primary" rounded :loading="modelBusy" :disabled="active || importing" @click="downloadClip">
            <v-icon icon="mdi-download" start/>{{ t('media.adding.download_video_recognition_model') }}
          </v-btn>
        </ModelDownloadMenu>
        <v-btn
          v-if="!active"
          :disabled="!canStart"
          :loading="statusLoading"
          color="primary"
          rounded
          size="small"
          variant="flat"
          class="pr-4"
          @click="startBackfill(false)"
        >
          <v-icon icon="mdi-play" start/>
          {{ t(startKey) }}
        </v-btn>

        <v-btn
          v-if="!active"
          :disabled="!canRecalculate || statusLoading"
          color="secondary"
          rounded
          size="small"
          variant="outlined"
          class="pr-4"
          @click="startBackfill(true)"
        >
          <v-icon icon="mdi-refresh" start/>
          {{ t(recalculateKey) }}
        </v-btn>

        <v-btn
          v-else
          color="error"
          rounded
          size="small"
          variant="flat"
          class="pr-4"
          @click="stopBackfill"
        >
          <v-icon icon="mdi-stop" start/>
          {{ t('common.stop') }}
        </v-btn>
      </div>

      <div v-if="$slots.default" class="backfill-task__extra">
        <slot/>
      </div>
    </div>
  </SettingsHealthTask>
</template>

<script setup lang="ts">
import ModelDownloadMenu from '@/components/ui/ModelDownloadMenu.vue'
import {typedApi} from '@/services/typedApi'
import {ensureModelsDownloaded} from '@/services/modelDownloadConsent'
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import SettingsHealthSectionHeader from '@/components/settings/database/SettingsHealthSectionHeader.vue'
import SettingsHealthTask from '@/components/settings/database/SettingsHealthTask.vue'
import SettingsHealthProgress from '@/components/settings/database/SettingsHealthProgress.vue'
import {
  useSettingsBackfillStream,
  type SettingsBackfillConfig,
} from '@/composable/useSettingsBackfillStream'

const props = defineProps<{
  config: SettingsBackfillConfig
}>()

const {t} = useI18n()
const modelBusy = ref(false)
async function downloadClip() {
  modelBusy.value = true
  try {
    await ensureModelsDownloaded({explicit: true, t, models: [{kind: 'clip', name: t('ai.models.clip'), sizeMb: 150,
      download: async onProgress => { await typedApi.downloadClipModel({}, onProgress) },
    }]})
    await refreshStatus()
  } finally { modelBusy.value = false }
}

const {
  config,
  statusLoading,
  statusText,
  active,
  progress,
  currentPath,
  lastSummary,
  counters,
  progressText,
  summaryText,
  missingHint,
  canStart,
  canRecalculate,
  refreshStatus,
  startBackfill,
  stopBackfill,
  status,
  statusLoaded,
} = useSettingsBackfillStream(props.config)

const documentationId = computed(() => ({fingerprint: 'database.fingerprint', oshash: 'database.fingerprint', contentHash: 'database.fingerprint', videoCodec: 'database.video_codec', visualHash: 'settings.visual_hash', clipEmbedding: 'settings.semantic_index', mediaCreated: 'settings.media_created'}[props.config.kind]))

const titleKey = computed(() => `settings_labels.database.${config.i18nKey}`)
const hintKey = computed(() => `settings_labels.database.${config.i18nKey}_hint`)
const startKey = computed(() => `settings_labels.database.${config.i18nKey}_start`)
const recalculateKey = computed(() => `settings_labels.database.${config.i18nKey}_recalculate`)

const pending = computed(() => Number(status.value?.pending || 0))

const taskStatus = computed(() => {
  if (statusLoading.value) return 'idle' as const
  if (pending.value > 0) return 'pending' as const
  return 'done' as const
})

const compactStatusText = computed(() => {
  if (!statusLoaded.value && !active.value) return statusText.value
  return t('settings_labels.database.health_task_count', {
    done: active.value ? counters.value.processed : status.value.done,
    total: active.value ? counters.value.total : status.value.total,
  })
})

const statusPercent = computed(() => {
  if (active.value) return Number(progress.value) || 0
  if (!statusLoaded.value) return 0
  const total = Number(status.value?.total || 0)
  if (!total) return 0
  const done = Number(status.value?.done || 0)
  const pending = Number(status.value?.pending || 0)
  // Prefer explicit done; fall back to total - pending if done is missing.
  const completed = done > 0 || pending === total
    ? done
    : Math.max(total - pending, 0)
  return Math.min((completed / total) * 100, 100)
})

// Status is a cheap SQL count — load automatically when the section opens.
void refreshStatus()
</script>

<style scoped>
.backfill-task__prerequisite {
  margin-bottom: 12px;
}

.backfill-task__extra {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), .06);
}

.selectable {
  user-select: text;
  word-break: break-all;
}
</style>
