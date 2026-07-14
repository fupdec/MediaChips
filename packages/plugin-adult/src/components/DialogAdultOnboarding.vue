<template>
  <v-dialog
    :model-value="dialogs.adultOnboarding.show"
    persistent
    width="560"
    @update:model-value="onDialogToggle"
  >
    <v-card rounded="lg">
      <DialogHeader
        :header="t('adult_onboarding.title')"
        :subheader="stepSubheader"
        icon="shield-search"
        closable
        @close="close"
      />

      <v-card-text class="pt-2 pb-0">
        <v-progress-linear
          :model-value="progress"
          color="primary"
          height="4"
          rounded
          class="mb-5"
        />

        <div class="text-h6 mb-2">{{ currentStep.title }}</div>
        <p class="text-body-2 text-medium-emphasis mb-0">{{ currentStep.body }}</p>
      </v-card-text>

      <v-card-actions class="px-4 pb-4 pt-4 flex-wrap ga-2">
        <v-spacer />

        <v-btn
          v-if="stepIndex > 0"
          variant="text"
          @click="stepIndex -= 1"
        >
          {{ t('adult_onboarding.back') }}
        </v-btn>

        <v-btn
          v-if="currentStep.action"
          color="primary"
          variant="tonal"
          @click="runAction(currentStep.action)"
        >
          {{ currentStep.actionLabel }}
        </v-btn>

        <v-btn
          v-if="currentStep.secondaryAction"
          color="primary"
          variant="tonal"
          @click="runAction(currentStep.secondaryAction)"
        >
          {{ currentStep.secondaryActionLabel }}
        </v-btn>

        <v-btn
          v-if="isLastStep"
          color="primary"
          variant="flat"
          @click="close"
        >
          {{ t('adult_onboarding.finish') }}
        </v-btn>

        <v-btn
          v-else
          color="primary"
          variant="flat"
          @click="stepIndex += 1"
        >
          {{ t('adult_onboarding.next') }}
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
import {closeAdultOnboarding} from '@/composable/useAdultOnboarding'

type AdultOnboardingAction = 'media' | 'library' | 'scraper' | 'oshash'

const {t} = useI18n()
const router = useRouter()
const dialogs = useDialogsStore()
const appStore = useAppStore()

const stepIndex = ref(0)

watch(
  () => dialogs.adultOnboarding.show,
  (show) => {
    if (show) {
      stepIndex.value = 0
    }
  },
)

const steps = computed(() => [
  {
    title: t('adult_onboarding.steps.welcome.title'),
    body: t('adult_onboarding.steps.welcome.body'),
    action: null as AdultOnboardingAction | null,
    actionLabel: '',
    secondaryAction: null as AdultOnboardingAction | null,
    secondaryActionLabel: '',
  },
  {
    title: t('adult_onboarding.steps.media.title'),
    body: t('adult_onboarding.steps.media.body'),
    action: 'media' as AdultOnboardingAction,
    actionLabel: t('adult_onboarding.open_library'),
    secondaryAction: null as AdultOnboardingAction | null,
    secondaryActionLabel: '',
  },
  {
    title: t('adult_onboarding.steps.metadata.title'),
    body: t('adult_onboarding.steps.metadata.body'),
    action: 'library' as AdultOnboardingAction,
    actionLabel: t('adult_onboarding.open_library_settings'),
    secondaryAction: 'scraper' as AdultOnboardingAction,
    secondaryActionLabel: t('adult_onboarding.open_scraper_settings'),
  },
  {
    title: t('adult_onboarding.steps.oshash.title'),
    body: t('adult_onboarding.steps.oshash.body'),
    action: 'oshash' as AdultOnboardingAction,
    actionLabel: t('adult_onboarding.open_oshash'),
    secondaryAction: null as AdultOnboardingAction | null,
    secondaryActionLabel: '',
  },
  {
    title: t('adult_onboarding.steps.scenes.title'),
    body: t('adult_onboarding.steps.scenes.body'),
    action: 'scraper' as AdultOnboardingAction,
    actionLabel: t('adult_onboarding.open_scraper_settings'),
    secondaryAction: null as AdultOnboardingAction | null,
    secondaryActionLabel: '',
  },
  {
    title: t('adult_onboarding.steps.performers.title'),
    body: t('adult_onboarding.steps.performers.body'),
    action: 'scraper' as AdultOnboardingAction,
    actionLabel: t('adult_onboarding.open_scraper_settings'),
    secondaryAction: null as AdultOnboardingAction | null,
    secondaryActionLabel: '',
  },
])

const currentStep = computed(() => steps.value[stepIndex.value] ?? steps.value[0])
const isLastStep = computed(() => stepIndex.value >= steps.value.length - 1)
const progress = computed(() => ((stepIndex.value + 1) / steps.value.length) * 100)
const stepSubheader = computed(() =>
  t('adult_onboarding.step_counter', {
    current: stepIndex.value + 1,
    total: steps.value.length,
  }),
)

function close() {
  closeAdultOnboarding()
  stepIndex.value = 0
}

function onDialogToggle(value: boolean) {
  if (!value) {
    close()
  }
}

async function runAction(action: AdultOnboardingAction) {
  if (action === 'media') {
    await openMediaLibrary()
    return
  }
  if (action === 'library') {
    await closeAndGo('/settings', {tab: 'library'})
    return
  }
  if (action === 'scraper') {
    await closeAndGo('/settings', {tab: 'plugins', section: 'adult_scraper'})
    return
  }
  await closeAndGo('/settings', {tab: 'database', section: 'oshash_backfill'})
}

async function closeAndGo(path: string, query?: Record<string, string>) {
  close()
  await router.push({path, query})
}

async function openMediaLibrary() {
  const mediaTypeId = getDefaultMediaTypeId(appStore.mediaTypes)
  close()

  if (mediaTypeId) {
    await router.push(`/media?mediaTypeId=${mediaTypeId}`)
    return
  }

  await router.push('/')
}
</script>
