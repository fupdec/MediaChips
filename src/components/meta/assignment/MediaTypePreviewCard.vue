<template>
  <div
    :class="rootClass"
    @click="clickable ? handleClick() : undefined"
  >
    <div class="media-type-preview-card__header">
      <v-icon v-if="!hero" size="22" :color="isPinned ? 'primary' : undefined">mdi-{{ mediaType.icon }}</v-icon>
      <span
        class="media-type-preview-card__header-title"
        :class="hero ? 'text-caption text-medium-emphasis' : 'text-body-2 font-weight-medium'"
      >{{ headerTitle }}</span>
      <v-spacer v-if="!hero"/>
      <v-icon v-if="!hero && isPinned" size="16" color="primary">mdi-pin</v-icon>
      <v-icon v-else-if="!hero" size="16" class="text-medium-emphasis">mdi-plus-circle-outline</v-icon>
    </div>

    <div class="media-type-preview-card__preview">
      <div class="media-type-preview-card__thumb"/>
      <div class="media-type-preview-card__lines">
        <div class="media-type-preview-card__line media-type-preview-card__line--title"/>
        <div
          v-for="field in previewFields"
          :key="field.id"
          class="media-type-preview-card__field"
          :class="{'media-type-preview-card__field--active': field.active}"
        >
          <v-icon size="12">mdi-{{ field.icon }}</v-icon>
          <span>{{ field.name }}</span>
        </div>
        <div v-if="!previewFields.length" class="media-type-preview-card__line media-type-preview-card__line--short"/>
      </div>
    </div>

    <v-btn
      v-if="!hero && isPinned && showUnpin"
      class="media-type-preview-card__unpin"
      icon
      size="x-small"
      variant="text"
      color="error"
      :title="t('meta.settings.click_to_unpin')"
      @click.stop="$emit('unpin')"
    >
      <v-icon size="16">mdi-close</v-icon>
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import type {MediaType, Meta, MediaTypePreviewField} from '@/types/metaAssignment'

const props = withDefaults(defineProps<{
  mediaType: MediaType
  isPinned?: boolean
  highlightMeta?: Meta | null
  pinnedFields?: Meta[]
  hero?: boolean
  showUnpin?: boolean
  clickable?: boolean
}>(), {
  isPinned: false,
  highlightMeta: null,
  pinnedFields: () => [],
  hero: false,
  showUnpin: true,
  clickable: true,
})

const emit = defineEmits<{
  pin: []
  unpin: []
  click: []
}>()

const {t} = useI18n()

const rootClass = computed(() => {
  if (props.hero) return 'media-type-preview-card-hero'
  return {
    'media-type-preview-card': true,
    'media-type-preview-card--pinned': props.isPinned,
    'media-type-preview-card--available': !props.isPinned,
    'media-type-preview-card--clickable': props.clickable,
  }
})

const headerTitle = computed(() =>
  props.hero
    ? t('meta.settings.media_card_pinned_fields_layout')
    : getMediaTypeName(props.mediaType, t),
)

const previewFields = computed((): MediaTypePreviewField[] => {
  if (props.pinnedFields.length) {
    return props.pinnedFields.map((meta) => ({
      id: meta.id,
      icon: meta.icon,
      name: meta.name,
      active: props.highlightMeta?.id === meta.id,
    }))
  }
  if (props.highlightMeta && props.isPinned) {
    return [{
      id: props.highlightMeta.id,
      icon: props.highlightMeta.icon,
      name: props.highlightMeta.name,
      active: true,
    }]
  }
  return []
})

const handleClick = () => {
  if (!props.clickable) return
  if (props.isPinned) {
    emit('unpin')
  } else {
    emit('pin')
  }
}
</script>
