<template>
  <v-dialog
    v-if="dialogsStore.tagCategoryMerge.show"
    :model-value="dialogsStore.tagCategoryMerge.show"
    @update:model-value="onDialogToggle"
    width="600"
    scrollable
    persistent
  >
    <v-card>
      <DialogHeader
        :header="t('meta.dialogs.merge_categories_title')"
        :subheader="t('settings.tabs.meta')"
        icon="set-merge"
        closable
        :buttons="headerButtons"
        @close="close"
      />

      <v-card-text class="pa-4">
        <div class="text-body-2 text-medium-emphasis mb-3">
          {{ t('meta.dialogs.merge_categories_hint') }}
        </div>

        <div class="merge-cat-list">
          <button
            v-for="category in categories"
            :key="category.id"
            type="button"
            class="merge-cat-row"
            :class="{
              'merge-cat-row--selected': isSelected(category),
              'merge-cat-row--keep': isSurvivor(category),
            }"
            @click="toggleSelected(Number(category.id), !isSelected(category))"
          >
            <v-checkbox
              :model-value="isSelected(category)"
              color="primary"
              density="compact"
              hide-details
              class="flex-grow-0"
              @click.stop
              @update:model-value="(value) => toggleSelected(Number(category.id), Boolean(value))"
            />

            <v-avatar
              size="36"
              rounded="lg"
              :color="isSurvivor(category) ? 'success' : (isSelected(category) ? 'primary' : undefined)"
              :variant="isSelected(category) ? 'tonal' : 'outlined'"
              class="flex-grow-0"
            >
              <v-icon size="20">mdi-{{ category.icon || 'tag-multiple-outline' }}</v-icon>
            </v-avatar>

            <div class="merge-cat-row__body min-w-0">
              <div class="text-body-2 font-weight-medium text-truncate">
                {{ category.name || `#${category.id}` }}
              </div>
              <div class="text-caption text-medium-emphasis">
                {{ t('meta.dialogs.merge_categories_tags', { count: tagCount(Number(category.id)) }) }}
              </div>
            </div>

            <div class="merge-cat-row__badges d-flex align-center ga-2 flex-grow-0">
              <v-chip
                v-if="isSurvivor(category)"
                color="success"
                size="small"
                variant="flat"
                label
              >
                {{ t('meta.dialogs.merge_categories_keep_badge') }}
              </v-chip>
              <v-chip
                v-else-if="isSelected(category)"
                color="warning"
                size="small"
                variant="tonal"
                label
              >
                {{ t('meta.dialogs.merge_categories_merge_badge') }}
              </v-chip>
              <v-btn
                v-if="isSelected(category) && !isSurvivor(category) && selectedCategories.length >= 2"
                size="small"
                variant="text"
                color="success"
                class="text-none px-2"
                @click.stop="survivorId = Number(category.id)"
              >
                {{ t('meta.dialogs.merge_categories_set_keep') }}
              </v-btn>
            </div>
          </button>
        </div>

        <v-alert
          v-if="selectedCategories.length >= 2 && survivorCategory"
          type="success"
          variant="tonal"
          density="compact"
          class="mt-4 text-caption"
          icon="mdi-arrow-collapse"
        >
          <div class="text-body-2 font-weight-medium">
            {{ t('meta.dialogs.merge_categories_summary_title', {
              name: survivorCategory.name || `#${survivorCategory.id}`,
            }) }}
          </div>
          <div class="mt-1">
            {{ t('meta.dialogs.merge_categories_summary_text', {
              count: selectedCategories.length - 1,
              tags: movingTagsCount,
            }) }}
          </div>
          <div
            v-if="collisionCount > 0"
            class="mt-1"
          >
            {{ t('meta.dialogs.merge_categories_collisions', { count: collisionCount }) }}
          </div>
        </v-alert>

        <v-alert
          v-else-if="selectedCategories.length === 1"
          type="info"
          variant="tonal"
          density="compact"
          class="mt-4 text-caption"
        >
          {{ t('meta.dialogs.merge_categories_need_two') }}
        </v-alert>

        <v-alert
          type="info"
          variant="tonal"
          density="compact"
          class="mt-4 text-caption"
        >
          {{ t('meta.dialogs.merge_categories_keep_note') }}
        </v-alert>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import {useDialogsStore} from '@/stores/dialogs'
import {useAppStore} from '@/stores/app'
import {useNotificationsStore} from '@/stores/notifications'
import {typedApi} from '@/services/typedApi'
import {useEventBus} from '@/utils/eventBus'
import {getErrorResponseData} from '@/types/vue'
import type {Meta} from '@/types/stores'

const {t} = useI18n()
const dialogsStore = useDialogsStore()
const appStore = useAppStore()
const notificationsStore = useNotificationsStore()
const eventBus = useEventBus()

const selectedIds = ref<number[]>([])
const survivorId = ref<number | null>(null)
const saving = ref(false)

const categories = computed(() => dialogsStore.tagCategoryMerge.categories)

const selectedCategories = computed(() =>
  categories.value.filter((category) => selectedIds.value.includes(Number(category.id))),
)

