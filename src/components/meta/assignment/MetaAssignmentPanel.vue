<template>
  <div class="meta-assignment-panel">
    <v-alert
      v-if="showWarning"
      color="info"
      icon="mdi-content-save-alert"
      class="text-caption mb-4"
      variant="tonal"
      rounded="xl"
      density="compact"
    >
      {{ t('settings_labels.media_type_added_meta.irreversible_changes') }}
      <div v-if="mode === 'from-meta' && !isMetaTypeArray" class="mt-1">
        {{ t('meta.settings.only_array_child_meta') }}
      </div>
    </v-alert>

    <MetaAssignmentAnchor
      v-if="showAnchor"
      :icon="anchorIcon"
      :name="anchorName"
      :subtitle="anchorSubtitle"
      :type-label="anchorTypeLabel"
      class="meta-assignment-panel__anchor mb-4"
    />

    <v-card
      v-if="showMediaBoard || showTagsBoard"
      class="rounded-xl meta-assignment-panel__board"
      variant="flat"
    >
      <v-card-text class="pa-4">
        <MetaToMediaBoard
          v-if="showMediaBoard"
          :anchor-media-type="mediaType"
          :pinned-items="pinnedMetaItems"
          :all-meta="allMeta"
          @pin-meta="confirmPinMetaToType"
          @unpin-meta="confirmUnpinMetaFromType"
          @reorder="onMetaItemsReorder"
          @toggle-show="toggleMetaInMediaTypeShow"
        />

        <MetaToMetaBoard
          v-else-if="showTagsBoard && meta"
          :parent-meta="meta"
          :pinned-items="pinnedChildMeta"
          :all-meta="allMeta"
          @pin="confirmPinChildMeta"
          @unpin="confirmUnpinChildMeta"
          @reorder="onChildMetaReorder"
          @toggle-show="toggleChildMetaShow"
        />
      </v-card-text>
    </v-card>

    <DialogDeleteConfirm
      v-if="confirmDialog"
      :dialog="confirmDialog"
      @close="cancelConfirm"
      @confirm="executeConfirm"
      :text="confirmText"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {getTextDataType} from '@/services/metaTypeUtils'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import {useMetaAssignment} from '@/composable/useMetaAssignment'
import MetaAssignmentAnchor from './MetaAssignmentAnchor.vue'
import MetaToMediaBoard from './MetaToMediaBoard.vue'
import MetaToMetaBoard from './MetaToMetaBoard.vue'
import DialogDeleteConfirm from '@/components/dialogs/DialogDeleteConfirm.vue'

import type {
  MediaType,
  Meta,
  MetaAssignmentMode,
  MetaInMediaTypeRow,
  PinnedChildMetaAssignment,
  ConfirmAction,
} from '@/types/metaAssignment'

const props = withDefaults(defineProps<{
  mode?: MetaAssignmentMode
  meta?: Meta | null
  mediaType?: MediaType | null
  showWarning?: boolean
  showAnchor?: boolean
}>(), {
  mode: 'from-meta',
  meta: null,
  mediaType: null,
  showWarning: true,
  showAnchor: true,
})

const emit = defineEmits<{
  'pinned-meta-updated': []
  'meta-updated': [items: MetaInMediaTypeRow[]]
}>()

const {t, te} = useI18n()
const {
  fetchPinnedMetaForMediaType,
  fetchPinnedChildMeta,
  fetchAllMeta,
  pinMetaToMediaType,
  unpinMetaFromMediaType,
  updateMetaInMediaTypeOrder,
  updateMetaInMediaTypeShow,
  pinChildMeta,
  unpinChildMeta,
  updateChildMetaOrder,
  updateChildMetaShow,
} = useMetaAssignment()

const pinnedChildMeta = ref<PinnedChildMetaAssignment[]>([])
const pinnedMetaItems = ref<MetaInMediaTypeRow[]>([])
const allMeta = ref<Meta[]>([])
const confirmDialog = ref(false)
const pendingAction = ref<ConfirmAction | null>(null)

const isMetaTypeArray = computed(() => props.meta?.type === 'array')

const showMediaBoard = computed(() => props.mode === 'from-media-type')

const showTagsBoard = computed(() =>
  props.mode === 'from-meta' && isMetaTypeArray.value
)

const anchorIcon = computed(() => {
  if (props.mode === 'from-media-type') return props.mediaType?.icon || 'folder'
  return props.meta?.icon || 'shape'
})

const anchorName = computed(() => {
  if (props.mode === 'from-media-type') return getMediaTypeName(props.mediaType ?? undefined, t)
  return props.meta?.name || ''
})

const anchorSubtitle = computed((): string => {
  if (props.mode === 'from-media-type') {
    return t('meta.settings.assignment_anchor_media')
  }
  const hint = props.meta?.hint
  return hint != null && hint !== '' ? String(hint) : t('meta.settings.assignment_anchor_field')
})

const anchorTypeLabel = computed(() => {
  if (props.mode === 'from-media-type') return ''
  const type = props.meta?.type
  if (!type) return ''
  return getTextDataType(type, {te, t}) || ''
})

const loadAllMeta = async () => {
  try {
    allMeta.value = await fetchAllMeta()
  } catch (e) {
    console.error('Error loading meta:', e)
    allMeta.value = []
  }
}

