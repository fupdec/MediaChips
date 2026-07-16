<template>
  <section class="widget-health-alerts mb-6">
    <div class="d-flex align-center justify-space-between mb-3">
      <div class="d-flex align-center text-h6">
        <v-icon class="mr-2" size="24">mdi-heart-pulse</v-icon>
        <span>{{ t('home.widgets.health_title') }}</span>
      </div>

      <v-btn
        v-if="checked && !loading"
        @click="runCheck"
        color="primary"
        icon
        size="small"
        variant="text"
        :title="t('home.widgets.health_run_check')"
      >
        <v-icon>mdi-refresh</v-icon>
      </v-btn>
    </div>

    <v-btn
      v-if="!checked && !loading"
      @click="runCheck"
      color="primary"
      rounded
      variant="tonal"
      prepend-icon="mdi-play-circle-outline"
    >
      {{ t('home.widgets.health_run_check') }}
    </v-btn>

    <div v-if="loading" class="mt-2">
      <v-progress-linear indeterminate color="primary" rounded height="4" class="mb-2"/>
      <div class="text-caption text-medium-emphasis">
        {{ t('home.widgets.health_checking') }}
      </div>
    </div>

    <template v-else-if="checked">
      <v-alert
        v-if="databaseSize != null"
        type="info"
        icon="mdi-database-outline"
        variant="tonal"
        rounded="lg"
        density="compact"
        class="mb-2"
      >
        <div class="d-flex align-center justify-space-between flex-wrap ga-2">
          <span class="text-body-2">{{ databaseSizeLabel }}</span>

          <v-btn
            @click="openDatabaseSettings"
            color="primary"
            size="small"
            variant="text"
            rounded
          >
            {{ t('home.widgets.health_open_settings') }}
          </v-btn>
        </div>
      </v-alert>

      <v-alert
        v-if="!visibleAlerts.length"
        type="success"
        icon="mdi-check-circle-outline"
        variant="tonal"
        rounded="lg"
        density="compact"
      >
        {{ t('home.widgets.health_no_issues') }}
      </v-alert>

      <div v-else class="d-flex flex-column ga-2">
        <v-alert
          v-for="alert in visibleAlerts"
          :key="alert.id"
          :type="alert.type"
          :icon="alert.icon"
          variant="tonal"
          rounded="lg"
          density="compact"
          class="widget-health-alerts__item"
        >
          <div class="d-flex align-center justify-space-between flex-wrap ga-2">
            <span class="text-body-2">{{ alert.text }}</span>

            <v-btn
              v-if="alert.action"
              @click="alert.action()"
              color="primary"
              size="small"
              variant="text"
              rounded
            >
              {{ alert.actionLabel }}
            </v-btn>
          </div>
        </v-alert>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useTasksStore} from '@/stores/tasks'
import {useEventBus} from '@/utils/eventBus'
import {getReadableFileSize} from '@/services/formatUtils'
import {getDefaultMediaTypeId} from '@/utils/mediaType'
import type { HealthAlertItem, HomeHealthData } from '@/types/widgets'
import { emptyHomeHealthUi, toHomeHealthUi } from '@/types/widgets'

const {t} = useI18n()
const router = useRouter()
const appStore = useAppStore()
const itemsStore = useItemsStore()
const tasksStore = useTasksStore()
const eventBus = useEventBus()

const checked = ref(false)
const loading = ref(false)
const health = ref<HomeHealthData>(emptyHomeHealthUi())

const activeTasksCount = computed(() => tasksStore.list.length)

const databaseSize = computed(() => {
  const bytes = health.value.database?.bytes
  return bytes == null ? null : Number(bytes)
})

const databaseSizeLabel = computed(() => {
  const size = getReadableFileSize(databaseSize.value ?? 0)
  const name = health.value.database?.name

  if (name) {
    return t('home.widgets.health_database_size_named', {name, size})
  }

  return t('home.widgets.health_database_size', {size})
})

