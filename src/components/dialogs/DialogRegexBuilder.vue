<template>
  <v-dialog
    v-model="dialogLocal"
    :fullscreen="smAndDown"
    scrollable
    width="640"
    :transition="false"
  >
    <v-card>
      <DialogHeader
        @close="dialogLocal = false"
        :header="header || t('regex_builder.dialog_title')"
        closable
        :buttons="[
          {
            icon: 'check',
            text: t('common.apply'),
            color: 'success',
            disabled: !canApply,
            function: apply,
          },
        ]"
      />

      <v-card-text class="pa-4">
        <RegexBuilder
          v-model:pattern="draftPattern"
          v-model:sample="draftSample"
          v-model:capture-text="draftCapture"
          mode="match"
          :intro="t('regex_builder.intro_match')"
        />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import RegexBuilder from '@/components/regex/RegexBuilder.vue'
import {getDefaultPathRegexSample} from '@shared/pathParser/regexGenerator'
import {validateRegexPattern} from '@shared/pathParser/regexMeta'

const props = defineProps<{
  modelValue: boolean
  pattern?: string
  header?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  apply: [pattern: string]
}>()

const {t} = useI18n()
const {smAndDown} = useDisplay()

const defaults = getDefaultPathRegexSample()
const draftPattern = ref('')
const draftSample = ref(defaults.samplePath)
const draftCapture = ref(defaults.captureText)

const dialogLocal = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const canApply = computed(() => {
  const pattern = draftPattern.value.trim()
  if (!pattern) return false
  return validateRegexPattern(pattern, 'i').ok
})

watch(() => props.modelValue, (open) => {
  if (!open) return
  draftPattern.value = String(props.pattern || '')
  if (!draftSample.value) {
    draftSample.value = defaults.samplePath
  }
  if (!draftCapture.value) {
    draftCapture.value = defaults.captureText
  }
})

function apply() {
  if (!canApply.value) return
  emit('apply', draftPattern.value.trim())
  dialogLocal.value = false
}
</script>
