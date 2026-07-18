<template>
  <div class="tmdb-settings mx-4">
    <settings-category-divider title="TMDB scraper" icon="movie-search-outline"/>

    <v-alert class="mb-6" type="info" variant="tonal" density="comfortable" rounded="lg">
      <div class="text-caption">
        Uses the official
        <a href="https://developer.themoviedb.org/docs/getting-started" target="_blank" rel="noopener noreferrer">
          TMDB API v3
        </a>.
        Get a free API key from
        <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer">
          themoviedb.org
        </a>.
      </div>
    </v-alert>

    <section class="mb-6">
      <div class="text-subtitle-1 font-weight-medium mb-1">API key</div>
      <v-text-field
        v-model="apiKey"
        @blur="saveKey"
        :type="showKey ? 'text' : 'password'"
        :append-inner-icon="showKey ? 'mdi-eye' : 'mdi-eye-off'"
        @click:append-inner="showKey = !showKey"
        placeholder="TMDB v3 API key"
        autocomplete="off"
        variant="outlined"
        rounded
        hide-details
        class="tmdb-field"
      />
      <div class="text-caption text-medium-emphasis mt-2">
        Status: {{ configured ? 'configured' : 'not configured' }}
      </div>
    </section>

    <v-divider class="mb-6"/>

    <section>
      <div class="text-subtitle-1 font-weight-medium mb-1">Video fields</div>
      <div class="text-body-2 text-medium-emphasis mb-4">
        Map TMDB fields for a video media type: Release date, Studio, Cast, Genres.
        Field creation and mapping live inside the configure dialog.
      </div>

      <v-autocomplete
        v-model="selectedVideoMediaType"
        :items="videoMediaTypes"
        item-value="id"
        item-title="name"
        label="Video media type"
        placeholder="Select video media type"
        return-object
        variant="outlined"
        rounded
        hide-details
        class="tmdb-field mb-4"
      >
        <template #selection="{ item }">
          <v-icon start>mdi-{{ item.raw.icon || 'video' }}</v-icon>
          <span>{{ item.raw.name }}</span>
        </template>
        <template #item="{ item, props: itemProps }">
          <v-list-item v-bind="itemProps">
            <template #title>
              <v-icon start>mdi-{{ item.raw.icon || 'video' }}</v-icon>
              <span>{{ item.raw.name }}</span>
            </template>
          </v-list-item>
        </template>
      </v-autocomplete>

      <v-btn
        :disabled="!selectedVideoMediaType"
        color="primary"
        rounded
        variant="flat"
      >
        <DialogTmdbScraperConfig
          v-if="selectedVideoMediaType"
          :key="`tmdb-scraper-${selectedVideoMediaType.id}`"
          :media-type-id="selectedVideoMediaType.id"
          @created="onFieldsCreated"
        />
        <v-icon start>mdi-tune</v-icon>
        Configure TMDB fields
      </v-btn>
    </section>

    <v-divider class="my-6"/>

    <section>
      <div class="text-subtitle-1 font-weight-medium mb-1">Person / actor fields</div>
      <div class="text-body-2 text-medium-emphasis mb-4">
        Choose the Cast tag category, then open the configure dialog to create/map
        Birthday / Deathday / Place of birth / Known for / Gender.
        Open a cast tag → <strong>TMDB person</strong> to scrape biography, aliases, and photo.
      </div>

      <v-autocomplete
        v-model="selectedPersonMeta"
        :items="arrayMetas"
        item-value="id"
        item-title="name"
        label="Cast / person category"
        placeholder="Select tag category"
        return-object
        clearable
        variant="outlined"
        rounded
        hide-details
        class="tmdb-field mb-4"
        @update:model-value="savePersonMeta"
      >
        <template #selection="{ item }">
          <v-icon start>mdi-{{ item.raw.icon || 'account-group' }}</v-icon>
          <span>{{ item.raw.name }}</span>
        </template>
        <template #item="{ item, props: itemProps }">
          <v-list-item v-bind="itemProps">
            <template #title>
              <v-icon start>mdi-{{ item.raw.icon || 'account-group' }}</v-icon>
              <span>{{ item.raw.name }}</span>
            </template>
          </v-list-item>
        </template>
      </v-autocomplete>

      <v-btn
        color="primary"
        rounded
        variant="flat"
      >
        <DialogTmdbPersonConfig
          :key="`tmdb-person-${selectedPersonMeta?.id || 'new'}`"
          :meta="selectedPersonMeta"
          :media-type-id="selectedVideoMediaType?.id"
          @created="onPersonFieldsCreated"
        />
        <v-icon start>mdi-tune</v-icon>
        Configure person fields
      </v-btn>
    </section>
  </div>
</template>

<script setup lang="ts">
import {computed, defineAsyncComponent, onMounted, ref} from 'vue'
import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'
import {setOption} from '@/services/settingsService'
import {isVideoMediaType} from '@/utils/mediaType'
import type {MediaType} from '@/types/media'
import type {Meta} from '@/types/stores'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import {useEventBus} from '@/utils/eventBus'
import {getTmdbStatus} from '../services/tmdbApi'

const DialogTmdbScraperConfig = defineAsyncComponent(() =>
  import('./DialogTmdbScraperConfig.vue'),
)
const DialogTmdbPersonConfig = defineAsyncComponent(() =>
  import('./DialogTmdbPersonConfig.vue'),
)

const appStore = useAppStore()
const settingsStore = useSettingsStore()
const eventBus = useEventBus()

const apiKey = ref('')
const showKey = ref(false)
const configured = ref(false)
const selectedVideoMediaType = ref<MediaType | undefined>()
const selectedPersonMeta = ref<Meta | undefined>()

const videoMediaTypes = computed(() =>
  (appStore.mediaTypes || []).filter((mediaType) => isVideoMediaType(mediaType)),
)

const arrayMetas = computed(() =>
  (appStore.meta || []).filter((meta) => meta.type === 'array'),
)

function saveKey() {
  setOption(apiKey.value, 'tmdbApiKey')
  configured.value = apiKey.value.trim().length > 0
}

function savePersonMeta() {
  const id = selectedPersonMeta.value?.id
  setOption(id != null ? String(id) : '', 'tmdbPersonMetaId')
}

function onFieldsCreated() {
  eventBus.emit('getMeta')
}

function onPersonFieldsCreated(meta: Meta) {
  selectedPersonMeta.value = meta
  setOption(String(meta.id), 'tmdbPersonMetaId')
  eventBus.emit('getMeta')
}

onMounted(async () => {
  apiKey.value = settingsStore.tmdbApiKey || ''
  selectedVideoMediaType.value = videoMediaTypes.value[0]
  const storedPersonId = Number(settingsStore.tmdbPersonMetaId)
  if (Number.isFinite(storedPersonId) && storedPersonId > 0) {
    selectedPersonMeta.value = arrayMetas.value.find(
      (meta) => Number(meta.id) === storedPersonId,
    )
  }
  if (!selectedPersonMeta.value) {
    selectedPersonMeta.value = arrayMetas.value.find(
      (meta) => /^(cast|performers)$/i.test(String(meta.name || '')),
    )
  }
  try {
    configured.value = (await getTmdbStatus()).configured
  } catch {
    configured.value = apiKey.value.trim().length > 0
  }
})
</script>

<style scoped>
.tmdb-field {
  max-width: 520px;
}
</style>
