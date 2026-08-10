<template>
  <div class="mx-4">
    <SettingsCategoryDivider
      :title="t('settings_labels.library.tag_categories')"
      icon="tag-multiple-outline"
    />

    <div class="d-flex align-center flex-wrap ga-2 mb-4">
      <v-btn
        color="success"
        rounded="xl"
        variant="flat"
        prepend-icon="mdi-plus"
        :text="t('all_tags.add_category')"
        @click="openCreateCategory"
      />

      <v-btn
        variant="text"
        size="small"
        color="primary"
        class="text-none"
        prepend-icon="mdi-tag-multiple-outline"
        :to="{name: 'AllTags'}"
        :text="t('navigation.all_tags')"
      />
    </div>

    <div
      v-if="!tagCategories.length"
      class="text-medium-emphasis text-body-2 mb-5"
    >
      {{ t('settings_labels.library.tag_categories_empty') }}
    </div>

    <v-chip-group
      v-else
      column
      class="settings-tag-categories__chips mb-5"
    >
      <v-chip
        v-for="category in tagCategories"
        :key="category.id"
        class="settings-tag-categories__chip"
        :class="{'settings-tag-categories__chip--hidden': category.hidden}"
        @click="openEditCategory(category)"
        @contextmenu.prevent.stop="showCategoryChipMenu($event, category)"
      >
        <v-icon start size="18">mdi-{{ category.icon || 'tag-multiple-outline' }}</v-icon>
        <span>{{ category.name }}</span>
        <v-icon
          v-if="Number(category.id) === defaultCategoryId"
          end
          size="16"
          color="amber-darken-2"
        >
          mdi-star
        </v-icon>
      </v-chip>
    </v-chip-group>

    <SettingsDefaultTagCategory />

    <div class="settings-tag-categories__merge mt-5">
      <div class="settings-tag-categories__merge-copy">
        <div class="text-body-1 text-high-emphasis">
          {{ t('meta.dialogs.merge_categories_title') }}
        </div>
        <div class="text-caption text-medium-emphasis mt-1">
          {{ t('settings_labels.library.merge_tag_categories_hint') }}
        </div>
      </div>

      <v-btn
        v-if="tagCategories.length >= 2"
        variant="tonal"
        color="primary"
        class="text-none settings-tag-categories__merge-btn"
        rounded="xl"
        prepend-icon="mdi-set-merge"
        :text="t('meta.dialogs.merge_categories_confirm')"
        @click="openCategoryMerge"
      />
    </div>

    <DialogMetaManager
      :edit-mode="metaEditMode"
      :meta="metaForDialog"
      :dialog="metaDialog"
      :initial-tab="metaInitialTab"
      :allowed-types="['array']"
      @updated="onMetaChanged"
      @created="onMetaCreated"
      @close="closeMetaDialog"
      @delete="onMetaChanged"
      @request-edit="onRequestEdit"
    />

    <DialogConfirm
      v-if="deleteConfirmDialog"
      variant="delete"
      :dialog="deleteConfirmDialog"
      :text="deleteConfirmText"
      @close="cancelDeleteCategory"
      @delete="confirmDeleteCategory"
    />
  </div>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRouter} from 'vue-router'
import orderBy from 'lodash/orderBy'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import SettingsDefaultTagCategory from '@/components/settings/library/SettingsDefaultTagCategory.vue'
import DialogMetaManager from '@/components/dialogs/DialogMetaManager.vue'
import DialogConfirm from '@/components/dialogs/DialogConfirm.vue'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {useSettingsStore} from '@/stores/settings'
import {useContextMenu} from '@/stores/contextMenu'
import {reloadMetaCatalog} from '@/composable/metaCatalog'
import {getDefaultTagCategoryId} from '@/services/ensureStarterMeta'
import {typedApi} from '@/services/typedApi'
import {setNotification} from '@/services/notificationService'
import type {ContextMenuEntry, Meta} from '@/types/stores'

