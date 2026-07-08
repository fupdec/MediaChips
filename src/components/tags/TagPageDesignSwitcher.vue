<template>
  <v-radio-group
    :model-value="modelValue"
    @update:model-value="onUpdate"
    :disabled="disabled || loading"
    class="tag-page-design-switcher"
    hide-details
    inline
    mandatory
  >
    <v-radio
      v-for="option in TAG_PAGE_DESIGN_OPTIONS"
      :key="option.value"
      :value="option.value"
      :title="t(option.hintKey)"
    >
      <template v-slot:label>
        <span class="d-inline-flex align-center">
          <v-icon :icon="option.icon" start size="small" />
          <span class="d-none d-sm-inline">{{ t(option.labelKey) }}</span>
        </span>
      </template>
    </v-radio>
  </v-radio-group>
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
