<template>
  <v-dialog
    :model-value="dialogs.onboarding.show"
    persistent
    width="560"
    @update:model-value="onDialogToggle"
  >
    <v-card rounded="lg">
      <DialogHeader
        :header="t('onboarding.title')"
        :subheader="stepSubheader"
        icon="flag"
        closable
        @close="dismiss"
      />

      <v-card-text class="pt-2 pb-0">
        <v-progress-linear
          :model-value="progress"
          color="primary"
          height="4"
          rounded
          class="mb-4"
        />

        <div class="text-h6 mb-2">{{ currentStep.title }}</div>
        <p class="text-body-2 text-medium-emphasis mb-0">{{ currentStep.body }}</p>
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
          v-if="stepIndex > 0"
          variant="text"
          @click="stepIndex -= 1"
        >
          {{ t('onboarding.back') }}
        </v-btn>

        <v-btn
          v-if="currentStep.action === 'settings'"
          color="primary"
          variant="tonal"
          @click="openSettings"
        >
          {{ t('onboarding.open_settings') }}
        </v-btn>

        <v-btn
          v-if="currentStep.action === 'media'"
          color="primary"
          variant="tonal"
          @click="openMediaLibrary"
        >
          {{ t('onboarding.open_library') }}
        </v-btn>

        <v-btn
          v-if="isLastStep"
          color="primary"
          variant="flat"
          @click="finish"
        >
          {{ t('onboarding.finish') }}
        </v-btn>

        <v-btn
          v-else
          color="primary"
          variant="flat"
          @click="next"
        >
          {{ t('onboarding.next') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRouter} from 'vue-router'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import {useDialogsStore} from '@/stores/dialogs'
import {useAppStore} from '@/stores/app'
import {getDefaultMediaTypeId} from '@/utils/mediaType'
import {
  completeOnboarding,
  dismissOnboarding,
  getOnboardingStep,
  saveOnboardingStep,
  skipOnboarding,
} from '@/composable/useOnboarding'

const {t} = useI18n()
const router = useRouter()
const dialogs = useDialogsStore()
const appStore = useAppStore()

const stepIndex = ref(getOnboardingStep())

watch(
  () => dialogs.onboarding.show,
  (show) => {
    if (show) {
      stepIndex.value = getOnboardingStep()
    }
  },
)

const steps = computed(() => [
  {
    title: t('onboarding.steps.welcome.title'),
    body: t('onboarding.steps.welcome.body'),
    action: null,
  },
  {
    title: t('onboarding.steps.library.title'),
    body: t('onboarding.steps.library.body'),
    action: 'settings',
  },
  {
    title: t('onboarding.steps.media.title'),
    body: t('onboarding.steps.media.body'),
    action: 'media',
  },
  {
    title: t('onboarding.steps.done.title'),
    body: t('onboarding.steps.done.body'),
    action: null,
  },
])

const currentStep = computed(() => steps.value[stepIndex.value] ?? steps.value[0])
const isLastStep = computed(() => stepIndex.value >= steps.value.length - 1)
const progress = computed(() => ((stepIndex.value + 1) / steps.value.length) * 100)
const stepSubheader = computed(() =>
  t('onboarding.step_counter', {current: stepIndex.value + 1, total: steps.value.length}),
)

async function dismiss() {
  await dismissOnboarding(stepIndex.value)
  stepIndex.value = 0
}

async function skip() {
  await skipOnboarding()
  stepIndex.value = 0
}

async function finish() {
  await completeOnboarding()
  stepIndex.value = 0
}

async function next() {
  const nextStep = stepIndex.value + 1
  await saveOnboardingStep(nextStep)
  stepIndex.value = nextStep
}

function onDialogToggle(value: boolean) {
  if (!value) {
    void dismiss()
  }
}

async function openSettings() {
  const nextStep = stepIndex.value + 1
  await dismissOnboarding(nextStep)
  stepIndex.value = 0
  await router.push({path: '/settings', query: {tab: 'library'}})
}

async function openMediaLibrary() {
  const mediaTypeId = getDefaultMediaTypeId(appStore.mediaTypes)
  const nextStep = stepIndex.value + 1
  await dismissOnboarding(nextStep)
  stepIndex.value = 0

  if (mediaTypeId) {
    await router.push(`/media?mediaTypeId=${mediaTypeId}`)
    return
  }

  await router.push('/')
}
</script>
