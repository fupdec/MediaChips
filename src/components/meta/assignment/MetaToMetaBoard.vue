<template>
  <div class="meta-to-meta-board">
    <div class="meta-assignment-board">
      <aside class="meta-assignment-board__pool">
        <div class="text-caption text-medium-emphasis mb-3">
          <v-icon size="14" start>mdi-drag</v-icon>
          {{ t('meta.settings.assignment_fields_drag_hint') }}
        </div>

        <MetaFieldPool
          :items="allMeta"
          :exclude-ids="excludedIds"
          :disabled-ids="disabledMetaIds"
          drag-group="child-meta-assign"
          :empty-text="t('meta.settings.all_meta_pinned')"
          @select="$emit('pin', $event)"
        />
      </aside>

      <main class="meta-assignment-board__target">
        <div class="meta-assignment-board__target-header text-caption text-medium-emphasis mb-2">
          {{ t('meta.settings.pinned_fields') }}
        </div>

        <v-card class="meta-to-meta-board__preview rounded-xl pa-2" variant="flat">
          <div class="media-type-preview-card__preview">
            <div class="media-type-preview-card__thumb meta-to-meta-board__thumb">
              <v-icon size="20" color="primary">mdi-{{ parentMeta.icon }}</v-icon>
            </div>

            <div class="media-type-preview-card__lines">
              <draggable
                v-if="pinnedItems.length"
                :model-value="pinnedItems"
                item-key="pinnedMetaId"
                v-bind="dragOptions"
                class="media-type-preview-card__fields"
                @update:model-value="onPinnedChange"
              >
                <template #item="{element}">
                  <MetaAssignmentSlot
                    :icon="element.meta?.icon"
                    :name="element.meta?.name"
                    compact
                    :hidden="isHidden(element)"
                    @unpin="$emit('unpin', element)"
                    @toggle-show="$emit('toggle-show', element)"
                  />
                </template>

                <template #footer>
                  <div class="media-type-preview-card__drop-slot">
                    <v-icon size="14" class="mr-1">mdi-arrow-down-bold</v-icon>
                    {{ t('meta.settings.drop_field_here') }}
                  </div>
                </template>
              </draggable>

              <div
                v-else
                class="media-type-preview-card__drop-slot media-type-preview-card__drop-slot--active"
              >
                <v-icon size="14" class="mr-1">mdi-arrow-down-bold</v-icon>
                {{ t('meta.settings.drop_field_here') }}
              </div>
            </div>
          </div>
        </v-card>

        <div v-if="pinnedItems.length" class="text-caption text-medium-emphasis mt-2">
          <v-icon size="14" start>mdi-drag</v-icon>
          {{ t('meta.settings.drag_to_reorder_or_unpin') }}
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import draggable from 'vuedraggable'
import MetaFieldPool from './MetaFieldPool.vue'
import MetaAssignmentSlot from './MetaAssignmentSlot.vue'
import type {Meta, PinnedChildMetaAssignment} from '@/types/metaAssignment'

const props = withDefaults(defineProps<{
  parentMeta: Meta
  pinnedItems?: PinnedChildMetaAssignment[]
  allMeta?: Meta[]
}>(), {
  pinnedItems: () => [],
  allMeta: () => [],
})

const emit = defineEmits<{
  pin: [meta: Meta]
  unpin: [item: PinnedChildMetaAssignment]
  reorder: [items: PinnedChildMetaAssignment[]]
  'toggle-show': [item: PinnedChildMetaAssignment]
}>()

const {t} = useI18n()

const dragOptions = {
  animation: 180,
  group: {name: 'child-meta-assign', pull: true, put: true},
  ghostClass: 'meta-assignment-slot--ghost',
}

const excludedIds = computed(() => props.pinnedItems.map((i) => i.pinnedMetaId))

const disabledMetaIds = computed(() => {
  if (!props.parentMeta?.id) return []
  return [props.parentMeta.id]
})

const isHidden = (item: PinnedChildMetaAssignment) => item.show === 0 || item.show === false

const findAddedMeta = (next: PinnedChildMetaAssignment[], prev: PinnedChildMetaAssignment[]) => {
  const prevIds = new Set(prev.map((item) => item.pinnedMetaId))
  return next.find((item) => !prevIds.has(item.pinnedMetaId))
}

const findRemovedMeta = (next: PinnedChildMetaAssignment[], prev: PinnedChildMetaAssignment[]) => {
  const nextIds = new Set(next.map((item) => item.pinnedMetaId))
  return prev.find((item) => !nextIds.has(item.pinnedMetaId))
}

const onPinnedChange = (next: PinnedChildMetaAssignment[]) => {
  const prev = props.pinnedItems

  if (next.length > prev.length) {
    const added = findAddedMeta(next, prev)
    if (added?.pinnedMetaId) {
      emit('reorder', next)
      return
    }
    if (added) {
      emit('pin', added as unknown as Meta)
    }
    return
  }

  if (next.length < prev.length) {
    const removed = findRemovedMeta(next, prev)
    if (removed) emit('unpin', removed)
    return
  }

  emit('reorder', next)
}
</script>
