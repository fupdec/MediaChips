<template>
  <v-dialog v-model="visible" width="720" scrollable :persistent="disabled" :z-index="2700">
    <v-card rounded="xl" class="selected-paths-dialog">
      <DialogHeader :header="t('media.adding.paths_section')"
                    :subheader="t('media.adding.browser_selected_count', {count: draftPaths.length})"
                    icon="playlist-edit" :closable="!disabled" @close="visible = false"/>
      <v-card-text class="pa-4">
        <template v-if="filePicker">
          <div v-for="path in draftPaths" :key="path" class="selected-paths-dialog__file">
            <span>{{ path }}</span>
            <v-btn size="small" variant="text" icon="mdi-close" :disabled="disabled"
                   :aria-label="t('media.adding.browser_clear_selection')" @click="draft = ''"/>
          </div>
        </template>
        <v-textarea v-else v-model="draft" autofocus :disabled="disabled"
                    :label="t('media.adding.paths_label')"
                    :hint="hint || t('media.adding.browser_selection_hint')" persistent-hint
                    variant="outlined" rounded="lg" rows="8" no-resize density="comfortable"/>
        <v-btn v-if="$slots.folderPicker" prepend-icon="mdi-folder-open-outline" variant="tonal"
               class="mt-3" :disabled="disabled" @click="pickerOpen = !pickerOpen">
          {{ t('media.adding.select_folders') }}
        </v-btn>
        <slot v-if="pickerOpen" name="folderPicker" :add-folder="addFolder" />
      </v-card-text>
      <v-card-actions class="px-4 pb-4">
        <v-spacer/>
        <v-btn variant="text" rounded="lg" :disabled="disabled" @click="visible = false">
          {{ t('common.cancel') }}
        </v-btn>
        <v-btn color="primary" variant="flat" rounded="lg" :disabled="disabled" @click="save">
          {{ t('common.save') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import {transformTextToArray} from '@/services/formatUtils'
import {normalizePastedFilePathsText} from '@/utils/filePathInput'

const props = defineProps<{
  modelValue: boolean
  selectedPaths: string[]
  disabled?: boolean
  filePicker?: boolean
  hint?: string
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'update:selectedPaths': [value: string[]]
}>()
const {t} = useI18n()
const visible = computed({get: () => props.modelValue, set: value => emit('update:modelValue', value)})
const pickerOpen = ref(false)
const draft = ref('')
function addFolder(path: string) {
  if (props.disabled || !pickerOpen.value || !path) return
  draft.value = [...new Set([...draft.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean), path])].join('\n')
  pickerOpen.value = false
}
const draftPaths = computed(() => transformTextToArray(String(normalizePastedFilePathsText(draft.value) ?? '')))
watch(() => props.modelValue, open => {
  if (!open) return
  draft.value = props.selectedPaths.join('\n')
  pickerOpen.value = false
}, {immediate: true})
function save() {
  if (props.disabled) return
  emit('update:selectedPaths', draftPaths.value)
  visible.value = false
}
</script>

<style scoped>
.selected-paths-dialog__file {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-wrap: anywhere;
}
.selected-paths-dialog__file span {
  flex: 1;
  min-width: 0;
}
</style>