const loadPinnedMetaItems = async () => {
  if (props.mode === 'from-media-type' && props.mediaType?.id) {
    try {
      pinnedMetaItems.value = await fetchPinnedMetaForMediaType(props.mediaType.id)
      emit('meta-updated', pinnedMetaItems.value)
    } catch (e) {
      console.error('Error loading pinned meta items:', e)
    }
  }
}

const loadPinnedChildMeta = async () => {
  if (props.mode === 'from-meta' && props.meta?.id && isMetaTypeArray.value) {
    try {
      pinnedChildMeta.value = await fetchPinnedChildMeta(props.meta.id)
      emit('pinned-meta-updated')
    } catch (e) {
      console.error('Error loading pinned child meta:', e)
    }
  }
}

const refresh = async () => {
  await Promise.all([
    loadPinnedMetaItems(),
    loadPinnedChildMeta(),
    loadAllMeta(),
  ])
}

const confirmText = computed(() => pendingAction.value?.text || '')

const openConfirm = (action: ConfirmAction) => {
  pendingAction.value = action
  confirmDialog.value = true
}

const cancelConfirm = async () => {
  pendingAction.value = null
  confirmDialog.value = false
  await refresh()
}

const executeConfirm = async () => {
  const action = pendingAction.value
  if (!action) return
  try {
    await action.run()
    await refresh()
  } catch (e) {
    console.error('Assignment action failed:', e)
  } finally {
    cancelConfirm()
  }
}

const confirmPinMetaToType = async (meta: Meta) => {
  if (!props.mediaType?.id) return
  try {
    const order = pinnedMetaItems.value.length
    await pinMetaToMediaType(meta.id, props.mediaType.id, order)
    await loadPinnedMetaItems()
  } catch (e) {
    console.error('Error pinning meta:', e)
  }
}

const confirmUnpinMetaFromType = (item: MetaInMediaTypeRow) => {
  if (!props.mediaType?.id || !item.meta?.id) return
  openConfirm({
    title: t('meta.dialogs.remove_meta'),
    text: `${t('meta.dialogs.remove_from_all_media')}\n${t('common.are_you_sure')}`,
    run: () => unpinMetaFromMediaType(item.meta!.id, props.mediaType!.id),
  })
}

const confirmPinChildMeta = async (childMeta: Meta) => {
  if (!props.meta?.id) return
  try {
    const order = pinnedChildMeta.value.length
    await pinChildMeta(props.meta.id, childMeta.id, order)
    await loadPinnedChildMeta()
  } catch (e) {
    console.error('Error pinning child meta:', e)
  }
}

const confirmUnpinChildMeta = (item: PinnedChildMetaAssignment) => {
  if (!props.meta?.id) return
  openConfirm({
    title: t('meta.settings.remove_pinned_meta'),
    text: `${t('meta.settings.remove_from_all_tags')}\n${t('common.are_you_sure')}`,
    run: () => unpinChildMeta(props.meta!.id, item.pinnedMetaId),
  })
}

const onChildMetaReorder = async (items: PinnedChildMetaAssignment[]) => {
  if (!props.meta?.id) return
  pinnedChildMeta.value = items
  try {
    await Promise.all(
      items.map((item, index) =>
        updateChildMetaOrder(props.meta!.id, item.pinnedMetaId, index)
      )
    )
    emit('pinned-meta-updated')
  } catch (e) {
    console.error('Error reordering child meta:', e)
    await loadPinnedChildMeta()
  }
}

const onMetaItemsReorder = async (items: MetaInMediaTypeRow[]) => {
  if (!props.mediaType?.id) return
  pinnedMetaItems.value = items
  try {
    await Promise.all(
      items.map((item, index) =>
        updateMetaInMediaTypeOrder(item.metaId, props.mediaType!.id, index)
      )
    )
    emit('meta-updated', pinnedMetaItems.value)
  } catch (e) {
    console.error('Error reordering pinned meta:', e)
    await loadPinnedMetaItems()
  }
}

const toggleMetaInMediaTypeShow = async (item: MetaInMediaTypeRow) => {
  if (!props.mediaType?.id || !item.metaId) return
  const show = !(item.show === 1 || item.show === true)
  try {
    await updateMetaInMediaTypeShow(item.metaId, props.mediaType.id, show)
    await loadPinnedMetaItems()
  } catch (e) {
    console.error('Error toggling pinned meta visibility:', e)
  }
}

const toggleChildMetaShow = async (item: PinnedChildMetaAssignment) => {
  if (!props.meta?.id) return
  const show = !(item.show === 1 || item.show === true)
  try {
    await updateChildMetaShow(props.meta.id, item.pinnedMetaId, show)
    await loadPinnedChildMeta()
  } catch (e) {
    console.error('Error toggling child meta visibility:', e)
  }
}

watch(() => props.meta, () => {
  if (props.mode === 'from-meta' && props.meta?.id) {
    refresh()
  }
}, {immediate: true})

watch(() => props.mediaType, () => {
  if (props.mode === 'from-media-type' && props.mediaType?.id) {
    refresh()
  }
}, {immediate: true})
</script>
