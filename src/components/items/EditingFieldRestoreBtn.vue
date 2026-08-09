<template>
  <v-btn
    class="editing-field-restore"
    :class="inline ? 'editing-field-restore--inline' : 'editing-field-restore--float'"
    v-tooltip:top="t('common.restore')"
    variant="tonal"
    color="primary"
    size="x-small"
    icon
    @click.stop="$emit('click', $event)"
  >
    <v-icon size="16">mdi-undo-variant</v-icon>
  </v-btn>
</template>

<script setup lang="ts">
import {useI18n} from 'vue-i18n'

defineProps({
  /** Place inside a field append slot (no absolute positioning). */
  inline: {
    type: Boolean,
    default: false,
  },
})

defineEmits<{
  click: [event: MouseEvent]
}>()

const {t} = useI18n()
</script>

<style lang="scss">
.editing-field-restore {
  flex-shrink: 0;
  width: 28px !important;
  height: 28px !important;
  opacity: 1 !important;
  pointer-events: auto !important;
  transition: background-color 120ms ease, transform 120ms ease;

  &:hover {
    transform: scale(1.06);
  }

  &--inline {
    position: relative;
    margin-inline: 0 2px;
  }

  &--float {
    position: absolute;
    top: 50%;
    right: 6px;
    z-index: 3;
    transform: translateY(-50%);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);

    &:hover {
      transform: translateY(-50%) scale(1.06);
    }
  }
}
</style>
