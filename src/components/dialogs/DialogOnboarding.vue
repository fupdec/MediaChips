<template>
  <v-dialog
    :model-value="dialogs.onboarding.show"
    persistent
    width="680"
    @update:model-value="onDialogToggle"
  >
    <v-card rounded="lg">
      <DialogHeader
        :header="t('onboarding.title')"
        icon="flag"
        closable
        @close="dismiss"
      />

      <v-card-text class="pt-2 pb-0">
        <div class="onboarding-step-image mb-4 rounded-lg overflow-hidden bg-surface-variant">
          <v-img
            src="/images/onboarding/01-welcome.png"
            :alt="t('onboarding.steps.welcome.title')"
            aspect-ratio="16/9"
            cover
          />
        </div>

        <div class="text-h6 mb-2">{{ t('onboarding.steps.welcome.title') }}</div>
        <p class="text-body-2 text-medium-emphasis mb-0">{{ t('onboarding.steps.welcome.body') }}</p>

        <div
          v-if="!advancedUi"
          class="onboarding-simple-note mt-3 d-flex align-start ga-2 rounded-lg px-3 py-2"
        >
          <v-icon size="16" color="primary" class="mt-1">mdi-tune-variant</v-icon>
          <div class="text-caption text-medium-emphasis">
            <span class="font-weight-medium text-high-emphasis">{{ t('onboarding.simple_mode_title') }}.</span>
            {{ t('onboarding.simple_mode_note') }}
          </div>
        </div>
      </v-card-text>

      <v-card-actions class="px-4 pb-4 pt-4">
        <v-btn
          variant="text"
          @click="skip"
        >
          {{ t('onboarding.skip') }}
        </v-btn>

        <v-spacer />

        <v-btn
          color="primary"
          variant="flat"
          @click="finish"
        >
          {{ t('onboarding.finish') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import DialogHeader from '@/components/elements/DialogHeader.vue'
import {computed} from 'vue'
import {useDialogsStore} from '@/stores/dialogs'
import {useSettingsStore} from '@/stores/settings'
import {useI18n} from 'vue-i18n'
import {
  completeOnboarding,
  dismissOnboarding,
  skipOnboarding,
} from '@/composable/useOnboarding'
import {navigateToLibraryIfEmpty} from '@/composable/useEmptyLibraryLanding'

const {t} = useI18n()
const dialogs = useDialogsStore()
const advancedUi = computed(() => useSettingsStore().advancedUi === '1')

async function dismiss() {
  await dismissOnboarding(0)
}

async function skip() {
  await skipOnboarding()
  await navigateToLibraryIfEmpty()
}

async function finish() {
  await completeOnboarding()
  await navigateToLibraryIfEmpty()
}

function onDialogToggle(value: boolean) {
  if (!value) {
    void dismiss()
  }
}
</script>

<style scoped>
.onboarding-simple-note {
  background: rgba(var(--v-theme-primary), 0.08);
}

.onboarding-step-image {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>
