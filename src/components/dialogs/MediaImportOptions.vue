<template>
  <v-expansion-panels variant="accordion" class="media-import-options">
    <v-expansion-panel elevation="0" rounded="lg">
      <v-expansion-panel-title class="media-import-options__title">
        <v-icon icon="mdi-tune-variant" size="19" color="primary" />
        <span>{{ t('media.adding.import_options') }}</span>
      </v-expansion-panel-title>
      <v-expansion-panel-text>
        <div class="media-import-options__checks">
          <slot name="before" />
          <div class="media-import-options__row">
            <v-checkbox v-model="parseTags" :disabled="disabled || parseDisabled" :label="t('media.adding.parse_tags')"
                        class="mt-0" hide-details density="compact" />
            <ButtonDocumentation id="media.parser" dense />
          </div>
          <div class="media-import-options__row">
            <v-checkbox v-model="excludePaths" :disabled="disabled" :label="t('media.adding.exclude_paths')"
                        class="mt-0" hide-details density="compact" />
            <v-icon icon="mdi-folder-hidden" size="18" class="media-import-options__row-icon" />
          </div>
        </div>
        <slot v-if="options.excludePaths" name="exclusionActions" />
        <v-textarea v-if="options.excludePaths" v-model="excluded" :disabled="disabled"
                    :label="t('media.adding.excluded_paths_label')" :hint="t('media.adding.excluded_paths_hint')"
                    variant="outlined" rounded="lg" no-resize rows="3" class="mt-2" density="comfortable" />
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import ButtonDocumentation from '@/components/ui/ButtonDocumentation.vue'
import type {RemoteImportOptions} from '@/services/remoteImportOptions'

defineProps<{disabled?: boolean; parseDisabled?: boolean}>()
const options = defineModel<RemoteImportOptions>({required: true})
// Emit immutable updates so parent adapters and sibling sources stay in sync.
const parseTags = computed({get: () => options.value.parseTags, set: value => { options.value = {...options.value, parseTags: value} }})
const excludePaths = computed({get: () => options.value.excludePaths, set: value => { options.value = {...options.value, excludePaths: value} }})
const excluded = computed({get: () => options.value.excluded, set: value => { options.value = {...options.value, excluded: value} }})
const {t} = useI18n()
</script>

<style scoped>
.media-import-options { margin-top: 16px; border: 1px solid rgba(var(--v-theme-primary), .14); border-radius: 12px; overflow: hidden; }
.media-import-options :deep(.v-expansion-panel) { background: rgb(var(--v-theme-surface)); }
.media-import-options__title { min-height: 48px; padding: 12px 16px; gap: 10px; font-size: .8125rem; font-weight: 600; }
.media-import-options :deep(.v-expansion-panel-text__wrapper) { padding: 0 12px 12px; }
.media-import-options__checks { display: flex; flex-direction: column; gap: 8px; }
.media-import-options__row { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 2px 10px 2px 2px; border: 1px solid rgba(var(--v-theme-on-surface), .07); border-radius: 10px; }
.media-import-options__row > .v-checkbox { flex: 1; min-width: 0; }
.media-import-options__row-icon { color: rgba(var(--v-theme-on-surface), .45); }
.media-import-options :deep(.v-label) { font-size: .75rem; line-height: 1.45; opacity: 1; white-space: normal; }
.media-import-options :deep(.v-selection-control) { min-height: 38px; }
.media-import-options :deep(.v-checkbox .v-input__details) { padding: 0 12px 8px 40px; font-size: .6875rem; line-height: 1.5; }
.media-import-options :deep(.import-option) { padding: 4px 10px 8px 2px; border: 1px solid rgba(var(--v-theme-on-surface), .07); border-radius: 10px; }
.media-import-options :deep(.import-option--fast) { background: rgba(var(--v-theme-primary), .04); border-color: rgba(var(--v-theme-primary), .16); }
.media-import-options :deep(.import-option__hint) { margin: 0 4px 0 40px; color: rgba(var(--v-theme-on-surface), .62); font-size: .6875rem; line-height: 1.6; }
.media-import-options :deep(.import-option__note) { display: flex; align-items: flex-start; gap: 8px; padding: 4px 8px; color: rgba(var(--v-theme-on-surface), .62); font-size: .6875rem; line-height: 1.5; }
.media-import-options :deep(.import-option__note .v-icon) { margin-top: 1px; flex-shrink: 0; color: rgb(var(--v-theme-success)); }
@media (max-width: 600px) {
  .media-import-options__title { padding: 10px 12px; }
  .media-import-options :deep(.v-expansion-panel-text__wrapper) { padding-inline: 8px; }
}
</style>
