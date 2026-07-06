<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="close"
    @after-leave="close"
    width="300"
  >
    <v-card>
      <div class="pa-2">
        <v-btn
          @click="apply"
          color="success"
          block
          rounded
          variant="flat"
          prepend-icon="mdi-check"
        >
          {{ t('common.apply') }}
        </v-btn>
      </div>
      <v-color-picker
        :model-value="palette"
        @update:model-value="changeColor"
        :modes="['hex']"
      />
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const {t} = useI18n()

const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true
  },
  color: {
    type: String,
    default: '#ffab00'
  }
})

const emit = defineEmits(['update:modelValue', 'getColor', 'close'])

const palette = ref(props.color)

// Синхронизируем начальное значение
onMounted(() => {
  palette.value = props.color
})

// Отслеживаем изменения цвета извне
watch(() => props.color, (newColor) => {
  palette.value = newColor
})

const changeColor = (value: string | { hex?: string }) => {
  // В Vuetify 3 v-color-picker возвращает объект
  palette.value = typeof value === 'object' ? (value.hex ?? props.color) : value
}

const resolvePaletteHex = (value: unknown): string => {
  if (typeof value === 'string' && value.length > 0) return value
  if (value && typeof value === 'object' && 'hex' in value) {
    const hex = (value as {hex?: string}).hex
    if (hex) return hex
  }
  return props.color
}

const apply = () => {
  emit('getColor', resolvePaletteHex(palette.value))
  emit('update:modelValue', false)
}

const close = () => {
  emit('close')
  emit('update:modelValue', false)
}
</script>