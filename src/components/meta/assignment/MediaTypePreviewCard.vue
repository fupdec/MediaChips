<template>
  <div
    :class="rootClass"
    @click="clickable && !editable ? handleClick() : undefined"
  >
    <div v-if="!hero" class="media-type-preview-card__header">
      <v-icon size="22" :color="isPinned ? 'primary' : undefined">mdi-{{ mediaType.icon }}</v-icon>
      <span class="media-type-preview-card__header-title text-body-2 font-weight-medium">{{ headerTitle }}</span>
      <v-spacer/>
      <v-btn
        v-if="isPinned && showUnpin"
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
      <v-icon v-else-if="isPinned" size="16" color="primary">mdi-pin</v-icon>
      <v-icon v-else size="16" class="text-medium-emphasis">mdi-plus-circle-outline</v-icon>
    </div>

    <div class="media-type-preview-card__preview">
      <div class="media-type-preview-card__thumb">
        <v-icon v-if="hero" size="20" color="primary">mdi-{{ mediaType.icon }}</v-icon>
      </div>
      <div class="media-type-preview-card__lines">
        <div class="media-type-preview-card__line media-type-preview-card__line--title"/>

        <draggable
          v-if="editable"
          :model-value="pinnedItems"
          item-key="metaId"
          v-bind="dragOptions"
          class="media-type-preview-card__fields"
          @update:model-value="$emit('items-change', $event)"
        >
          <template #item="{element}">
            <MetaAssignmentSlot
              :icon="element.meta?.icon"
              :name="element.meta?.name"
              compact
              :hidden="isHidden(element)"
              :show-visibility-toggle="showVisibilityToggle"
              @unpin="$emit('unpin', element)"
              @toggle-show="$emit('toggle-show', element)"
            />
          </template>

          <template #footer>
            <div
              class="media-type-preview-card__drop-slot"
              :class="{'media-type-preview-card__drop-slot--active': pinnedItems.length === 0}"
            >
              <v-icon size="14" class="mr-1">mdi-arrow-down-bold</v-icon>
              {{ t('meta.settings.drop_field_here') }}
            </div>
          </template>
        </draggable>

        <template v-else>
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
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import draggable from 'vuedraggable'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import MetaAssignmentSlot from './MetaAssignmentSlot.vue'
import type {MediaType, Meta, MediaTypePreviewField, MetaInMediaTypeRow} from '@/types/metaAssignment'

const props = withDefaults(defineProps<{
  mediaType: MediaType
  isPinned?: boolean
  highlightMeta?: Meta | null
  pinnedFields?: Meta[]
  pinnedItems?: MetaInMediaTypeRow[]
  hero?: boolean
  editable?: boolean
  showUnpin?: boolean
  clickable?: boolean
  showVisibilityToggle?: boolean
  dragGroup?: string
}>(), {
  isPinned: false,
  highlightMeta: null,
  pinnedFields: () => [],
  pinnedItems: () => [],
  hero: false,
  editable: false,
  showUnpin: true,
  clickable: true,
  showVisibilityToggle: true,
  dragGroup: 'meta-fields-assign',
})

const emit = defineEmits<{
  pin: []
  unpin: [item?: MetaInMediaTypeRow]
  click: []
  'items-change': [items: MetaInMediaTypeRow[]]
  'toggle-show': [item: MetaInMediaTypeRow]
}>()

const {t} = useI18n()

const dragOptions = computed(() => ({
  animation: 180,
  group: {name: props.dragGroup, pull: true, put: true},
  ghostClass: 'meta-assignment-slot--ghost',
}))

const rootClass = computed(() => {
  if (props.hero) return 'media-type-preview-card-hero'
  return {
    'media-type-preview-card': true,
    'media-type-preview-card--pinned': props.isPinned,
    'media-type-preview-card--available': !props.isPinned,
    'media-type-preview-card--clickable': props.clickable,
  }
})

const headerTitle = computed(() => getMediaTypeName(props.mediaType, t))

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

const isHidden = (item: MetaInMediaTypeRow) => item.show === 0 || item.show === false

const handleClick = () => {
  if (!props.clickable) return
  if (props.isPinned) {
    emit('unpin')
  } else {
    emit('pin')
  }
}
</script>
