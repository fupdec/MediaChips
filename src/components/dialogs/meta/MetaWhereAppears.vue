<template>
  <div class="meta-where-appears">
    <div v-if="loading" class="d-flex justify-center py-6">
      <v-progress-circular indeterminate size="28" width="2"/>
    </div>

    <template v-else>
      <SettingsSection padded>
        <settings-category-divider
          icon="file-outline"
          compact
          :title="t('meta.settings.pinned_to_media_types_label')"
        />
        <div class="text-caption text-medium-emphasis mb-3">
          {{ t('meta.settings.pinned_to_media_types_hint') }}
        </div>

        <v-alert
          v-if="isGroupCategory"
          type="info"
          variant="tonal"
          density="compact"
          rounded="xl"
          class="text-caption mb-3"
        >
          {{ t('meta.settings.group_cannot_pin_to_media') }}
        </v-alert>

        <template v-else>
          <div class="d-flex flex-wrap ga-2 mb-2">
            <v-chip
              v-for="item in assignedMedia"
              :key="item.mediaTypeId"
              :model-value="true"
              closable
              close-icon="mdi-close"
              variant="outlined"
              size="small"
              @click:close="askRemoveMedia(item)"
            >
              <v-icon start size="16">mdi-{{ item.mediaType?.icon || 'file' }}</v-icon>
              {{ mediaTypeLabel(item) }}
            </v-chip>

            <div
              v-if="!assignedMedia.length"
              class="text-caption text-medium-emphasis"
            >
              {{ t('meta.settings.where_appears_empty') }}
            </div>
          </div>

          <v-menu
            v-if="availableMediaTypes.length"
            :close-on-content-click="true"
            location="bottom start"
          >
            <template #activator="{ props: menuProps }">
              <v-btn
                v-bind="menuProps"
                size="small"
                variant="tonal"
                color="primary"
                rounded="lg"
                prepend-icon="mdi-plus"
              >
                {{ t('meta.settings.add_to_media_type') }}
              </v-btn>
            </template>
            <v-list density="compact" min-width="220" max-height="280" class="overflow-y-auto">
              <v-list-item
                v-for="mt in availableMediaTypes"
                :key="mt.id"
                :prepend-icon="`mdi-${mt.icon || 'file'}`"
                :title="getMediaTypeName(mt, t)"
                @click="addMediaAssignment(mt)"
              />
            </v-list>
          </v-menu>
        </template>
      </SettingsSection>

      <SettingsSection padded>
        <settings-category-divider
          icon="tag-multiple-outline"
          compact
          :title="t('meta.settings.pinned_to_tag_categories_label')"
        />
        <div class="text-caption text-medium-emphasis mb-3">
          {{ t('meta.settings.pinned_to_tag_categories_hint') }}
        </div>

        <div class="d-flex flex-wrap ga-2 mb-2">
          <v-chip
            v-for="item in assignedParents"
            :key="item.id"
            :model-value="true"
            closable
            close-icon="mdi-close"
            variant="outlined"
            size="small"
            @click:close="askRemoveParent(item)"
          >
            <v-icon start size="16">mdi-{{ item.icon || 'tag-multiple' }}</v-icon>
            {{ item.name }}
          </v-chip>

          <div
            v-if="!assignedParents.length"
            class="text-caption text-medium-emphasis"
          >
            {{ t('meta.settings.pinned_to_tag_categories_empty') }}
          </div>
        </div>

        <v-menu
          v-if="availableParentCategories.length"
          :close-on-content-click="true"
          location="bottom start"
        >
          <template #activator="{ props: menuProps }">
            <v-btn
              v-bind="menuProps"
              size="small"
              variant="tonal"
              color="primary"
              rounded="lg"
              prepend-icon="mdi-plus"
            >
              {{ t('meta.settings.add_to_tag_category') }}
            </v-btn>
          </template>
          <v-list density="compact" min-width="220" max-height="280" class="overflow-y-auto">
            <v-list-item
              v-for="category in availableParentCategories"
              :key="category.id"
              :prepend-icon="`mdi-${category.icon || 'tag-multiple'}`"
              :title="category.name"
              @click="addParentAssignment(category)"
            />
          </v-list>
        </v-menu>
      </SettingsSection>

      <SettingsSection v-if="isArrayMeta" padded class="meta-where-appears__child-board">
        <settings-category-divider
          icon="shape-outline"
          compact
          :title="t('meta.settings.child_fields_label')"
        />
        <div class="text-caption text-medium-emphasis mb-3">
          {{ t('meta.settings.child_fields_hint') }}
        </div>

        <MetaToMetaBoard
          :parent-meta="meta"
          :pinned-items="childFields"
          :all-meta="allMeta"
          @pin="addChildField"
          @unpin="askRemoveChild"
          @reorder="onChildFieldsReorder"
          @toggle-show="toggleChildVisibility"
          @create-field="createFieldDialog = true"
        />
      </SettingsSection>
    </template>

    <DialogMetaManager
      :dialog="createFieldDialog"
      :edit-mode="false"
      :meta="null"
      @created="onChildFieldCreated"
      @close="createFieldDialog = false"
    />

    <DialogConfirm
      v-if="confirmDialog"
      variant="delete"
      :dialog="confirmDialog"
      :text="confirmText"
      @close="cancelConfirm"
      @confirm="executeConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted} from 'vue'
