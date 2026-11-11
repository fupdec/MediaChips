<template>
  <DialogChangeHistory
    :entity-type="entityType"
    :entity-id="entityId"
    :disabled="disabled"
    @restored="emit('restored')"
  >
    <template #activator="{open}">
      <EditDialogQuickAction
        icon="mdi-history"
        :label="t('change_history.title')"
        :placement="placement"
        :disabled="disabled"
        @click="open"
      />
    </template>
  </DialogChangeHistory>
</template>

<script setup lang="ts">
import {defineAsyncComponent} from 'vue'
import {useI18n} from 'vue-i18n'
import EditDialogQuickAction from './EditDialogQuickAction.vue'

const DialogChangeHistory = defineAsyncComponent(() => import('@/components/dialogs/DialogChangeHistory.vue'))

defineProps<{
  entityType: 'tag' | 'media'
  entityId: number
  placement: 'rail' | 'media'
  disabled?: boolean
}>()
const emit = defineEmits<{restored: []}>()
const {t} = useI18n()
</script>
