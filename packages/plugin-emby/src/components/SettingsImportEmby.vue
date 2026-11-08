<template>
  <div :id="embedded ? undefined : 'settings-import-emby'" class="integration-settings" :class="{'mx-4': !embedded}">
    <settings-category-divider
      v-if="!embedded"
      :title="t('settings_labels.database.import_emby')"
      icon="television-box"
    />

    <v-alert
      v-if="!embedded"
      type="info"
      variant="tonal"
      density="compact"
      rounded="xl"
      class="mb-4"
    >
      <span class="text-caption">
        {{ t('settings_labels.database.import_emby_hint') }}
      </span>
    </v-alert>

    <v-alert
      v-if="!embedded"
      type="warning"
      variant="tonal"
      density="compact"
      rounded="xl"
      class="mb-4"
    >
      <span class="text-caption">
        {{ t('settings_labels.database.import_emby_backup_warning') }}
      </span>
    </v-alert>

    <div class="plugin-scraper-settings__grid integration-settings__form">
      <section class="plugin-scraper-settings__block">
        <div class="integration-settings__connection">
          <slot name="server-selector" />
          <v-text-field
            v-model="baseUrl"
            :label="t('settings_labels.database.import_emby_url')"
            :hint="embedded ? undefined : t('settings_labels.database.import_emby_url_hint')"
            :placeholder="embedded ? t('settings_labels.database.import_emby_url_hint') : undefined"
            :persistent-hint="!embedded"
            :hide-details="embedded"
            variant="outlined"
            density="compact"
            rounded="lg"
            :class="{'mb-2': !embedded}"
            :disabled="active || (embedded && loadingLibraries)"
          />

          <v-text-field
            v-model="apiKey"
            :label="t('settings_labels.database.import_emby_api_key')"
            :hint="embedded ? undefined : t('settings_labels.database.import_emby_api_key_hint')"
            :persistent-hint="!embedded"
            :hide-details="embedded"
            variant="outlined"
            density="compact"
            rounded="lg"
            :class="{'mb-4': !embedded}"
            type="password"
            autocomplete="off"
            :disabled="active || (embedded && loadingLibraries)"
          />
        </div>

        <div class="integration-settings__actions d-flex flex-wrap ga-2" :class="{'mb-4': !embedded}">
          <v-btn
            @click="loadLibraries"
            color="primary"
            :size="embedded ? 'small' : undefined"
            :rounded="embedded ? 'lg' : true"
            :variant="embedded ? 'tonal' : 'outlined'"
            :class="{'pr-4': !embedded}"
            :icon="embedded"
            :aria-label="t('settings_labels.database.import_emby_load_libraries')"
            v-tooltip:top="embedded ? t('settings_labels.database.import_emby_load_libraries') : undefined"
            :disabled="!canLoadLibraries || loadingLibraries || active"
            :loading="loadingLibraries"
          >
            <v-icon icon="mdi-library" :start="!embedded"/>
            <template v-if="!embedded">{{ t('settings_labels.database.import_emby_load_libraries') }}</template>
          </v-btn>
        </div>
      </section>
      <section class="plugin-scraper-settings__block">
        <v-select
          v-if="libraries.length"
          v-model="selectedLibraryIds"
          :items="libraryItems"
          item-title="title"
          item-value="value"
          :label="t('settings_labels.database.import_emby_libraries')"
          :hint="embedded ? undefined : t('settings_labels.database.import_emby_libraries_hint')"
          :persistent-hint="!embedded"
          :hide-details="embedded"
          multiple
          chips
          closable-chips
          variant="outlined"
          density="compact"
          rounded="lg"
          class="mb-4"
          :disabled="active || (embedded && loadingLibraries)"
        />

        <v-checkbox
          v-model="createMissingMedia"
          :label="t('settings_labels.database.import_emby_create_missing')"
          density="compact"
          hide-details
          :class="{'mb-4': !embedded}"
          :disabled="active"
        />
      </section>
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

    <div v-if="active" class="text-caption text-medium-emphasis mb-2">
      {{ t('settings_labels.database.import_emby_progress', {
        phase: phaseLabel,
        processed: counters.processed,
        total: counters.total,
      }) }}
    </div>

    <div v-if="active && currentPath" class="text-caption text-medium-emphasis mb-4 selectable">
      {{ currentPath }}
    </div>

    <div v-if="lastSummary" class="text-body-2 mb-4">
      {{ t('settings_labels.database.import_emby_complete', lastSummary) }}
    </div>

    <v-alert
      v-if="lastError"
      type="error"
      variant="tonal"
      density="compact"
      rounded="xl"
      class="mb-4"
    >
      <span class="text-caption">{{ lastError }}</span>
    </v-alert>

    <div class="d-flex flex-wrap ga-2">
      <v-btn
        v-if="!active && !embedded"
        @click="startImport"
        :disabled="!canStart"
        color="primary"
        rounded
        variant="flat"
        class="pr-4"
      >
        <v-icon icon="mdi-play" start/>
        {{ t('settings_labels.database.import_emby_start') }}
      </v-btn>

      <v-btn
        v-if="active"
        @click="stopImport"
        color="error"
        rounded
        variant="tonal"
        class="pr-4"
      >
        <v-icon icon="mdi-stop" start/>
        {{ t('common.cancel') }}
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import {setNotification} from '@/services/notificationService'
import {typedApi} from '@/services/typedApi'

