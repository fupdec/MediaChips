<template>
  <SettingsHealthTask :id="config.elementId" :status="taskStatus" compact>
    <div>
      <SettingsHealthSectionHeader
        :title="t(titleKey)"
        :icon="config.icon"
        :hint="t(hintKey)"
        :status="taskStatus"
        :status-label="statusChipLabel"
        compact
      />

      <SettingsHealthProgress
        :label="statusText"
        :percent="statusPercent"
        :active="active"
        :striped="active"
      />
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

      <div class="d-flex flex-wrap ga-2">
        <v-btn
          v-if="!active"
          :disabled="!canStart"
          :loading="statusLoading"
          color="primary"
          rounded
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
          variant="flat"
          class="pr-4"
          @click="stopBackfill"
        >
          <v-icon icon="mdi-stop" start/>
          {{ t('common.stop') }}
        </v-btn>
      </div>
    </div>
  </SettingsHealthTask>
</template>

<script setup lang="ts">
import {computed} from 'vue'
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

const {
  config,
  statusLoading,
  statusText,
  active,
  progress,
  currentPath,
  lastSummary,
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

const statusChipLabel = computed(() => {
  if (taskStatus.value === 'pending') {
    return t('settings_labels.database.health_guide_pending', {count: pending.value})
  }
  if (taskStatus.value === 'done') {
    return t('settings_labels.database.health_guide_done')
  }
  return undefined
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
.selectable {
  user-select: text;
  word-break: break-all;
}
</style>
