<template>
  <v-dialog
    :model-value="dialogsStore.feedback"
    width="720"
    scrollable
    @update:model-value="dialogsStore.feedback = $event"
  >
    <v-card rounded="xl">
      <DialogHeader
        icon="message-text-outline"
        :header="t('home.feedback_title')"
        :buttons="headerButtons"
        closable
        @close="dialogsStore.feedback = false"
      />

      <v-card-text class="pa-4 pa-sm-6">
        <p class="mb-4 text-medium-emphasis">{{ t('home.feedback_hint') }}</p>

        <v-form @submit.prevent="sendFeedback">
          <v-row>
            <v-col
              cols="12"
              md="6"
            >
              <v-text-field
                v-model="feedback.name"
                :label="t('home.feedback_name')"
                :disabled="isFeedbackSending"
                variant="outlined"
                density="comfortable"
                rounded="lg"
                hide-details="auto"
              />
            </v-col>

            <v-col
              cols="12"
              md="6"
            >
              <v-text-field
                v-model="feedback.email"
                :label="t('home.feedback_email')"
                :disabled="isFeedbackSending"
                type="email"
                variant="outlined"
                density="comfortable"
                rounded="lg"
                hide-details="auto"
              />
            </v-col>
          </v-row>

          <v-text-field
            v-model="feedback.subject"
            :label="t('home.feedback_subject')"
            :disabled="isFeedbackSending"
            class="mt-4"
            variant="outlined"
            density="comfortable"
            rounded="lg"
            hide-details="auto"
          />

          <v-textarea
            v-model="feedback.message"
            :label="t('home.feedback_message')"
            :disabled="isFeedbackSending"
            class="mt-4"
            variant="outlined"
            density="comfortable"
            rounded="lg"
            rows="4"
            hide-details="auto"
          />

          <v-file-input
            v-model="feedback.screenshots"
            :label="t('home.feedback_screenshots')"
            :hint="t('home.feedback_screenshots_hint')"
            :disabled="isFeedbackSending"
            accept="image/png,image/jpeg,image/webp,image/gif"
            class="mt-4"
            variant="outlined"
            density="comfortable"
            rounded="lg"
            prepend-icon="mdi-camera-outline"
            multiple
            chips
            show-size
            persistent-hint
            hide-details="auto"
          />

          <p class="text-caption text-medium-emphasis mt-4 mb-0">
            {{ t('home.feedback_system_info', {version: store.appVersion, os: feedbackOs}) }}
            <br>
            {{ t('home.feedback_system_info_privacy') }}
          </p>

          <v-alert
            v-if="feedbackError"
            type="error"
            class="mt-4"
            rounded="xl"
            variant="tonal"
            density="comfortable"
          >
            {{ feedbackError }}
          </v-alert>
        </v-form>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {apiClient} from '@/services/apiClient'
import {computed, reactive, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {useNotificationsStore} from '@/stores/notifications'
import {getErrorResponseData} from '@/types/vue'
import DialogHeader from '@/components/elements/DialogHeader.vue'

const store = useAppStore()
const dialogsStore = useDialogsStore()
const notificationsStore = useNotificationsStore()
const {t} = useI18n()

const feedbackApiUrl = import.meta.env.VITE_FEEDBACK_API_URL || 'https://mediachips.app/api/feedback'
const feedback = reactive({
  name: '',
  email: '',
  subject: '',
  message: '',
  screenshots: [] as File[],
})
const isFeedbackSending = ref(false)
const feedbackError = ref('')
const maxScreenshotFiles = 3

const headerButtons = computed(() => [
  {
    icon: 'send',
    text: t('home.feedback_send'),
    color: 'primary',
    disabled: !isFeedbackValid.value || isFeedbackSending.value,
    function: () => {
      void sendFeedback()
    },
  },
])

function applyFeedbackPreset() {
  const preset = dialogsStore.feedbackPreset
  feedback.subject = preset?.subject || ''
  feedback.message = preset?.message || ''
}

watch(
  () => dialogsStore.feedback,
  (visible) => {
    if (visible) {
      applyFeedbackPreset()
      return
    }

    feedbackError.value = ''
    dialogsStore.feedbackPreset = null
  },
)

const maxScreenshotSize = 5 * 1024 * 1024
const allowedScreenshotTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const platformLabels: Record<string, string> = {
  darwin: 'macOS',
  win32: 'Windows',
  linux: 'Linux',
}

function getFeedbackOs() {
  if (window.osAPI) {
    const {platform, version, arch} = window.osAPI
    const name = platformLabels[platform] || platform
    return `${name} ${version} (${arch})`
  }

  const uaData = (navigator as Navigator & {userAgentData?: {platform?: string}}).userAgentData
  return uaData?.platform || navigator.platform || 'Unknown'
}

const feedbackOs = computed(() => getFeedbackOs())
const isFeedbackValid = computed(() => {
  const email = feedback.email.trim()
  return Boolean(feedback.name.trim() && /^\S+@\S+\.\S+$/.test(email) && feedback.message.trim())
})

function getScreenshotValidationError() {
  const screenshots = feedback.screenshots || []

  if (screenshots.length > maxScreenshotFiles) {
    return t('home.feedback_screenshots_count_error', {count: maxScreenshotFiles})
  }

  const invalidType = screenshots.find(file => !allowedScreenshotTypes.includes(file.type))
  if (invalidType) {
    return t('home.feedback_screenshots_type_error')
  }

  const oversized = screenshots.find(file => file.size > maxScreenshotSize)
  if (oversized) {
    return t('home.feedback_screenshots_size_error')
  }

  return ''
}

async function sendFeedback() {
  if (isFeedbackSending.value) return

  if (!isFeedbackValid.value) {
    feedbackError.value = t('home.feedback_validation_error')
    return
  }

  const screenshotValidationError = getScreenshotValidationError()
  if (screenshotValidationError) {
    feedbackError.value = screenshotValidationError
    return
  }

  isFeedbackSending.value = true
  feedbackError.value = ''

  try {
    const formData = new FormData()
    formData.append('name', feedback.name.trim())
    formData.append('email', feedback.email.trim())
    formData.append('subject', feedback.subject.trim())
    formData.append('message', feedback.message.trim())
    formData.append('appVersion', store.appVersion)
    formData.append('os', feedbackOs.value)

    for (const screenshot of feedback.screenshots || []) {
      formData.append('screenshots[]', screenshot, screenshot.name)
    }

    await apiClient.post(feedbackApiUrl, formData)

    feedback.name = ''
    feedback.email = ''
    feedback.subject = ''
    feedback.message = ''
    feedback.screenshots = []
    dialogsStore.feedback = false

    notificationsStore.setNotification({
      type: 'success',
      text: t('home.feedback_success'),
    })
  } catch (error: unknown) {
    const data = getErrorResponseData<{message?: string}>(error)
    feedbackError.value = data?.message || t('home.feedback_error')
  } finally {
    isFeedbackSending.value = false
  }
}
</script>
