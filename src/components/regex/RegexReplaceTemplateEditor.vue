<script setup lang="ts">
import {computed, nextTick, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'

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

const localValue = ref(props.modelValue || '$1')
const fieldRef = ref<{ $el?: HTMLElement } | null>(null)
const syncingFromProps = ref(false)

watch(() => props.modelValue, (value) => {
  const next = value || '$1'
  if (next === localValue.value) return
  syncingFromProps.value = true
  localValue.value = next
  syncingFromProps.value = false
})

watch(localValue, (value) => {
  if (syncingFromProps.value) return
  emit('update:modelValue', value || '$1')
})

const availableGroups = computed(() => {
  const fromMatch = props.groups
    .map((value, index) => ({
      index: index + 1,
      value: String(value || '').trim(),
    }))
    .filter((group) => group.value)

  if (fromMatch.length) return fromMatch

  const indexes = new Set<number>()
  const re = /\$(\d+)/g
  let match: RegExpExecArray | null
  const source = localValue.value || ''
  while ((match = re.exec(source))) {
    indexes.add(Number(match[1]))
  }
  if (!indexes.size) indexes.add(1)
  return [...indexes].sort((a, b) => a - b).map((index) => ({
    index,
    value: '',
  }))
})

const resultPreview = computed(() => {
  const groups = props.groups
  if (!groups.length) {
    return {
      type: 'warning' as const,
      text: t('regex_builder.validation_no_match'),
    }
  }

  const name = applyGroupsToTemplate(localValue.value || '$1', groups).trim()
  if (!name) {
    return {
      type: 'warning' as const,
      text: t('regex_builder.validation_no_match_extract'),
    }
  }

  return {
    type: 'success' as const,
    text: t('regex_builder.validation_extract_ok', {name}),
  }
})

function applyGroupsToTemplate(template: string, groups: string[]): string {
  return String(template || '$1').replace(/\$(\d+|\$)/g, (token, group: string) => {
    if (group === '$') return '$'
    const index = Number(group)
    if (!Number.isFinite(index) || index < 1) return token
    return groups[index - 1] ?? ''
  })
}

function groupLabel(index: number, value?: string) {
  const text = String(value ?? props.groups[index - 1] ?? '').trim()
  return text || `$${index}`
}

function getInput(): HTMLInputElement | null {
  const root = fieldRef.value?.$el
  if (!root) return null
  return root.querySelector('input')
}

function insertGroup(index: number) {
  const snippet = `$${index}`
  const el = getInput()
  const current = localValue.value || ''

  if (!el) {
    localValue.value = `${current}${snippet}`
    return
  }

  const start = el.selectionStart ?? current.length
  const end = el.selectionEnd ?? current.length
  const next = `${current.slice(0, start)}${snippet}${current.slice(end)}`
  localValue.value = next

  const caret = start + snippet.length
  nextTick(() => {
    el.focus()
    el.setSelectionRange(caret, caret)
  })
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
        @click="insertGroup(group.index)"
      >
        {{ groupLabel(group.index, group.value) }}
      </v-chip>
    </div>

    <v-text-field
      ref="fieldRef"
      v-model="localValue"
      density="compact"
      variant="outlined"
      rounded="lg"
      hide-details="auto"
      :placeholder="t('regex_builder.replace_text_placeholder')"
      :aria-label="label || t('regex_builder.replace')"
    />

    <div v-if="hint" class="text-caption text-medium-emphasis mt-1">
      {{ hint }}
    </div>

    <v-alert
      :type="resultPreview.type"
      variant="tonal"
      density="compact"
      rounded="lg"
      class="text-caption mt-3"
    >
      {{ resultPreview.text }}
    </v-alert>
  </div>
</template>

<style scoped>
.regex-replace-editor__avail {
  cursor: pointer;
}
</style>
