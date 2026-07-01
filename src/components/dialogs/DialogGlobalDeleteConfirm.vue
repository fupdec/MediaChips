<template>
  <v-dialog v-if="dialog" v-model="dialog" width="400" scrollable persistent>
    <v-card>
      <v-card-text class="text-center">
        <v-icon size="large" color="error" class="py-6"> mdi-alert-outline </v-icon>
        <div
          class="text-error"
          v-html="text || dialogsStore.confirm.text"
        ></div>
        <v-checkbox
          v-if="dialogsStore.confirm.checkBoxText"
          v-model="dialogsStore.confirm.checkBox"
          :label="dialogsStore.confirm.checkBoxText"
          color="error"
          hide-details
          density="compact"
        ></v-checkbox>
      </v-card-text>
      <v-card-actions class="pb-4 px-4">
        <v-btn @click="close" class="px-4" variant="text">
          <v-icon icon="mdi-close" start></v-icon> Cancel
        </v-btn>
        <v-spacer></v-spacer>
        <v-btn @click="del" color="error" class="px-4" variant="flat">
          <v-icon icon="mdi-check" start></v-icon> Delete
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useDialogsStore } from '@/stores/dialogs'

defineProps({
  text: String,
})

const dialogsStore = useDialogsStore()
const dialog = ref(false)

// Methods
const close = () => {
  dialogsStore.confirm.show = false
}

const del = () => {
  if (dialogsStore.confirm.action && typeof dialogsStore.confirm.action === 'function') {
    dialogsStore.confirm.action()
  }
  dialogsStore.confirm.show = false
}

// Lifecycle
onMounted(() => {
  dialog.value = dialogsStore.confirm.show

  // Следим за изменениями show в store
  watch(() => dialogsStore.confirm.show, (newValue) => {
    dialog.value = newValue
  })
})

onUnmounted(() => {
  // Сбрасываем текст чекбокса при размонтировании
  dialogsStore.confirm.checkBoxText = ''
  dialogsStore.confirm.checkBox = false
})
</script>