import type {PropType} from 'vue'
import {useI18n} from 'vue-i18n'
import orderBy from 'lodash/orderBy'
import {useAppStore} from '@/stores/app'
import {useMetaAssignment} from '@/composable/useMetaAssignment'
import {reloadMetaCatalog} from '@/composable/metaCatalog'
import {typedApi} from '@/services/typedApi'
import {setNotification} from '@/services/notificationService'
import {getApiErrorMessage} from '@/types/vue'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import {isTagCategoryGroup, isTagCategoryLeaf} from '@/utils/tagCategoryTree'
import SettingsSection from '@/components/ui/SettingsSection.vue'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import DialogConfirm from '@/components/dialogs/DialogConfirm.vue'
import DialogMetaManager from '@/components/dialogs/DialogMetaManager.vue'
import MetaToMetaBoard from '@/components/meta/assignment/MetaToMetaBoard.vue'
import type {Meta} from '@/types/stores'
import type {MediaType} from '@/types/media'
import type {MetaInMediaTypeAssignment, PinnedChildMetaAssignment} from '@/types/metaAssignment'

type PendingAction =
  | {kind: 'media'; item: MetaInMediaTypeAssignment}
  | {kind: 'parent'; item: Meta}
  | {kind: 'child'; item: PinnedChildMetaAssignment}

const props = defineProps({
  meta: {
    type: Object as PropType<Meta>,
    required: true,
  },
})

const emit = defineEmits<{
  updated: []
  close: []
}>()

const {t} = useI18n()
const appStore = useAppStore()
const {
  fetchPinnedMediaForMeta,
  fetchPinnedChildMeta,
  fetchAllMeta,
  pinMetaToMediaType,
  unpinMetaFromMediaType,
  pinChildMeta,
  unpinChildMeta,
  updateChildMetaOrder,
  updateChildMetaShow,
} = useMetaAssignment()

const loading = ref(true)
const assignedMedia = ref<MetaInMediaTypeAssignment[]>([])
const assignedParents = ref<Meta[]>([])
const childFields = ref<PinnedChildMetaAssignment[]>([])
const allMeta = ref<Meta[]>([])
const confirmDialog = ref(false)
const confirmText = ref('')
const pendingAction = ref<PendingAction | null>(null)
const createFieldDialog = ref(false)

const mediaTypes = computed(() => appStore.mediaTypes || [])
const isArrayMeta = computed(() => props.meta.type === 'array')
const isGroupCategory = computed(() =>
  isArrayMeta.value && isTagCategoryGroup(props.meta, allMeta.value.length ? allMeta.value : appStore.meta || []),
)

const assignedMediaIds = computed(() => new Set(assignedMedia.value.map((a) => Number(a.mediaTypeId))))
const assignedParentIds = computed(() => new Set(assignedParents.value.map((p) => p.id)))

const availableMediaTypes = computed(() => {
  if (isGroupCategory.value) return []
  return mediaTypes.value.filter((mt) => !assignedMediaIds.value.has(Number(mt.id)))
})

const availableParentCategories = computed(() =>
  orderBy(
    allMeta.value.filter((item) =>
      isTagCategoryLeaf(item, allMeta.value)
      && item.id !== props.meta.id
      && !assignedParentIds.value.has(item.id),
    ),
    ['hidden', 'order'],
    ['asc', 'asc'],
  ),
)

const notifyAssignmentError = (error: unknown, fallbackKey: string) => {
  setNotification({
    type: 'error',
    text: getApiErrorMessage(error, t(fallbackKey)),
  })
}

const mediaTypeLabel = (item: MetaInMediaTypeAssignment) => {
  const mt = item.mediaType || mediaTypes.value.find((m) => m.id === item.mediaTypeId)
  return getMediaTypeName(mt, t)
}

const isChildHidden = (item: PinnedChildMetaAssignment) => item.show === 0 || item.show === false

const onChildFieldsReorder = async (next: PinnedChildMetaAssignment[]) => {
  if (!props.meta?.id) return
  const ordered = next.map((item, index) => ({...item, order: index}))
  childFields.value = ordered
  try {
    await Promise.all(
      ordered.map((item, index) => updateChildMetaOrder(props.meta.id, item.pinnedMetaId, index)),
    )
    emit('updated')
  } catch (e) {
    console.error('Error reordering child fields:', e)
    childFields.value = await fetchPinnedChildMeta(props.meta.id)
  }
}

