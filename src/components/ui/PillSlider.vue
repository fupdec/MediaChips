<script setup lang="ts">
import {computed, useAttrs} from 'vue'

// Pill-shaped wrapper around v-slider (same look as the card-size control in the
// items toolbar). Everything except class/style goes to v-slider, so v-model, min/max,
// step, color, thumb-label, @end, the thumb-label slot etc. work as on a plain v-slider.
defineOptions({inheritAttrs: false})

const attrs = useAttrs()
const sliderAttrs = computed(() => {
  const {class: _class, style: _style, ...rest} = attrs
  return rest
})
const disabled = computed(() => attrs.disabled === '' || attrs.disabled === true)
</script>

<template>
  <div class="pill-slider" :class="[attrs.class, {'pill-slider--disabled': disabled}]" :style="attrs.style as any">
    <v-slider
      :thumb-size="18"
      :track-size="6"
      color="primary"
      hide-details
      v-bind="sliderAttrs"
    >
      <template v-for="(_, name) in $slots" #[name]="slotProps">
        <slot :name="name" v-bind="slotProps || {}"/>
      </template>
    </v-slider>
  </div>
</template>

<style scoped lang="scss">
// 32px pill: same as the items-per-page track in the toolbar. Side padding keeps the
// thumb and its halo inside: the thumb centre sits on the track ends, so half of it
// hangs outside the slider box.
.pill-slider {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  box-sizing: border-box;
  min-width: 0;
  height: 32px;
  padding: 0 16px;
  border-radius: 999px;
  background: rgba(var(--v-theme-surface), 0.9);
  border: 1px solid rgba(var(--v-theme-primary), 0.22);

  &--disabled {
    opacity: 0.6;
  }

  :deep(.v-input) {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
  }

  :deep(.v-input__control) {
    min-height: 30px;
  }

  :deep(.v-slider-track__background) {
    opacity: 0.2;
  }

  // Soft highlight over the fill: lighter at the start, solid at the thumb.
  :deep(.v-slider-track__fill) {
    background-image: linear-gradient(90deg, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0));
  }

  :deep(.v-slider-thumb__surface) {
    box-shadow:
      0 0 0 3px rgb(var(--v-theme-surface)),
      0 2px 6px rgba(var(--v-theme-primary), 0.4);
  }

  // Vuetify draws the hover/focus halo as ::before scaled x2, which would cross the
  // pill edge; keep it x1.5 (still inside the 16px side padding).
  :deep(.v-slider-thumb:hover .v-slider-thumb__surface::before),
  :deep(.v-slider-thumb--focused .v-slider-thumb__surface::before) {
    transform: scale(1.5);
  }
}
</style>
