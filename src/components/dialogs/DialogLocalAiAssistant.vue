<template>
  <v-dialog
    :model-value="dialogsStore.localAi.show"
    width="720"
    scrollable
    @update:model-value="onToggle"
  >
    <v-card rounded="lg" class="local-ai-dialog">
      <DialogHeader
        :header="t('settings_labels.local_ai.chat_title')"
        icon="robot-outline"
        closable
        @close="close"
      />

      <v-card-text class="pt-2">
        <v-alert
          v-if="checking"
          type="info"
          variant="tonal"
          density="compact"
          rounded="xl"
          class="mb-4"
        >
          <span class="text-caption">{{ t('common.loading') }}</span>
        </v-alert>

        <v-alert
          v-else-if="!ready"
          type="info"
          variant="tonal"
          density="compact"
          rounded="xl"
          class="mb-4"
        >
          <div class="text-caption mb-2">{{ t('settings_labels.local_ai.not_ready') }}</div>
          <v-btn size="small" color="primary" rounded variant="flat" @click="openSettings">
            {{ t('settings_labels.local_ai.open_settings') }}
          </v-btn>
        </v-alert>

        <div v-else-if="!messages.length" class="text-body-2 text-medium-emphasis mb-4">
          {{ t('settings_labels.local_ai.chat_empty') }}
        </div>

        <div ref="scrollEl" class="local-ai-dialog__messages mb-4">
          <div
            v-for="(msg, index) in messages"
            :key="index"
            class="mb-3"
            :class="msg.role === 'user' ? 'text-right' : ''"
          >
            <div
              class="local-ai-dialog__bubble text-body-2"
              :class="msg.role === 'user' ? 'local-ai-dialog__bubble--user' : 'local-ai-dialog__bubble--assistant'"
            >
              {{ msg.content }}
            </div>
            <div v-if="msg.docs?.length" class="d-flex flex-wrap ga-1 mt-1 justify-start">
              <v-chip
                v-for="doc in msg.docs"
                :key="doc.id"
                size="x-small"
                label
                variant="outlined"
                @click="openDoc(doc.id)"
              >
                {{ t('settings_labels.local_ai.open_docs') }}: {{ doc.title }}
              </v-chip>
            </div>
          </div>
          <div v-if="streamingText" class="mb-3">
            <div class="local-ai-dialog__bubble local-ai-dialog__bubble--assistant text-body-2">
              {{ streamingText }}
            </div>
          </div>
        </div>

        <div class="d-flex ga-2 align-end">
          <v-textarea
            v-model="draft"
            :placeholder="t('settings_labels.local_ai.chat_placeholder')"
            rows="2"
            auto-grow
            max-rows="6"
            density="compact"
            variant="outlined"
            rounded="lg"
            hide-details
            :disabled="!ready || busy"
            @keydown.enter.exact.prevent="send"
          />
          <v-btn
            v-if="!busy"
            color="primary"
            rounded
            variant="flat"
            :disabled="!ready || !draft.trim()"
            @click="send"
          >
            {{ t('settings_labels.local_ai.chat_send') }}
          </v-btn>
          <v-btn
            v-else
            color="error"
            rounded
            variant="flat"
            @click="stop"
          >
            {{ t('settings_labels.local_ai.chat_stop') }}
          </v-btn>
        </div>

        <div v-if="error" class="text-caption text-error mt-2">{{ error }}</div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, nextTick, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRouter} from 'vue-router'
import {useDialogsStore} from '@/stores/dialogs'
import {useSettingsStore} from '@/stores/settings'
import {useAppShell} from '@/composable/appShell'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import {typedApi} from '@/services/typedApi'
import type {LocalAiChatMessage} from '@/services/typedApi/localAi'

type ChatMsg = LocalAiChatMessage & {
  docs?: Array<{id: string; title: string}>
}

