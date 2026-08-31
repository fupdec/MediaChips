<template>
  <v-dialog
    v-model="model"
    :persistent="isPersistent"
    width="420"
    scrollable
  >
    <v-card
      class="confirm-dialog"
      rounded="xl"
    >
      <v-card-text
        class="confirm-dialog__body text-center px-6"
        :class="(variant === 'delete' || variant === 'warning') ? 'pt-6' : 'pt-8'"
      >
        <div
          v-if="variant === 'delete' || variant === 'warning'"
          class="confirm-dialog__icon mb-4"
          :class="variant === 'delete' ? 'confirm-dialog__icon--error' : 'confirm-dialog__icon--warning'"
          aria-hidden="true"
        >
          <v-icon
            icon="mdi-alert-outline"
            size="28"
            :color="variant === 'delete' ? 'error' : 'warning'"
          />
        </div>

        <div
          class="confirm-dialog__text text-body-1"
          :class="variant === 'delete' ? 'error-text' : undefined"
          v-html="text"
        />

        <v-checkbox
          v-if="checkBoxText"
          :model-value="checkBox"
          :label="checkBoxText"
          color="error"
          hide-details
          density="compact"
          class="mt-4 text-left"
          @update:model-value="onPrimaryCheck(Boolean($event))"
        />
        <v-checkbox
          v-if="checkBox2Text"
          :model-value="checkBox2"
          :label="checkBox2Text"
          :disabled="checkBox2RequiresPrimary && !checkBox"
          color="error"
          hide-details
          density="compact"
          class="mt-1 text-left"
          @update:model-value="onSecondaryCheck(Boolean($event))"
        />

        <v-text-field
          v-if="confirmPhrase"
          v-model="typedPhrase"
          :label="confirmPhraseLabel || t('common.type_to_confirm', {phrase: confirmPhrase})"
          :placeholder="confirmPhrase"
          variant="outlined"
          density="compact"
          hide-details
          class="mt-4 text-left"
          autocomplete="off"
          spellcheck="false"
          @keydown.enter.prevent="confirm"
        />
      </v-card-text>

      <v-card-actions class="confirm-dialog__actions px-5 pb-5 pt-1">
        <v-btn
          v-if="closable"
          variant="text"
          rounded="pill"
          class="px-4"
          @click="close"
        >
          <v-icon
            icon="mdi-close"
            start
          />
          {{ cancelLabel }}
        </v-btn>

        <v-spacer />

        <v-btn
          :color="confirmColor"
          variant="flat"
          rounded="pill"
          class="px-5"
          :disabled="!phraseMatches"
          @click="confirm"
        >
          <v-icon
            :icon="confirmIcon"
            start
          />
          {{ confirmLabel }}
        </v-btn>

        <v-spacer v-if="!closable" />
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'

const {t} = useI18n()

const emit = defineEmits<{
  'update:dialog': [value: boolean]
  'update:checkBox': [value: boolean]
  'update:checkBox2': [value: boolean]
  close: []
  confirm: []
  delete: []
  remove: []
}>()

const props = withDefaults(defineProps<{
  dialog: boolean
  text?: string
  persistent?: boolean
  closable?: boolean
  variant?: 'confirm' | 'delete' | 'warning'
  checkBoxText?: string
  checkBox?: boolean
  checkBox2Text?: string
  checkBox2?: boolean
  /** When true, secondary checkbox is disabled until primary is checked. */
  checkBox2RequiresPrimary?: boolean
  /** When set, confirm stays disabled until this phrase is typed. */
  confirmPhrase?: string
  confirmPhraseLabel?: string
}>(), {
  text: '',
  persistent: false,
  closable: true,
  variant: 'confirm',
  checkBoxText: '',
  checkBox: false,
  checkBox2Text: '',
  checkBox2: false,
  checkBox2RequiresPrimary: false,
  confirmPhrase: '',
  confirmPhraseLabel: '',
})

const typedPhrase = ref('')

watch(() => props.dialog, (open) => {
  if (open) typedPhrase.value = ''
})

const phraseMatches = computed(() => {
  const expected = props.confirmPhrase.trim()
  if (!expected) return true
  return typedPhrase.value.trim().toLocaleLowerCase() === expected.toLocaleLowerCase()
})

const isPersistent = computed(() =>
  props.persistent || props.variant === 'delete' || props.variant === 'warning',
)

const cancelLabel = computed(() =>
  props.variant === 'confirm' ? t('common.no') : t('common.cancel'),
)

const confirmLabel = computed(() => {
  if (props.variant === 'delete') return t('common.delete')
  if (props.variant === 'warning') return t('common.confirm')
  return t('common.yes')
})

const confirmColor = computed(() => {
  if (props.variant === 'delete') return 'error'
  if (props.variant === 'warning') return 'warning'
  return 'success'
})

const confirmIcon = computed(() => 'mdi-check')

const model = computed({
  get: () => props.dialog,
  set: (val) => {
    emit('update:dialog', val)
    if (!val) emit('close')
  },
})

function onPrimaryCheck(value: boolean) {
  emit('update:checkBox', value)
  if (!value && props.checkBox2RequiresPrimary && props.checkBox2) {
    emit('update:checkBox2', false)
  }
}

function onSecondaryCheck(value: boolean) {
  emit('update:checkBox2', value)
  if (value && props.checkBox2RequiresPrimary && !props.checkBox) {
    emit('update:checkBox', true)
  }
}

function close() {
  model.value = false
}

function confirm() {
  if (!phraseMatches.value) return
  emit('confirm')
  if (props.variant === 'delete') {
    emit('delete')
    emit('remove')
  }
  model.value = false
}
</script>

<style scoped>
pre {
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.error-text {
  color: rgb(var(--v-theme-error));
}

.text-left {
  text-align: left;
}

.confirm-dialog__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 18px;
}

.confirm-dialog__icon--error {
  color: rgb(var(--v-theme-error));
  background: rgba(var(--v-theme-error), 0.12);
}

.confirm-dialog__icon--warning {
  color: rgb(var(--v-theme-warning));
  background: rgba(var(--v-theme-warning), 0.12);
}

.confirm-dialog__text {
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

.confirm-dialog__actions {
  gap: 8px;
}
</style>
