<template>
  <v-dialog
    v-if="dialogsStore.textPreview.show"
    :model-value="dialogsStore.textPreview.show"
    @update:model-value="onDialogToggle"
    :width="xl ? 960 : 820"
    :fullscreen="xs"
    scrollable
  >
    <v-card class="text-preview-dialog">
      <DialogHeader
        :header="fileName"
        :subheader="subheader"
        icon="file-document-outline"
        :buttons="headerButtons"
        closable
        @close="close"
      />

      <v-card-text class="text-preview-dialog__body">
        <div
          v-if="findOpen && !isHtml"
          class="text-preview-dialog__find"
        >
          <v-text-field
            v-model="findQuery"
            density="compact"
            hide-details
            variant="outlined"
            :placeholder="t('media.text_preview.find_placeholder')"
            prepend-inner-icon="mdi-magnify"
            clearable
            @keydown.enter.prevent="goToNextFind"
            @keydown.esc.prevent="closeFind"
          />
          <div class="text-preview-dialog__find-meta text-medium-emphasis">
            <span v-if="findTotal">
              {{ t('media.text_preview.find_count', {current: findIndex + 1, total: findTotal}) }}
            </span>
            <span v-else-if="findQuery.trim()">
              {{ t('media.text_preview.find_none') }}
            </span>
          </div>
          <v-btn
            icon="mdi-chevron-up"
            variant="text"
            size="small"
            :disabled="!findTotal"
            @click="goToPrevFind"
          />
          <v-btn
            icon="mdi-chevron-down"
            variant="text"
            size="small"
            :disabled="!findTotal"
            @click="goToNextFind"
          />
          <v-btn
            icon="mdi-close"
            variant="text"
            size="small"
            @click="closeFind"
          />
        </div>

        <v-progress-linear
          v-if="loading"
          indeterminate
          color="primary"
          class="mb-3"
        />

        <v-alert
          v-if="error"
          type="error"
          variant="tonal"
          density="compact"
          class="mb-3"
        >
          {{ error }}
        </v-alert>

        <v-alert
          v-else-if="warning"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-3"
        >
          {{ warning }}
        </v-alert>

        <iframe
          v-if="!loading && !error && isHtml && htmlSrcdoc != null"
          class="text-preview-dialog__iframe"
          sandbox=""
          :srcdoc="htmlSrcdoc"
          :title="fileName"
        />

        <pre
          v-else-if="!loading && !error && content != null"
          ref="preEl"
          class="text-preview-dialog__pre"
          @keydown="onPreKeydown"
        ><template v-if="findParts.length"><template
            v-for="(part, i) in findParts"
            :key="i"
          ><mark
              v-if="part.match"
              class="text-preview-dialog__mark"
              :class="{'text-preview-dialog__mark--active': part.idx === findIndex}"
              :data-find-idx="part.idx"
            >{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></template><template v-else>{{ content }}</template></pre>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, nextTick, ref, watch} from 'vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import {useDialogsStore} from '@/stores/dialogs'
import {buildLocalFileUrl} from '@/services/fileService'
import {openPath} from '@/services/shellService'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import {
  TEXT_PREVIEW_MAX_BYTES,
  getFileExtension,
  isHtmlTextPreviewExtension,
  looksLikeBinaryText,
} from '@/utils/textPreview'

type FindPart = {text: string; match: boolean; idx: number}

const {t} = useI18n()
const {xs, xl} = useDisplay()
const dialogsStore = useDialogsStore()

const loading = ref(false)
const error = ref('')
const warning = ref('')
const content = ref<string | null>(null)
const truncated = ref(false)
const findOpen = ref(false)
const findQuery = ref('')
const findIndex = ref(0)
const preEl = ref<HTMLElement | null>(null)

const media = computed(() => dialogsStore.textPreview.media)
const filePath = computed(() => String(media.value?.path || ''))
const fileName = computed(() => {
  const path = filePath.value
  return path.split(/[/\\]/).pop() || path || t('media.text_preview.untitled')
})
const extension = computed(() => getFileExtension(filePath.value))
const isHtml = computed(() => isHtmlTextPreviewExtension(extension.value))

const subheader = computed(() => {
  if (!filePath.value) return ''
  return filePath.value
})

const findParts = computed((): FindPart[] => {
  const text = content.value
  const q = findQuery.value.trim()
  if (!text || !q || isHtml.value) return []

  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  const parts: FindPart[] = []
  let cursor = 0
  let matchIdx = 0
  let pos = lower.indexOf(needle, cursor)
  while (pos !== -1) {
    if (pos > cursor) {
      parts.push({text: text.slice(cursor, pos), match: false, idx: -1})
    }
    parts.push({text: text.slice(pos, pos + needle.length), match: true, idx: matchIdx})
    matchIdx += 1
    cursor = pos + needle.length
    pos = lower.indexOf(needle, cursor)
  }
  if (cursor < text.length) {
    parts.push({text: text.slice(cursor), match: false, idx: -1})
  }
  return parts
})

const findTotal = computed(() => findParts.value.filter((part) => part.match).length)

const headerButtons = computed(() => ([
  {
    icon: 'magnify',
    text: t('media.text_preview.find'),
    color: 'secondary',
    outlined: true,
    order: 0,
    disabled: !content.value || isHtml.value,
    action: () => {
      openFind()
    },
  },
  {
    icon: 'pencil',
    text: t('media.text_preview.edit'),
    color: 'secondary',
    outlined: true,
    order: 1,
    disabled: !media.value,
    action: () => {
      const item = media.value
      if (!item) return
      dialogsStore.editMedia(item)
    },
  },
  {
    icon: 'open-in-new',
    text: t('media.text_preview.open_external'),
    color: 'secondary',
    outlined: true,
    order: 2,
    disabled: !filePath.value,
    action: () => {
      if (filePath.value) void openPath(filePath.value)
    },
  },
]))