const visibleAlerts = computed((): HealthAlertItem[] => {
  const alerts: HealthAlertItem[] = []

  if (health.value.duplicates.byFilesize > 0) {
    alerts.push({
      id: 'duplicates-size',
      type: 'warning',
      icon: 'mdi-content-copy',
      text: t('home.widgets.health_duplicates_size', {
        count: health.value.duplicates.byFilesize,
      }),
      actionLabel: t('home.widgets.health_show_duplicates'),
      action: openDuplicates,
    })
  }

  if ((health.value.duplicates.byFingerprint || health.value.duplicates.byContentHash) > 0) {
    alerts.push({
      id: 'duplicates-hash',
      type: 'warning',
      icon: 'mdi-fingerprint',
      text: t('home.widgets.health_duplicates_fingerprint', {
        count: health.value.duplicates.byFingerprint || health.value.duplicates.byContentHash,
      }),
      actionLabel: t('home.widgets.health_show_duplicates'),
      action: openDuplicates,
    })
  }

  const fingerprintPending = Number(health.value.fingerprint?.pending ?? (
    Number(health.value.contentHash?.pending || 0) + Number(health.value.oshash?.pending || 0)
  ))
  if (fingerprintPending > 0) {
    alerts.push({
      id: 'fingerprint',
      type: 'info',
      icon: 'mdi-fingerprint-off',
      text: t('home.widgets.health_fingerprint_pending', {
        count: fingerprintPending,
      }),
      actionLabel: t('home.widgets.health_open_settings'),
      action: openOshashBackfillSettings,
    })
  }

  if (health.value.videoCodec.pending > 0) {
    alerts.push({
      id: 'video-codec',
      type: 'info',
      icon: 'mdi-movie-filter-outline',
      text: t('home.widgets.health_video_codec_pending', {
        count: health.value.videoCodec.pending,
      }),
      actionLabel: t('home.widgets.health_open_video_codec_backfill'),
      action: openVideoCodecBackfillSettings,
    })
  }

  const videoImageTypes = ['preview', 'grid', 'marks']
  const videoImagesPending = videoImageTypes.reduce(
    (sum, key) => sum + Number(health.value.generatedImages.byType?.[key]?.pending || 0),
    0,
  )
  const imageThumbsPending = Number(health.value.imageThumbs?.pending || 0)

  if (videoImagesPending > 0) {
    alerts.push({
      id: 'generated-images',
      type: 'info',
      icon: 'mdi-image-off-outline',
      text: t('home.widgets.health_generated_images_pending', {
        count: videoImagesPending,
      }),
      actionLabel: t('home.widgets.health_open_image_generation'),
      action: openImageGenerationSettings,
    })
  }

  if (imageThumbsPending > 0) {
    alerts.push({
      id: 'image-thumbs',
      type: 'info',
      icon: 'mdi-image-outline',
      text: t('home.widgets.health_image_thumbs_pending', {
        count: imageThumbsPending,
      }),
      actionLabel: t('home.widgets.health_open_image_thumbs_generation'),
      action: openImageThumbsGenerationSettings,
    })
  }

  if (activeTasksCount.value > 0) {
    alerts.push({
      id: 'tasks',
      type: 'info',
      icon: 'mdi-cogs',
      text: t('home.widgets.health_active_tasks', {
        count: activeTasksCount.value,
      }),
      actionLabel: t('home.widgets.health_open_tasks'),
      action: openTasks,
    })
  }

  return alerts
})

function openDatabaseSettings() {
  router.push({
    path: '/settings',
    query: {tab: 'database'},
  })
}

function openImageGenerationSettings() {
  router.push({
    path: '/settings',
    query: {
      tab: 'database',
      section: 'generate_video_images',
    },
  })
}

function openImageThumbsGenerationSettings() {
  router.push({
    path: '/settings',
    query: {
      tab: 'database',
      section: 'generate_image_thumbs',
    },
  })
}

function openVideoCodecBackfillSettings() {
  router.push({
    path: '/settings',
    query: {
      tab: 'database',
      section: 'video_codec_backfill',
    },
  })
}

function openOshashBackfillSettings() {
  router.push({
    path: '/settings',
    query: {
      tab: 'database',
      section: 'oshash_backfill',
    },
  })
}

function openTasks() {
  eventBus.emit('openTasksMenu')
}

function openDuplicates() {
  const mediaTypeId = getDefaultMediaTypeId(appStore.mediaTypes)
  itemsStore.find_duplicates = true
  router.push(`/media?mediaTypeId=${mediaTypeId ?? ''}`)
}

async function loadHealth() {
  const response = await typedApi.getHomeHealth()
  health.value = toHomeHealthUi(response.data)
}

async function runCheck() {
  if (loading.value) return

  loading.value = true
  checked.value = false
  health.value = emptyHomeHealthUi()

  try {
    await loadHealth()
    checked.value = true
  } catch (error) {
    console.error(error)
    checked.value = true
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss" scoped>
.widget-health-alerts {
  &__item {
    margin-bottom: 0;
  }
}
</style>