const survivorCategory = computed(() =>
  selectedCategories.value.find((category) => Number(category.id) === survivorId.value) ?? null,
)

const canMerge = computed(() =>
  selectedCategories.value.length >= 2
    && survivorId.value != null
    && selectedIds.value.includes(survivorId.value)
    && !saving.value,
)

const headerButtons = computed(() => [
  {
    icon: 'set-merge',
    text: t('meta.dialogs.merge_categories_confirm'),
    color: 'primary',
    disabled: !canMerge.value,
    order: 1,
    function: () => { void merge() },
  },
])

const movingTagsCount = computed(() =>
  selectedCategories.value
    .filter((category) => Number(category.id) !== survivorId.value)
    .reduce((sum, category) => sum + tagCount(Number(category.id)), 0),
)

function tagCount(metaId: number): number {
  return appStore.getTagsByMetaId(metaId).length
}

function isSelected(category: Meta): boolean {
  return selectedIds.value.includes(Number(category.id))
}

function isSurvivor(category: Meta): boolean {
  return survivorId.value != null && Number(category.id) === survivorId.value
}

function collisionCountFor(selected: Meta[]): number {
  const nameOwners = new Map<string, number>()
  let collisions = 0

  for (const category of selected) {
    const tags = appStore.tags.filter((tag) => Number(tag.metaId) === Number(category.id))
    const seenInCategory = new Set<string>()
    for (const tag of tags) {
      const key = String(tag.name ?? '').trim().toLowerCase()
      if (!key || seenInCategory.has(key)) continue
      seenInCategory.add(key)
      const owners = nameOwners.get(key) ?? 0
      if (owners > 0) collisions += 1
      nameOwners.set(key, owners + 1)
    }
  }

  return collisions
}

const collisionCount = computed(() => collisionCountFor(selectedCategories.value))

function resetSelection() {
  selectedIds.value = []
  survivorId.value = null
  saving.value = false
}

watch(
  () => dialogsStore.tagCategoryMerge.show,
  (show) => {
    if (show) resetSelection()
  },
  {immediate: true},
)

watch(selectedIds, (ids) => {
  if (survivorId.value == null || !ids.includes(survivorId.value)) {
    survivorId.value = ids[0] ?? null
  }
})

function toggleSelected(id: number, checked: boolean) {
  if (checked) {
    if (!selectedIds.value.includes(id)) selectedIds.value = [...selectedIds.value, id]
    return
  }
  selectedIds.value = selectedIds.value.filter((value) => value !== id)
}

function close() {
  if (saving.value) return
  dialogsStore.closeTagCategoryMerge()
}

function onDialogToggle(value: boolean) {
  if (!value) close()
}

async function merge() {
  if (!canMerge.value || survivorId.value == null) return

  const sourceIds = selectedIds.value.filter((id) => id !== survivorId.value)
  saving.value = true
  try {
    const res = await typedApi.mergeCategories({
      survivorId: Number(survivorId.value),
      sourceIds,
    })

    const survivor = res.data.survivor
    const deletedIds = res.data.deletedIds || []
    const autoMergedTagIds = res.data.autoMergedTagIds || []

    appStore.meta = appStore.meta.filter((item) => !deletedIds.includes(Number(item.id)))
    const survivorIndex = appStore.meta.findIndex((item) => Number(item.id) === Number(survivor.id))
    if (survivorIndex >= 0) {
      appStore.meta[survivorIndex] = {
        ...appStore.meta[survivorIndex],
        ...survivor,
        name: survivor.name ?? undefined,
        type: survivor.type ?? undefined,
      }
    }

    if (autoMergedTagIds.length) {
      appStore.tags = appStore.tags.filter((tag) => !autoMergedTagIds.includes(Number(tag.id)))
    }
    appStore.tags = appStore.tags.map((tag) => {
      if (deletedIds.includes(Number(tag.metaId))) {
        return {...tag, metaId: Number(survivor.id)}
      }
      return tag
    })

    eventBus.emit('getMeta')
    eventBus.emit('getTags')

    notificationsStore.setNotification({
      type: 'success',
      title: t('meta.dialogs.merge_categories_done'),
      text: t('meta.dialogs.merge_categories_done_text', {
        name: survivor.name || '',
        count: deletedIds.length,
        tags: res.data.migrated?.autoMergedTagPairs ?? 0,
      }),
    })

    dialogsStore.closeTagCategoryMerge()
  } catch (error) {
    console.error(error)
    notificationsStore.setNotification({
      type: 'error',
      title: t('meta.dialogs.merge_categories_failed'),
      text: getErrorResponseData<{message?: string}>(error)?.message
        || (error instanceof Error ? error.message : String(error)),
    })
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.merge-cat-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: min(420px, 50vh);
  overflow: auto;
  padding: 2px;
}

.merge-cat-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.merge-cat-row:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.merge-cat-row--selected {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.06);
}

.merge-cat-row--keep {
  border-color: rgb(var(--v-theme-success));
  background: rgba(var(--v-theme-success), 0.08);
}

.merge-cat-row__body {
  flex: 1;
}
</style>