type EditTab = 'basics' | 'where' | 'appearance' | 'capabilities' | 'from-path'
type MetaToggleKey = 'hidden' | 'rating' | 'favorite' | 'synonyms' | 'bookmark' | 'country' | 'parser' | 'marks'

const {t} = useI18n()
const router = useRouter()
const appStore = useAppStore()
const settingsStore = useSettingsStore()
const dialogsStore = useDialogsStore()
const contextMenuStore = useContextMenu()

const metaDialog = ref(false)
const metaEditMode = ref(false)
const metaForDialog = ref<Meta | null>(null)
const metaInitialTab = ref<EditTab | null>(null)
const deleteConfirmDialog = ref(false)
const categoryPendingDelete = ref<Meta | null>(null)

const tagCategories = computed(() =>
  orderBy(
    (appStore.meta || []).filter((item) => item.type === 'array'),
    ['hidden', 'order', 'name'],
    ['asc', 'asc', 'asc'],
  ),
)

const defaultCategoryId = computed(() =>
  getDefaultTagCategoryId(appStore.meta, settingsStore.defaultTagCategoryId),
)

const deleteConfirmText = computed(() => {
  const item = categoryPendingDelete.value
  if (!item) return ''
  return [
    t('meta.dialogs.delete_meta_assigned_confirm'),
    t('meta.dialogs.delete_meta_tags_confirm'),
    t('common.are_you_sure'),
  ].join('\n')
})

const openCreateCategory = () => {
  metaEditMode.value = false
  metaForDialog.value = null
  metaInitialTab.value = null
  metaDialog.value = true
}

const openEditCategory = (category: Meta, tab: EditTab | null = null) => {
  metaEditMode.value = true
  metaForDialog.value = category
  metaInitialTab.value = tab
  metaDialog.value = true
}

const closeMetaDialog = () => {
  metaDialog.value = false
  metaForDialog.value = null
  metaInitialTab.value = null
}

const onMetaChanged = async () => {
  await reloadMetaCatalog()
  closeMetaDialog()
}

const onMetaCreated = async () => {
  await reloadMetaCatalog()
  closeMetaDialog()
}

const onRequestEdit = async (payload: {
  meta: Meta
  tab?: EditTab
}) => {
  await reloadMetaCatalog()
  const fresh = tagCategories.value.find((item) => item.id === payload.meta.id) || payload.meta
  openEditCategory(fresh, payload.tab || 'basics')
}

const openCategoryMerge = () => {
  if (tagCategories.value.length < 2) return
  dialogsStore.openTagCategoryMerge(tagCategories.value)
}

const duplicateCategory = async (category: Meta) => {
  if (!category?.id) return

  try {
    const {data} = await typedApi.duplicateMeta({id: Number(category.id)})
    const created = data.meta
    setNotification({
      type: 'success',
      title: t('meta.dialogs.duplicate_category_done'),
      text: t('meta.dialogs.duplicate_category_done_text', {
        name: created.name || '',
      }),
    })
    await reloadMetaCatalog()
    const fresh = tagCategories.value.find((item) => item.id === created.id) || created
    openEditCategory(fresh)
  } catch (error) {
    console.error('Error duplicating category:', error)
    setNotification({
      type: 'error',
      text: t('meta.dialogs.duplicate_category_failed'),
    })
  }
}

const requestDeleteCategory = (category: Meta) => {
  categoryPendingDelete.value = category
  deleteConfirmDialog.value = true
}

const cancelDeleteCategory = () => {
  deleteConfirmDialog.value = false
  categoryPendingDelete.value = null
}

const confirmDeleteCategory = async () => {
  const item = categoryPendingDelete.value
  deleteConfirmDialog.value = false
  categoryPendingDelete.value = null
  if (!item?.id) return

  try {
    await typedApi.deleteMeta(item.id)
    setNotification({
      type: 'success',
      title: t('meta.dialogs.meta_deleted', {name: item.name}),
    })
    await reloadMetaCatalog()
  } catch (error) {
    console.error('Error deleting category:', error)
    setNotification({
      type: 'error',
      text: t('meta.dialogs.failed_delete'),
    })
  }
}

