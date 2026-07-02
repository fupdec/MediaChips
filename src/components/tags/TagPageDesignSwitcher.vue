<template>
  <v-btn-toggle
    :model-value="modelValue"
    @update:model-value="onUpdate"
    :disabled="disabled || loading"
    class="tag-page-design-switcher"
    color="primary"
    density="compact"
    divided
    mandatory
    variant="outlined"
  >
    <v-btn
      v-for="option in TAG_PAGE_DESIGN_OPTIONS"
      :key="option.value"
      :value="option.value"
      :title="t(option.hintKey)"
    >
      <v-icon :icon="option.icon" start />
      <span class="d-none d-sm-inline">{{ t(option.labelKey) }}</span>
    </v-btn>
  </v-btn-toggle>
</template>

<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {
  TAG_PAGE_DESIGN_OPTIONS,
  type TagPageDesign,
} from '@/utils/tagPageDesign'

defineProps<{
  modelValue: TagPageDesign
  disabled?: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: TagPageDesign]
}>()

const {t} = useI18n()

const onUpdate = (value: TagPageDesign | null) => {
  if (!value) return
  emit('update:modelValue', value)
}
</script>
