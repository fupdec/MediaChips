<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'

export type ReplaceToken =
  | {type: 'text'; value: string}
  | {type: 'group'; index: number}

const props = withDefaults(defineProps<{
  modelValue?: string
  /** Captured group values; index 0 = $1 */
  groups?: string[]
  label?: string
  hint?: string
}>(), {
  modelValue: '$1',
  groups: () => [],
  label: '',
  hint: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const {t} = useI18n()

const tokens = ref<ReplaceToken[]>(parseReplaceTemplate(props.modelValue || '$1'))
const draftText = ref('')
const syncingFromProps = ref(false)

watch(() => props.modelValue, (value) => {
  const next = value || '$1'
  const serialized = serializeReplaceTokens(tokens.value)
  if (next === serialized) return
  syncingFromProps.value = true
  tokens.value = parseReplaceTemplate(next)
  syncingFromProps.value = false
})

watch(tokens, () => {
  if (syncingFromProps.value) return
  emit('update:modelValue', serializeReplaceTokens(tokens.value) || '$1')
}, {deep: true})

const availableGroups = computed(() => {
  const fromMatch = props.groups
    .map((value, index) => ({
      index: index + 1,
      value: String(value || '').trim(),
    }))
    .filter((group) => group.value)

  if (fromMatch.length) return fromMatch

  // Fallback: groups referenced in the current template
  const indexes = new Set<number>()
  for (const token of tokens.value) {
    if (token.type === 'group' && token.index > 0) indexes.add(token.index)
  }
  if (!indexes.size) indexes.add(1)
  return [...indexes].sort((a, b) => a - b).map((index) => ({
    index,
    value: '',
  }))
})

function groupLabel(index: number, value?: string) {
  const text = String(value ?? props.groups[index - 1] ?? '').trim()
  return text || `$${index}`
}

function parseReplaceTemplate(template: string): ReplaceToken[] {
  const source = String(template || '')
  if (!source.trim()) return [{type: 'group', index: 1}]

  const result: ReplaceToken[] = []
  const re = /\$(\d+|\$)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(source))) {
    if (match.index > lastIndex) {
      result.push({type: 'text', value: source.slice(lastIndex, match.index)})
    }
    if (match[1] === '$') {
      result.push({type: 'text', value: '$'})
    } else {
      result.push({type: 'group', index: Number(match[1])})
    }
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < source.length) {
    result.push({type: 'text', value: source.slice(lastIndex)})
  }

  return result.length ? result : [{type: 'group', index: 1}]
}

function serializeReplaceTokens(list: ReplaceToken[]): string {
  return list.map((token) => (
    token.type === 'group' ? `$${token.index}` : token.value
  )).join('')
}

function appendGroup(index: number) {
  flushDraftText()
  tokens.value = [...tokens.value, {type: 'group', index}]
}

function removeToken(index: number) {
  const next = tokens.value.filter((_, i) => i !== index)
  tokens.value = next.length ? next : [{type: 'group', index: 1}]
}

function updateTextToken(index: number, value: string) {
  const next = [...tokens.value]
  const token = next[index]
  if (!token || token.type !== 'text') return
  if (!value) {
    next.splice(index, 1)
    tokens.value = next.length ? next : [{type: 'group', index: 1}]
    return
  }
  next[index] = {type: 'text', value}
  tokens.value = next
}

function flushDraftText() {
  const value = draftText.value
  if (!value) return
  tokens.value = [...tokens.value, {type: 'text', value}]
  draftText.value = ''
}

function onDraftEnter(event: KeyboardEvent) {
  event.preventDefault()
  flushDraftText()
}

function onDraftBackspace() {
  if (draftText.value) return
  if (!tokens.value.length) return
  const last = tokens.value[tokens.value.length - 1]
  if (last.type === 'group') {
    removeToken(tokens.value.length - 1)
  }
}
</script>

<template>
  <div class="regex-replace-editor">
    <div class="text-caption text-medium-emphasis mb-2">
      {{ label || t('regex_builder.replace') }}
    </div>

    <div
      v-if="availableGroups.length"
      class="d-flex flex-wrap ga-2 mb-2"
    >
      <span class="text-caption text-medium-emphasis align-self-center">
        {{ t('regex_builder.replace_insert') }}
      </span>
      <v-chip
        v-for="group in availableGroups"
        :key="`avail-${group.index}`"
        size="small"
        label
        color="primary"
        variant="tonal"
        class="regex-replace-editor__avail"
        @click="appendGroup(group.index)"
      >
        {{ groupLabel(group.index, group.value) }}
      </v-chip>
    </div>

    <div class="regex-replace-editor__field">
      <template v-for="(token, index) in tokens" :key="`${token.type}-${index}`">
        <v-chip
          v-if="token.type === 'group'"
          size="small"
          label
          color="primary"
          variant="flat"
          closable
          class="regex-replace-editor__chip"
          @click:close="removeToken(index)"
        >
          {{ groupLabel(token.index) }}
        </v-chip>
        <input
          v-else
          class="regex-replace-editor__text"
          :value="token.value"
          :style="{width: `${Math.max(2, token.value.length + 1)}ch`}"
          :aria-label="t('regex_builder.replace_text')"
          @input="updateTextToken(index, String(($event.target as HTMLInputElement).value))"
        >
      </template>

      <input
        v-model="draftText"
        class="regex-replace-editor__draft"
        :placeholder="tokens.length ? '' : t('regex_builder.replace_text_placeholder')"
        :aria-label="t('regex_builder.replace_text')"
        @keydown.enter="onDraftEnter"
        @keydown.backspace="onDraftBackspace"
        @blur="flushDraftText"
      >
    </div>

    <div v-if="hint" class="text-caption text-medium-emphasis mt-1">
      {{ hint }}
    </div>
  </div>
</template>

<style scoped>
.regex-replace-editor__avail {
  cursor: pointer;
}

.regex-replace-editor__field {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 6px 10px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  background: transparent;
}

.regex-replace-editor__field:focus-within {
  border-color: rgb(var(--v-theme-primary));
}

.regex-replace-editor__chip {
  flex: 0 0 auto;
}

.regex-replace-editor__text,
.regex-replace-editor__draft {
  flex: 1 1 48px;
  min-width: 48px;
  max-width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: 1.4;
  padding: 2px 0;
}

.regex-replace-editor__text {
  flex: 0 1 auto;
  min-width: 24px;
  width: auto;
}
</style>
