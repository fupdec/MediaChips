<template>
  <div :id="config.elementId" class="mx-4 pb-4">
    <SettingsCategoryDivider
      :title="t(titleKey)"
      :icon="config.icon"
      compact
    />

    <v-alert
      type="info"
      variant="tonal"
      density="compact"
      rounded="xl"
      class="mb-4"
    >
      <span class="text-caption">{{ t(hintKey) }}</span>
    </v-alert>

    <div class="text-body-2 mb-4">
      {{ statusText }}
    </div>

    <v-progress-linear
      v-if="active"
      :model-value="progress"
      color="primary"
      height="8"
      rounded
      striped
      class="mb-2"
    />

    <div v-if="active && currentPath" class="text-caption text-medium-emphasis mb-4 selectable">
      {{ currentPath }}
    </div>

    <div v-if="active" class="text-caption text-medium-emphasis mb-4">
      {{ progressText }}
    </div>

    <div v-if="lastSummary" class="text-body-2 mb-4">
      {{ summaryText }}
    </div>

    <v-alert
      v-if="missingHint"
      type="warning"
      variant="tonal"
      density="compact"
      rounded="xl"
      class="mb-4"
    >
      <span class="text-caption">{{ missingHint }}</span>
    </v-alert>

    <div class="d-flex flex-wrap ga-2">
      <v-btn
        v-if="!active"
        :loading="statusLoading"
        :disabled="statusLoading"
        color="secondary"
        rounded
        variant="outlined"
        class="pr-4"
        @click="refreshStatus"
      >
        <v-icon icon="mdi-refresh" start/>
        {{ t('settings_labels.database.refresh_status') }}
      </v-btn>

      <v-btn
        v-if="!active"
        :disabled="!canStart"
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
        :disabled="!canRecalculate"
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
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
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
} = useSettingsBackfillStream(props.config)

const titleKey = computed(() => `settings_labels.database.${config.i18nKey}`)
const hintKey = computed(() => `settings_labels.database.${config.i18nKey}_hint`)
const startKey = computed(() => `settings_labels.database.${config.i18nKey}_start`)
const recalculateKey = computed(() => `settings_labels.database.${config.i18nKey}_recalculate`)
</script>

<style scoped>
.selectable {
  user-select: text;
  word-break: break-all;
}
</style>
