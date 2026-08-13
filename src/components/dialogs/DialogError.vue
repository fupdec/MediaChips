<template>
  <v-dialog
    v-model="dialogsStore.error.show"
    width="420"
    scrollable
    persistent
  >
    <v-card
      class="error-dialog"
      rounded="xl"
    >
      <v-card-text class="error-dialog__body text-center px-6 pt-8 pb-2">
        <div
          class="error-dialog__icon mb-4"
          aria-hidden="true"
        >
          <v-icon
            icon="mdi-alert-octagon"
            size="28"
            color="error"
          />
        </div>

        <v-alert
          type="error"
          variant="tonal"
          density="compact"
          rounded="xl"
          class="text-body-2 text-left"
        >
          <div
            class="error-dialog__text"
            v-html="dialogsStore.error.text"
          />
        </v-alert>
      </v-card-text>

      <v-card-actions class="px-5 pb-5 pt-3 justify-center">
        <v-btn
          variant="flat"
          color="error"
          rounded="pill"
          class="px-5"
          @click="dialogsStore.error.show = false"
        >
          <v-icon
            icon="mdi-close"
            start
          />
          {{ t('common.close') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {useDialogsStore} from '@/stores/dialogs'
import {useI18n} from 'vue-i18n'

const dialogsStore = useDialogsStore()
const {t} = useI18n()
</script>

<style scoped>
.error-dialog__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: rgba(var(--v-theme-error), 0.12);
}

.error-dialog__text {
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word;
}
</style>
