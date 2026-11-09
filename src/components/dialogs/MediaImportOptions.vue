<template>
  <div class="media-import-options__actions">
    <div v-if="inline" class="media-import-options media-import-options__row">
      <v-checkbox v-model="parseTags" :disabled="disabled || parseDisabled" :label="t('media.adding.parse_tags')"
                  hide-details density="compact" />
      <ButtonDocumentation id="media.parser" dense />
    </div>
    <v-dialog v-else v-model="settingsOpen" max-width="600" scrollable>
      <template #activator="{props: activatorProps}">
        <v-btn v-bind="activatorProps" :disabled="disabled" icon
               :aria-label="t('media.adding.import_options')" v-tooltip:top="t('media.adding.import_options')"
               variant="text" rounded="lg" size="small">
          <v-icon size="18" icon="mdi-tune-variant" />
        </v-btn>
      </template>

      <v-card rounded="xl">
        <DialogHeader :header="t('media.adding.import_options')" icon="tune-variant" closable @close="settingsOpen = false" />
        <v-card-text class="media-import-options">
          <slot name="before" />
          <div class="media-import-options__row">
            <v-checkbox v-model="parseTags" :disabled="disabled || parseDisabled" :label="t('media.adding.parse_tags')"
                        hide-details density="compact" />
            <ButtonDocumentation id="media.parser" dense />
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-if="folderBrowser" v-model="exclusionsOpen" width="880" max-width="calc(100% - 32px)" scrollable>
      <template #activator="{props: activatorProps}">
        <v-btn v-bind="activatorProps" :disabled="disabled" icon
               :aria-label="t('media.adding.ignored_folders')" v-tooltip:top="t('media.adding.ignored_folders')"
               variant="text" rounded="lg" size="small">
          <v-badge :model-value="excludedPaths.length > 0" color="primary" dot floating>
            <v-icon size="18" icon="mdi-folder-remove-outline" />
          </v-badge>
        </v-btn>
      </template>

      <v-card rounded="xl">
        <DialogHeader :header="t('media.adding.ignored_folders')" icon="folder-remove-outline" closable
                      @close="exclusionsOpen = false" />
        <v-card-text class="pa-2 pa-sm-4">
          <MediaFolderBrowser v-bind="folderBrowser" v-model:path="folderPath"
                              :selected-paths="excludedPaths" :disabled="disabled" folders-only hide-file-details
                              @update:selected-paths="selectExcludedPaths"
                              :enable-folder-tags="false" hide-favorites @select-place="folderPath = $event" />
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import MediaFolderBrowser from './MediaFolderBrowser.vue'
import type {BrowseDirectoryLoader, BrowsePlace} from '@/services/typedApi/browse'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import ButtonDocumentation from '@/components/ui/ButtonDocumentation.vue'
import type {RemoteImportOptions} from '@/services/remoteImportOptions'

const props = defineProps<{
  inline?: boolean
  disabled?: boolean
  parseDisabled?: boolean
  folderBrowser?: {
    baseUrl: string
    path: string
    directoryLoader?: BrowseDirectoryLoader
    places?: BrowsePlace[]
    pathTitles?: Record<string, string>
    favoritesScope?: string
    errorMessage?: (error: unknown) => string
  }
}>()
const settingsOpen = ref(false)
const exclusionsOpen = ref(false)
const options = defineModel<RemoteImportOptions>({required: true})
// Emit immutable updates so parent adapters and sibling sources stay in sync.
const parseTags = computed({get: () => options.value.parseTags, set: value => { options.value = {...options.value, parseTags: value} }})
const excludedPaths = computed(() => [...new Set(options.value.excluded.split(/\r?\n/).map(path => path.trim()).filter(Boolean))])
const folderPath = ref('')
watch(exclusionsOpen, open => {
  if (!open) return
  folderPath.value = props.folderBrowser?.path || props.folderBrowser?.places?.[0]?.path || ''
})
function selectExcludedPaths(paths: string[]) {
  options.value = {...options.value, excluded: paths.join('\n')}
}
const {t} = useI18n()
</script>

<style scoped>
.media-import-options__actions { display: flex; align-items: center; gap: 2px; }
.media-import-options__row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.media-import-options__row > .v-checkbox { flex: 0 1 auto; min-width: 0; }
.media-import-options :deep(.v-label) { font-size: .75rem; line-height: 1.45; opacity: 1; white-space: normal; }
.media-import-options :deep(.v-selection-control) { min-height: 34px; }
.media-import-options :deep(.v-checkbox .v-input__details) { padding: 0 12px 8px 40px; font-size: .6875rem; line-height: 1.5; }
.media-import-options :deep(.import-option--fast) { padding-bottom: 4px; }
.media-import-options :deep(.import-option__hint) { margin: 0 4px 0 40px; color: rgba(var(--v-theme-on-surface), .62); font-size: .6875rem; line-height: 1.6; }
.media-import-options :deep(.import-option__note) { display: flex; align-items: flex-start; gap: 8px; padding: 4px 8px; color: rgba(var(--v-theme-on-surface), .62); font-size: .6875rem; line-height: 1.5; }
.media-import-options :deep(.import-option__note .v-icon) { margin-top: 1px; flex-shrink: 0; color: rgb(var(--v-theme-success)); }
</style>
