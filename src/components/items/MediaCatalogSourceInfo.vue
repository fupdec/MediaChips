<template>
  <div v-if="kinds.some(kind => kind !== 'local')" class="media-catalog-source-info mb-3">
    <div class="d-flex flex-wrap align-center ga-2">
      <v-chip size="small" prepend-icon="mdi-server-network" variant="tonal">
        {{ media.sourceNames || kinds.map(kind => t(`sources.catalog.kinds.${kind}`)).join(', ') }}
      </v-chip>
      <v-chip size="small" variant="tonal" :title="t('sources.catalog.observation_hint')">
        {{ t('sources.catalog.states.' + (media.availability || 'unknown')) }}
      </v-chip>
    </div>
    <MediaOfflineCopy v-if="kinds.some(kind => kind === 'nas' || kind === 'gdrive')" :media-id="media.id" />
    <div class="text-caption text-medium-emphasis mt-1">{{ t('sources.catalog.offline_editing') }}</div>
  </div>
</template>

<script setup lang="ts">
import MediaOfflineCopy from './MediaOfflineCopy.vue'
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import type {MediaItem} from '@shared/entities/media'
const props = defineProps<{media: MediaItem}>()
const {t} = useI18n()
const kinds = computed((): string[] => {
  try {
    const tokens = JSON.parse(props.media.sourceTokens || '[]')
    return Array.isArray(tokens) ? tokens.filter(token => ['local', 'nas', 'gdrive', 'web'].includes(token)) : []
  } catch { return [] }
})
</script>
