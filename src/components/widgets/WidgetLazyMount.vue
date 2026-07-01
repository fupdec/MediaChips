<template>
  <div ref="rootRef" class="widget-lazy-mount">
    <slot v-if="wasInView" />
    <div
      v-else
      class="widget-lazy-mount__placeholder"
      :style="{ minHeight }"
      aria-hidden="true"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useLazyInView } from '@/composable/useLazyInView'

withDefaults(defineProps<{
  minHeight?: string
}>(), {
  minHeight: '72px',
})

const emit = defineEmits<{
  activate: []
}>()

const rootRef = ref<HTMLElement | null>(null)
const { wasInView } = useLazyInView(rootRef)

watch(wasInView, (visible) => {
  if (visible) emit('activate')
}, { immediate: true })
</script>

<style lang="scss" scoped>
.widget-lazy-mount__placeholder {
  width: 100%;
}
</style>
