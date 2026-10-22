<template>
  <div v-if="kinds.some(kind => kind !== 'local')" class="media-catalog-source-info">
    <div class="media-catalog-source-info__summary">
      <v-chip class="media-catalog-source-info__name" size="x-small" :prepend-icon="kinds.length === 1 ? sourceIcon(kinds[0]) : 'mdi-cloud-outline'" variant="tonal">
        {{ media.sourceNames || kinds.map(kind => t(`sources.catalog.kinds.${kind}`)).join(', ') }}
      </v-chip>
      <v-chip size="x-small" variant="tonal" :color="media.availability === 'available' ? 'success' : media.availability === 'unavailable' ? 'warning' : undefined" :title="t('sources.catalog.observation_hint')">
        {{ t('sources.catalog.states.' + (media.availability || 'unknown')) }}
      </v-chip>
    </div>
    <MediaOfflineCopy v-if="kinds.some(kind => ['nas', 'gdrive', 'onedrive', 'dropbox'].includes(kind))" :media-id="media.id" />
    <v-icon size="14" class="media-catalog-source-info__hint" :title="t('sources.catalog.offline_editing')" :aria-label="t('sources.catalog.offline_editing')" tabindex="0">mdi-information-outline</v-icon>
  </div>
</template>

<script setup lang="ts">
import MediaOfflineCopy from './MediaOfflineCopy.vue'
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import type {MediaItem} from '@shared/entities/media'
const props = defineProps<{media: MediaItem}>()
const {t} = useI18n()
const sourceIcon = (kind: string) => kind === 'gdrive' ? 'mdi-google-drive' : kind === 'dropbox' ? 'mdi-dropbox' : kind === 'onedrive' ? 'mdi-microsoft-onedrive' : 'mdi-server-network'
const kinds = computed((): string[] => {
  try {
    const tokens = JSON.parse(props.media.sourceTokens || '[]')
    return Array.isArray(tokens) ? tokens.filter(token => ['local', 'nas', 'gdrive', 'onedrive', 'dropbox', 'web'].includes(token)) : []
  } catch { return [] }
})
</script>

<style scoped>
.media-catalog-source-info { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; padding: 6px 12px; border-bottom: 1px solid rgba(var(--v-theme-primary), 0.1); }
.media-catalog-source-info__name { height: auto; min-height: 22px; padding-block: 2px; }
.media-catalog-source-info__name :deep(.v-chip__content) { white-space: normal; overflow-wrap: anywhere; }
.media-catalog-source-info__summary { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; max-width: 100%; }
.media-catalog-source-info__hint { opacity: 0.55; }
</style>