const toggleChildVisibility = async (item: PinnedChildMetaAssignment) => {
  if (!props.meta?.id) return
  const nextShow = isChildHidden(item)
  try {
    await updateChildMetaShow(props.meta.id, item.pinnedMetaId, nextShow)
    const index = childFields.value.findIndex((field) => field.pinnedMetaId === item.pinnedMetaId)
    if (index >= 0) {
      childFields.value[index] = {
        ...childFields.value[index],
        show: nextShow ? 1 : 0,
      }
    }
    emit('updated')
  } catch (e) {
    console.error('Error toggling child field visibility:', e)
  }
}

const loadParents = async () => {
  if (!props.meta?.id) {
    assignedParents.value = []
    return
  }
  const response = await typedApi.getPinnedParentMeta(props.meta.id)
  const links = response.data || []
  const byId = new Map(allMeta.value.map((item) => [item.id, item]))
  assignedParents.value = orderBy(
    links
      .map((link) => byId.get(link.metaId))
      .filter((item): item is Meta => Boolean(item)),
    ['hidden', 'order'],
    ['asc', 'asc'],
  )
}

const refresh = async () => {
  if (!props.meta?.id) return
  loading.value = true
  try {
    allMeta.value = await fetchAllMeta()
    assignedMedia.value = await fetchPinnedMediaForMeta(props.meta.id)
    await loadParents()

    if (isArrayMeta.value) {
      childFields.value = await fetchPinnedChildMeta(props.meta.id)
    } else {
      childFields.value = []
    }
    emit('updated')
  } catch (e) {
    console.error('Error loading field assignments:', e)
    assignedMedia.value = []
    assignedParents.value = []
    childFields.value = []
  } finally {
    loading.value = false
  }
}

const addMediaAssignment = async (mt: MediaType) => {
  if (!props.meta?.id || !mt.id || isGroupCategory.value) return
  try {
    await pinMetaToMediaType(props.meta.id, mt.id, assignedMedia.value.length)
    await refresh()
  } catch (e) {
    console.error('Error assigning field to media type:', e)
    notifyAssignmentError(e, 'meta.settings.pin_to_media_failed')
  }
}

const addParentAssignment = async (category: Meta) => {
  if (!props.meta?.id || !category.id) return
  try {
    await pinChildMeta(category.id, props.meta.id, 0)
    await refresh()
  } catch (e) {
    console.error('Error pinning field to tag category:', e)
    notifyAssignmentError(e, 'meta.settings.pin_to_category_failed')
  }
}

const addChildField = async (field: Meta) => {
  if (!props.meta?.id || !field.id) return
  try {
    await pinChildMeta(props.meta.id, field.id, childFields.value.length)
    await refresh()
  } catch (e) {
    console.error('Error pinning child field:', e)
    notifyAssignmentError(e, 'meta.settings.pin_child_failed')
  }
}

const onChildFieldCreated = async (created: Meta) => {
  await reloadMetaCatalog()
  await refresh()
  if (created?.id) {
    await addChildField(created)
  }
}

const askRemoveMedia = (item: MetaInMediaTypeAssignment) => {
  pendingAction.value = {kind: 'media', item}
  confirmText.value = props.meta.type === 'array'
    ? t('meta.settings.unpin_media_type_tags_removed')
    : t('meta.settings.unpin_media_type_values_removed')
  confirmDialog.value = true
}

const askRemoveParent = (item: Meta) => {
  pendingAction.value = {kind: 'parent', item}
  confirmText.value = `${t('meta.settings.remove_from_all_tags')}\n${t('common.are_you_sure')}`
  confirmDialog.value = true
}

const askRemoveChild = (item: PinnedChildMetaAssignment) => {
  pendingAction.value = {kind: 'child', item}
  confirmText.value = `${t('meta.settings.remove_from_all_tags')}\n${t('common.are_you_sure')}`
  confirmDialog.value = true
}

const cancelConfirm = () => {
  confirmDialog.value = false
  pendingAction.value = null
}

const executeConfirm = async () => {
  const action = pendingAction.value
  confirmDialog.value = false
  pendingAction.value = null
  if (!action || !props.meta?.id) return

  try {
    if (action.kind === 'media') {
      await unpinMetaFromMediaType(props.meta.id, action.item.mediaTypeId)
    } else if (action.kind === 'parent') {
      await unpinChildMeta(action.item.id, props.meta.id)
    } else {
      await unpinChildMeta(props.meta.id, action.item.pinnedMetaId)
    }
    await refresh()
  } catch (e) {
    console.error('Error removing assignment:', e)
    notifyAssignmentError(e, 'meta.settings.unpin_failed')
  }
}

watch(() => props.meta?.id, () => {
  void refresh()
})

onMounted(() => {
  void refresh()
})

defineExpose({refresh})
</script>

<style scoped>
.meta-where-appears {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.meta-where-appears__child-board :deep(.meta-assignment-board) {
  margin-top: 4px;
}
</style>
