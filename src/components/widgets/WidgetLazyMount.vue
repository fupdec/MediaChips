<template>
  <div
    ref="rootRef"
    class="widget-lazy-mount"
    :class="{'widget-lazy-mount--pending': !wasInView}"
    :style="wasInView ? undefined : {minHeight}"
  >
    <slot v-if="wasInView"/>
    <div
      v-else
      class="widget-lazy-mount__placeholder"
      aria-hidden="true"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, watch} from 'vue'
import {useLazyInView} from '@/composable/useLazyInView'

withDefaults(defineProps<{
  minHeight?: string
}>(), {
  minHeight: '72px',
})

const emit = defineEmits<{
  activate: []
}>()

const rootRef = ref<HTMLElement | null>(null)
const {wasInView} = useLazyInView(rootRef)

watch(wasInView, (visible) => {
  if (visible) emit('activate')
}, {immediate: true})
</script>

<style lang="scss" scoped>
.widget-lazy-mount {
  width: 100%;
  box-sizing: border-box;

  // Only contain layout while reserving space for not-yet-mounted widgets.
  // After mount, empty widgets (v-if="items.length") must collapse to avoid gaps.
  &--pending {
    contain: layout;
  }
}

.widget-lazy-mount__placeholder {
  width: 100%;
  min-height: inherit;
}
</style>
