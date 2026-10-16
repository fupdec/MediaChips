<template>
  <v-expansion-panels variant="accordion" class="media-import-options">
    <v-expansion-panel elevation="0" rounded="lg" :title="t('media.adding.import_options')">
      <v-expansion-panel-text>
        <div class="media-import-options__checks">
          <slot name="before" />
          <div class="d-flex align-center">
            <v-checkbox v-model="parseTags" :disabled="disabled || parseDisabled" :label="t('media.adding.parse_tags')"
                        class="mt-0" hide-details density="compact" />
            <ButtonDocumentation id="media.parser" dense />
          </div>
          <v-checkbox v-model="excludePaths" :disabled="disabled" :label="t('media.adding.exclude_paths')"
                      class="mt-0" hide-details density="compact" />
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
.media-import-options { margin-top: 16px; border: 1px solid rgba(var(--v-theme-on-surface), 0.08); border-radius: 8px; }
.media-import-options__checks { display: flex; flex-direction: column; gap: 4px; }
</style>