const updateMetaFlag = async (
  metaItem: Meta,
  key: MetaToggleKey,
  value: boolean,
) => {
  if (!metaItem.id) return
  try {
    await typedApi.updateMeta(metaItem.id, {[key]: value})
    await reloadMetaCatalog()
  } catch (error) {
    console.error(`Failed updating meta.${key}`, error)
    setNotification({
      type: 'error',
      text: t('meta.dialogs.failed_add'),
    })
  }
}

const flagMenuItem = (
  metaItem: Meta,
  key: MetaToggleKey,
  name: string,
): ContextMenuEntry => {
  const enabled = Boolean(metaItem[key])
  return {
    name,
    type: 'item',
    icon: enabled ? 'checkbox-marked' : 'checkbox-blank-outline',
    action: () => {
      void updateMetaFlag(metaItem, key, !enabled)
    },
  }
}

const showCategoryChipMenu = (e: MouseEvent, category: Meta) => {
  const content: ContextMenuEntry[] = [
    {
      name: t('common.edit'),
      type: 'item',
      icon: 'pencil',
      action: () => openEditCategory(category),
    },
    {
      name: t('common.duplicate'),
      type: 'item',
      icon: 'content-duplicate',
      action: () => {
        void duplicateCategory(category)
      },
    },
    {
      name: t('context_menu.open_page'),
      type: 'item',
      icon: 'open-in-app',
      action: () => {
        void router.push({path: '/meta', query: {metaId: category.id}})
      },
    },
    {type: 'divider'},
    {
      name: category.hidden
        ? t('meta.settings.show_in_navigation')
        : t('meta.settings.hide_in_navigation'),
      type: 'item',
      icon: category.hidden ? 'eye' : 'eye-off',
      action: () => {
        void updateMetaFlag(category, 'hidden', !category.hidden)
      },
    },
    {type: 'divider'},
    {
      name: t('meta.dialogs.tab_where'),
      type: 'item',
      icon: 'pin',
      action: () => openEditCategory(category, 'where'),
    },
    {
      name: t('meta.dialogs.tab_appearance'),
      type: 'item',
      icon: 'palette-outline',
      action: () => openEditCategory(category, 'appearance'),
    },
    {
      name: t('meta.dialogs.tab_capabilities'),
      type: 'item',
      icon: 'shape',
      action: () => openEditCategory(category, 'capabilities'),
    },
    {
      name: t('meta.dialogs.tab_from_path'),
      type: 'item',
      icon: 'folder-search-outline',
      action: () => openEditCategory(category, 'from-path'),
    },
    {type: 'divider'},
    {
      name: t('meta.settings.preset_meta_in_tags'),
      type: 'menu',
      icon: 'shape',
      menu: [
        flagMenuItem(category, 'rating', t('meta.types.rating')),
        flagMenuItem(category, 'favorite', t('meta.sorting.favorite')),
        flagMenuItem(category, 'synonyms', t('filters.sort.synonyms')),
        flagMenuItem(category, 'bookmark', t('player.controls.bookmark')),
        flagMenuItem(category, 'country', t('meta.types.country')),
      ],
    },
    flagMenuItem(category, 'parser', t('meta.settings.parse_media_for_tags')),
    {type: 'divider'},
    {
      name: t('common.delete'),
      type: 'item',
      icon: 'delete',
      color: 'error',
      action: () => requestDeleteCategory(category),
    },
  ]

  contextMenuStore.showContextMenu({
    x: e.clientX,
    y: e.clientY,
    content,
  })
}
</script>

<style scoped>
.settings-tag-categories__chips {
  margin: -4px;
}

.settings-tag-categories__chip {
  justify-content: flex-start;
}

.settings-tag-categories__chip--hidden {
  opacity: 0.55;
}

.settings-tag-categories__merge {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.settings-tag-categories__merge-copy {
  min-width: 0;
  flex: 1 1 auto;
}

.settings-tag-categories__merge-btn {
  flex: 0 0 auto;
}

@media (max-width: 720px) {
  .settings-tag-categories__merge {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
