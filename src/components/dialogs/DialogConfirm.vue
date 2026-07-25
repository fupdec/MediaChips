<template>
  <v-dialog
    v-model="model"
    :persistent="isPersistent"
    width="400"
    scrollable
  >
    <v-card>
      <v-card-text class="text-center" :class="variant === 'delete' ? '' : 'pt-8'">
        <v-icon
          v-if="variant === 'delete'"
          icon="mdi-alert-outline"
          size="48"
          color="error"
          class="py-6 mb-4"
        />
        <div
          :class="variant === 'delete' ? 'error-text' : undefined"
          v-html="text"
        />
        <v-checkbox
          v-if="checkBoxText"
          :model-value="checkBox"
          :label="checkBoxText"
          color="error"
          hide-details
          density="compact"
          class="mt-2"
          @update:model-value="emit('update:checkBox', Boolean($event))"
        />
      </v-card-text>

      <v-card-actions class="pb-4 px-4">
        <v-btn
          v-if="closable"
          variant="text"
          class="px-4"
          @click="close"
        >
          <v-icon icon="mdi-close" start />
          {{ cancelLabel }}
        </v-btn>

        <v-spacer />

        <v-btn
          :color="variant === 'delete' ? 'error' : 'success'"
          variant="flat"
          class="px-4"
          @click="confirm"
        >
          <v-icon icon="mdi-check" start />
          {{ confirmLabel }}
        </v-btn>

        <v-spacer v-if="!closable" />
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed} from 'vue'

const emit = defineEmits<{
  'update:dialog': [value: boolean]
  'update:checkBox': [value: boolean]
  close: []
  confirm: []
  delete: []
  remove: []
}>()

const props = withDefaults(defineProps<{
  dialog: boolean
  text?: string
  persistent?: boolean
  closable?: boolean
  variant?: 'confirm' | 'delete'
  checkBoxText?: string
  checkBox?: boolean
}>(), {
  text: '',
  persistent: false,
  closable: true,
  variant: 'confirm',
  checkBoxText: '',
  checkBox: false,
})

const isPersistent = computed(() =>
  props.persistent || props.variant === 'delete',
)

const cancelLabel = computed(() =>
  props.variant === 'delete' ? 'Cancel' : 'No',
)

const confirmLabel = computed(() =>
  props.variant === 'delete' ? 'Delete' : 'Yes',
)

const model = computed({
  get: () => props.dialog,
  set: (val) => {
    emit('update:dialog', val)
    if (!val) emit('close')
  },
})

function close() {
  model.value = false
}

function confirm() {
  emit('confirm')
  if (props.variant === 'delete') {
    emit('delete')
    emit('remove')
  }
  model.value = false
}
</script>

<style scoped>
pre {
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.error-text {
  color: rgb(var(--v-theme-error));
}
</style>
