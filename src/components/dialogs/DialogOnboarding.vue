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

        <div
          v-if="currentStep.image"
          class="onboarding-step-image mb-4 rounded-lg overflow-hidden bg-surface-variant"
        >
          <v-img
            :src="currentStep.image"
            :alt="currentStep.title"
            aspect-ratio="16/9"
            cover
          />
        </div>

        <div class="text-h6 mb-2">{{ currentStep.title }}</div>
        <p class="text-body-2 text-medium-emphasis mb-0">{{ currentStep.body }}</p>

        <v-list
          v-if="currentStep.action === 'starter'"
          class="mt-4 bg-transparent"
          density="compact"
        >
          <v-list-item
            v-for="item in starterItems"
            :key="item.title"
            :prepend-icon="item.icon"
            :title="item.title"
            :subtitle="item.subtitle"
          />
        </v-list>
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
          v-if="currentStep.action === 'starter'"
          color="primary"
          variant="tonal"
          :loading="applyingStarter"
          :disabled="applyingStarter"
          @click="applyStarter"
        >
          {{ t('onboarding.apply_starter') }}
        </v-btn>

        <v-btn
          v-if="currentStep.action === 'media'"
          color="primary"
          variant="tonal"
          @click="openAddFiles"
        >
          {{ t('onboarding.add_files') }}
        </v-btn>

        <v-btn
          v-if="currentStep.action === 'watched'"
          color="primary"
          variant="tonal"
          @click="openWatchedFolders"
        >
          {{ t('onboarding.open_watched_folders') }}
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
          v-else-if="currentStep.action !== 'starter'"
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
import {useSettingsStore} from '@/stores/settings'
import {getDefaultMediaTypeId} from '@/utils/mediaType'
import {useAppShell} from '@/composable/appShell'
import {ensureStarterMeta} from '@/services/ensureStarterMeta'
import {setNotification} from '@/services/notificationService'
import {typedApi} from '@/services/typedApi'
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
const settingsStore = useSettingsStore()
const appShell = useAppShell()

const stepIndex = ref(getOnboardingStep())
const applyingStarter = ref(false)

watch(
  () => dialogs.onboarding.show,
  (show) => {
    if (show) {
      stepIndex.value = getOnboardingStep()
    }
  },
)

type OnboardingAction = 'starter' | 'media' | 'watched' | null

const starterItems = computed(() => [
  {
    icon: 'mdi-tag-multiple-outline',
    title: t('onboarding.starter.tags_title'),
    subtitle: t('onboarding.starter.tags_subtitle'),
  },
])

const steps = computed(() => [
  {
    title: t('onboarding.steps.welcome.title'),
    body: t('onboarding.steps.welcome.body'),
    image: '/images/onboarding/01-welcome.png',
    action: null as OnboardingAction,
  },
  {
    title: t('onboarding.steps.library.title'),
    body: t('onboarding.steps.library.body'),
    image: '/images/onboarding/02-fields.png',
    action: 'starter' as OnboardingAction,
  },
  {
    title: t('onboarding.steps.media.title'),
    body: t('onboarding.steps.media.body'),
    image: '/images/onboarding/03-add-files.png',
    action: 'media' as OnboardingAction,
  },
  {
    title: t('onboarding.steps.done.title'),
    body: t('onboarding.steps.done.body'),
    image: '/images/onboarding/04-ready.png',
    action: 'watched' as OnboardingAction,
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

async function applyStarter() {
  applyingStarter.value = true
  try {
    const mediaTypeIds = (appStore.mediaTypes || [])
      .filter((mediaType) => mediaType.type === 'video' || mediaType.type === 'image')
      .map((mediaType) => Number(mediaType.id))
      .filter((id) => id > 0)

    const result = await ensureStarterMeta({mediaTypeIds})

    if (settingsStore.ratingAndFavoriteInCard !== '1') {
      settingsStore.updateState({key: 'ratingAndFavoriteInCard', value: '1'})
      await typedApi.putSetting('ratingAndFavoriteInCard', '1')
    }

    setNotification({
      type: 'success',
      title: t('onboarding.apply_starter'),
      text: result.alreadyReady
        ? t('onboarding.starter.already_ready')
        : t('onboarding.starter.applied'),
    })

    await next()
  } catch (error) {
    console.error('Failed to apply starter library:', error)
    setNotification({
      type: 'error',
      title: t('onboarding.apply_starter'),
      text: error instanceof Error ? error.message : String(error),
    })
  } finally {
    applyingStarter.value = false
  }
}

async function openWatchedFolders() {
  await completeOnboarding()
  stepIndex.value = 0
  await router.push({path: '/settings', query: {section: 'watched_folders'}})
}

async function openAddFiles() {
  const mediaTypeId = getDefaultMediaTypeId(appStore.mediaTypes)
  const nextStep = stepIndex.value + 1
  await dismissOnboarding(nextStep)
  stepIndex.value = 0

  if (mediaTypeId) {
    await router.push(`/media?mediaTypeId=${mediaTypeId}`)
  } else {
    await router.push('/')
  }

  appShell.showAddMediaDialog()
}
</script>

<style scoped>
.onboarding-step-image {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>