const htmlSrcdoc = computed(() => {
  if (!isHtml.value || content.value == null) return null
  // sandbox="" already blocks scripts; keep srcdoc as-is for layout fidelity.
  return content.value
})

function onDialogToggle(open: boolean) {
  if (!open) close()
}

function close() {
  dialogsStore.closeTextPreview()
}

function resetState() {
  loading.value = false
  error.value = ''
  warning.value = ''
  content.value = null
  truncated.value = false
  findOpen.value = false
  findQuery.value = ''
  findIndex.value = 0
}

function openFind() {
  if (isHtml.value || !content.value) return
  findOpen.value = true
  void nextTick(() => {
    const input = document.querySelector('.text-preview-dialog__find input') as HTMLInputElement | null
    input?.focus()
    input?.select()
  })
}

function closeFind() {
  findOpen.value = false
  findQuery.value = ''
  findIndex.value = 0
}

function goToNextFind() {
  if (!findTotal.value) return
  findIndex.value = (findIndex.value + 1) % findTotal.value
  scrollActiveFindIntoView()
}

function goToPrevFind() {
  if (!findTotal.value) return
  findIndex.value = (findIndex.value - 1 + findTotal.value) % findTotal.value
  scrollActiveFindIntoView()
}

function scrollActiveFindIntoView() {
  void nextTick(() => {
    const root = preEl.value
    if (!root) return
    const el = root.querySelector(`[data-find-idx="${findIndex.value}"]`) as HTMLElement | null
    el?.scrollIntoView({block: 'center', behavior: 'smooth'})
  })
}

function onPreKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    openFind()
  }
}

async function loadPreview() {
  resetState()
  const path = filePath.value
  if (!path) {
    error.value = t('media.text_preview.missing')
    return
  }

  loading.value = true
  try {
    const url = buildLocalFileUrl(path, true)
    const headers: Record<string, string> = {}

    let knownSize: number | null = null
    try {
      const head = await fetch(url, {method: 'HEAD'})
      if (head.ok) {
        const length = Number(head.headers.get('content-length'))
        if (Number.isFinite(length) && length >= 0) knownSize = length
      }
    } catch {
      // HEAD may be unavailable; fall through to GET.
    }

    if (knownSize != null && knownSize > TEXT_PREVIEW_MAX_BYTES) {
      truncated.value = true
      warning.value = t('media.text_preview.too_large', {
        maxMb: (TEXT_PREVIEW_MAX_BYTES / (1024 * 1024)).toFixed(1),
      })
      headers.Range = `bytes=0-${TEXT_PREVIEW_MAX_BYTES - 1}`
    }

    const response = await fetch(url, {headers})
    if (response.status === 404) {
      error.value = t('media.text_preview.missing')
      return
    }
    if (!response.ok) {
      error.value = t('media.text_preview.load_failed')
      return
    }

    let text = await response.text()
    if (!truncated.value && text.length * 2 > TEXT_PREVIEW_MAX_BYTES) {
      // UTF-16-ish size estimate; also hard-cap characters when Range was ignored.
      const maxChars = Math.floor(TEXT_PREVIEW_MAX_BYTES / 2)
      if (text.length > maxChars) {
        text = text.slice(0, maxChars)
        truncated.value = true
        warning.value = t('media.text_preview.truncated')
      }
    } else if (truncated.value && !warning.value) {
      warning.value = t('media.text_preview.truncated')
    }

    if (looksLikeBinaryText(text)) {
      error.value = t('media.text_preview.binary')
      content.value = null
      return
    }

    content.value = text
  } catch {
    error.value = t('media.text_preview.load_failed')
  } finally {
    loading.value = false
  }
}

watch(
  () => [dialogsStore.textPreview.show, filePath.value] as const,
  ([show]) => {
    if (show) void loadPreview()
    else resetState()
  },
  {immediate: true},
)

watch(findTotal, (total) => {
  if (!total) {
    findIndex.value = 0
    return
  }
  if (findIndex.value >= total) findIndex.value = 0
  scrollActiveFindIntoView()
})

watch(
  () => dialogsStore.textPreview.show,
  (show, _prev, onCleanup) => {
    if (!show) return
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        if (isHtml.value || !content.value) return
        event.preventDefault()
        openFind()
      }
    }
    window.addEventListener('keydown', onKey)
    onCleanup(() => window.removeEventListener('keydown', onKey))
  },
)
</script>

<style scoped>
.text-preview-dialog__body {
  min-height: 280px;
  max-height: min(72vh, 760px);
  display: flex;
  flex-direction: column;
}

.text-preview-dialog__find {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}

.text-preview-dialog__find :deep(.v-field) {
  min-height: 36px;
}

.text-preview-dialog__find-meta {
  min-width: 72px;
  font-size: 12px;
  text-align: right;
  white-space: nowrap;
}

.text-preview-dialog__pre {
  margin: 0;
  padding: 12px 14px;
  flex: 1;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.45;
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.text-preview-dialog__mark {
  background: rgba(var(--v-theme-warning), 0.35);
  color: inherit;
  border-radius: 2px;
}

.text-preview-dialog__mark--active {
  background: rgba(var(--v-theme-warning), 0.75);
}

.text-preview-dialog__iframe {
  flex: 1;
  width: 100%;
  min-height: 420px;
  border: 0;
  border-radius: 12px;
  background: #fff;
}
</style>
