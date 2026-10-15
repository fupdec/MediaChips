<template>
  <v-expansion-panels variant="accordion" class="my-3">
    <v-expansion-panel elevation="0" rounded="lg" :title="t('media.adding.import_options')">
      <v-expansion-panel-text>
        <div class="d-flex align-center">
          <v-checkbox v-model="options.parseTags" :disabled="disabled" :label="t('media.adding.parse_tags')"
                      class="mt-0" hide-details density="compact" />
          <ButtonDocumentation id="media.parser" dense />
        </div>
        <v-checkbox v-model="options.excludePaths" :disabled="disabled" :label="t('media.adding.exclude_paths')"
                    class="mt-0" hide-details density="compact" />
        <v-textarea v-if="options.excludePaths" v-model="options.excluded" :disabled="disabled"
                    :label="t('media.adding.excluded_paths_label')" :hint="t('media.adding.excluded_paths_hint')"
                    variant="outlined" rounded="lg" no-resize rows="3" class="mt-2" density="comfortable" />
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
</template>

<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import ButtonDocumentation from '@/components/ui/ButtonDocumentation.vue'
import type {RemoteImportOptions} from '@/services/remoteImportOptions'

defineProps<{disabled?: boolean}>()
const options = defineModel<RemoteImportOptions>({required: true})
const {t} = useI18n()
</script>