const {t, locale} = useI18n()
const router = useRouter()
const dialogsStore = useDialogsStore()
const settingsStore = useSettingsStore()
const appShell = useAppShell()

const chatLocale = computed(() =>
  String(settingsStore.locale || locale.value || 'en'),
)
const messages = ref<ChatMsg[]>([])
const draft = ref('')
const streamingText = ref('')
const busy = ref(false)
const checking = ref(false)
const error = ref('')
const ready = ref(false)
const scrollEl = ref<HTMLElement | null>(null)
let abortController: AbortController | null = null

const open = computed(() => dialogsStore.localAi.show)

function isStatusReady(status: {enabled?: boolean | string | number; status?: string}) {
  const enabled = status.enabled === true
    || status.enabled === 1
    || status.enabled === '1'
    || status.enabled === 'true'
  return enabled && ['downloaded', 'loaded'].includes(String(status.status || ''))
}

async function refreshReady() {
  checking.value = true
  try {
    const status = (await typedApi.getLocalAiStatus()).data
    ready.value = isStatusReady(status)
  } catch (err) {
    ready.value = false
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    checking.value = false
  }
}

function close() {
  stop()
  dialogsStore.localAi.show = false
}

function onToggle(value: boolean) {
  if (!value) close()
  else dialogsStore.localAi.show = true
}

async function openSettings() {
  close()
  await router.push({path: '/settings', query: {tab: 'general', section: 'local_ai'}})
}

function openDoc(id: string) {
  appShell.showDocumentation(id)
}

function stop() {
  abortController?.abort()
  abortController = null
  busy.value = false
}

async function scrollToBottom() {
  await nextTick()
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
}

async function send() {
  const text = draft.value.trim()
  if (!text || !ready.value || busy.value) return
  draft.value = ''
  error.value = ''
  messages.value.push({role: 'user', content: text})
  streamingText.value = ''
  busy.value = true
  abortController = new AbortController()
  await scrollToBottom()

  const payloadMessages = messages.value.map(({role, content}) => ({role, content}))
  let docs: Array<{id: string; title: string}> = []

  try {
    await typedApi.streamLocalAiChat(
      {
        mode: 'chat',
        locale: chatLocale.value,
        messages: payloadMessages,
      },
      abortController.signal,
      (event) => {
        if (event.type === 'token' && event.text) {
          streamingText.value += event.text
          void scrollToBottom()
        }
        if (event.type === 'done') {
          const content = event.text || streamingText.value
          docs = event.docs || []
          messages.value.push({role: 'assistant', content, docs})
          streamingText.value = ''
        }
        if (event.type === 'error') {
          error.value = event.message || t('common.error')
        }
      },
    )
  } catch (err) {
    if ((err as Error)?.name !== 'AbortError') {
      error.value = err instanceof Error ? err.message : String(err)
    }
  } finally {
    if (streamingText.value) {
      messages.value.push({role: 'assistant', content: streamingText.value, docs})
      streamingText.value = ''
    }
    busy.value = false
    abortController = null
    await scrollToBottom()
  }
}

watch(open, (value) => {
  if (value) {
    error.value = ''
    void refreshReady()
    if (dialogsStore.localAi.seedPrompt) {
      draft.value = dialogsStore.localAi.seedPrompt
      dialogsStore.localAi.seedPrompt = ''
    }
  }
}, {immediate: true})
</script>

<style scoped>
.local-ai-dialog__messages {
  max-height: 420px;
  overflow: auto;
}
.local-ai-dialog__bubble {
  display: inline-block;
  max-width: 90%;
  padding: 10px 12px;
  border-radius: 14px;
  white-space: pre-wrap;
  text-align: left;
}
.local-ai-dialog__bubble--user {
  background: rgba(var(--v-theme-primary), 0.16);
  color: rgba(var(--v-theme-on-surface), 0.92);
}
.local-ai-dialog__bubble--assistant {
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 0.92);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}
</style>