const {embedded = false} = defineProps<{embedded?: boolean}>()
const emit = defineEmits<{imported: []}>()
const {t} = useI18n()

const baseUrl = ref('')
const apiKey = ref('')
const createMissingMedia = ref(true)
const libraries = ref<Array<{id: string; name: string}>>([])
const selectedLibraryIds = ref<string[]>([])
const loadingLibraries = ref(false)
const active = ref(false)
const currentPath = ref('')
const phase = ref('')
const lastError = ref('')
const lastSummary = ref<Record<string, number> | null>(null)
const counters = ref({processed: 0, total: 0})

let abortController: AbortController | null = null

const progress = computed(() => {
  if (!counters.value.total) return 0
  return Math.min(100, Math.round((counters.value.processed / counters.value.total) * 100))
})

const canLoadLibraries = computed(() => Boolean(baseUrl.value.trim() && apiKey.value.trim()))
const canStart = computed(() => canLoadLibraries.value && !active.value
  && (!embedded || (!loadingLibraries.value && selectedLibraryIds.value.length > 0)))

const libraryItems = computed(() =>
  libraries.value.map((lib) => ({title: lib.name, value: lib.id})),
)

if (embedded) {
  watch([baseUrl, apiKey], () => {
    libraries.value = []
    selectedLibraryIds.value = []
    lastError.value = ''
    lastSummary.value = null
  })
}

const phaseLabel = computed(() => {
  const key = `settings_labels.database.import_emby_phase_${phase.value}`
  const translated = t(key)
  return translated === key ? phase.value : translated
})

const stopImport = () => {
  abortController?.abort()
}

const loadLibraries = async () => {
  if (!canLoadLibraries.value || loadingLibraries.value) return
  loadingLibraries.value = true
  if (embedded) selectedLibraryIds.value = []
  lastError.value = ''
  try {
    const {data} = await typedApi.listMediaServerLibraries('emby', {
      baseUrl: baseUrl.value.trim(),
      apiKey: apiKey.value.trim(),
    })
    libraries.value = data.libraries || []
    if (embedded && !libraries.value.length) lastError.value = t('sources.media_servers.no_libraries')
    if (!embedded) selectedLibraryIds.value = libraries.value.map((lib) => lib.id)
  } catch (error) {
    lastError.value = (error as Error)?.message || String(error)
    libraries.value = []
    selectedLibraryIds.value = []
  } finally {
    loadingLibraries.value = false
  }
}

const startImport = async () => {
  if (active.value || !canStart.value) return

  active.value = true
  lastError.value = ''
  lastSummary.value = null
  currentPath.value = ''
  phase.value = 'starting'
  counters.value = {processed: 0, total: 0}
  abortController = new AbortController()

  try {
    await typedApi.streamMediaServerImport(
      'emby',
      {
        baseUrl: baseUrl.value.trim(),
        apiKey: apiKey.value.trim(),
        libraryIds: selectedLibraryIds.value.length ? selectedLibraryIds.value : undefined,
        createMissingMedia: createMissingMedia.value,
      },
      {signal: abortController.signal},
      (event) => {
        if (event.type === 'progress') {
          phase.value = String(event.phase || '')
          counters.value = {
            processed: Number(event.processed) || 0,
            total: Number(event.total) || 0,
          }
          currentPath.value = event.current ? String(event.current) : ''
        } else if (event.type === 'complete') {
          lastSummary.value = {
            people: Number(event.people) || 0,
            genres: Number(event.genres) || 0,
            studios: Number(event.studios) || 0,
            series: Number(event.series) || 0,
            mediaCreated: Number(event.mediaCreated) || 0,
            mediaMatched: Number(event.mediaMatched) || 0,
            mediaUpdated: Number(event.mediaUpdated) || 0,
            mediaSkipped: Number(event.mediaSkipped) || 0,
            markers: Number(event.markers) || 0,
          }
          emit('imported')
          setNotification({
            type: 'success',
            text: t('settings_labels.database.import_emby_success'),
          })
        } else if (event.type === 'error') {
          lastError.value = String(event.message || 'Emby import failed')
        }
      },
    )
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      lastError.value = t('settings_labels.database.import_emby_cancelled')
    } else {
      lastError.value = (error as Error)?.message || String(error)
      console.error('Emby import failed:', error)
    }
  } finally {
    active.value = false
    abortController = null
    currentPath.value = ''
  }
}
onBeforeUnmount(stopImport)
defineExpose({
  busy: computed(() => active.value || loadingLibraries.value),
  canSubmit: canStart,
  submit: startImport,
})
</script>
