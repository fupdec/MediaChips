<template>
  <div
    class="meta-assignment-slot"
    :class="{
      'meta-assignment-slot--compact': compact,
      'meta-assignment-slot--hidden': hidden,
      'meta-assignment-slot--ghost': ghost,
    }"
  >
    <v-icon
      v-if="!compact"
      size="14"
      class="meta-assignment-slot__drag text-medium-emphasis"
    >
      mdi-drag
    </v-icon>

    <v-icon :size="compact ? 12 : 16" color="primary" class="meta-assignment-slot__icon">
      mdi-{{ icon }}
    </v-icon>

    <span class="meta-assignment-slot__name" :class="compact ? '' : 'text-body-2'">{{ name }}</span>

    <v-icon
      v-if="!compact && typeIcon"
      size="12"
      class="meta-assignment-slot__type text-medium-emphasis"
    >
      {{ typeIcon }}
    </v-icon>

    <div class="meta-assignment-slot__actions">
      <v-btn
        v-if="showVisibilityToggle"
        class="meta-assignment-slot__visibility"
        icon
        :size="compact ? 'x-small' : 'x-small'"
        variant="text"
        :color="hidden ? 'medium-emphasis' : 'primary'"
        :title="hidden ? t('meta.settings.show_on_card') : t('meta.settings.hide_on_card')"
        @click.stop="$emit('toggle-show')"
      >
        <v-icon :size="compact ? 12 : 14">{{ hidden ? 'mdi-eye-off-outline' : 'mdi-eye-outline' }}</v-icon>
      </v-btn>

      <v-btn
        class="meta-assignment-slot__unpin"
        icon
        size="x-small"
        variant="text"
        color="error"
        :title="t('meta.settings.click_to_unpin')"
        @click.stop="$emit('unpin')"
      >
        <v-icon :size="compact ? 12 : 14">mdi-close</v-icon>
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import {useI18n} from 'vue-i18n'

withDefaults(defineProps<{
  icon?: string
  name?: string
  typeIcon?: string
  compact?: boolean
  hidden?: boolean
  ghost?: boolean
  showVisibilityToggle?: boolean
}>(), {
  icon: 'shape',
  name: '',
  typeIcon: '',
  compact: false,
  hidden: false,
  ghost: false,
  showVisibilityToggle: true,
})

defineEmits<{
  unpin: []
  'toggle-show': []
}>()

const {t} = useI18n()
</script>
