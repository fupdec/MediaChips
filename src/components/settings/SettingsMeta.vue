<template>
  <div class="mx-4">
    <SettingsCategoryDivider
      :title="t('settings.tabs.meta')"
      icon="shape-outline"
    />

    <div class="meta-toolbar">
      <div class="meta-toolbar__actions d-flex align-center flex-wrap ga-2">
        <v-btn
          color="success"
          rounded="xl"
          variant="flat"
          prepend-icon="mdi-plus"
          :text="t('meta.dialogs.add_new_meta')"
          @click="openCreateDialog"
        ></v-btn>

        <v-btn
          variant="text"
          size="small"
          color="primary"
          class="meta-docs-link"
          @click="showMetaDocs"
        >
          <v-icon start size="18">mdi-help-circle-outline</v-icon>
          {{ t('meta.dialogs.custom_metadata_docs') }}
        </v-btn>
      </div>

      <template v-if="initiated && meta.length">
        <div class="meta-fields-section mt-6">
          <div class="meta-fields__caption text-caption text-medium-emphasis mb-2">
            {{ t('meta.dialogs.fields_section_label') }}
          </div>

          <div class="meta-toolbar__filters d-flex align-center flex-wrap ga-4 mb-4">
            <v-text-field
              v-model="search"
              class="meta-toolbar__search"
              prepend-inner-icon="mdi-magnify"
              :placeholder="t('common.quick_search_placeholder')"
              hide-details
              autofocus
              clearable
              variant="outlined"
              density="compact"
              rounded="pill"
              bg-color="surface"
              max-width="420"
            ></v-text-field>

            <v-switch
              :model-value="groupMode === META_GROUP_BY_MODES.type"
              :label="t('settings_labels.meta.group_label')"
              hide-details
              density="compact"
              color="primary"
              inset
              class="meta-toolbar__group-by flex-grow-0"
              @update:model-value="setGroupByType"
            />
          </div>
        </div>
      </template>
    </div>

    <div v-if="!meta.length" class="settings-empty text-center py-10 px-4 mt-3">
      <div class="settings-empty__icon mb-3" aria-hidden="true">
        <v-icon icon="mdi-shape-outline" size="28"/>
      </div>
      <div class="text-body-1 font-weight-medium mb-1">
        {{ t('meta.dialogs.meta_missing_add_first') }}
      </div>
      <div class="text-caption text-medium-emphasis">
        {{ t('meta.dialogs.meta_empty_hint') }}
      </div>
    </div>

    <template v-else-if="!isSearchEmpty">
      <div
        v-if="groupMode !== META_GROUP_BY_MODES.type"
        class="meta-type-filters d-flex flex-wrap ga-2 mb-3"
      >
        <v-chip
          size="small"
          label
          :color="typeFilter === null ? 'primary' : undefined"
          :variant="typeFilter === null ? 'flat' : 'outlined'"
          @click="typeFilter = null"
        >
          {{ t('settings_labels.meta.filter_all_types') }}
        </v-chip>
        <v-chip
          v-for="typeOption in availableTypeFilters"
          :key="typeOption.value"
          size="small"
          label
          :color="typeFilter === typeOption.value ? 'primary' : undefined"
          :variant="typeFilter === typeOption.value ? 'flat' : 'outlined'"
          @click="typeFilter = typeOption.value"
        >
          <v-icon start size="16">{{ typeOption.icon }}</v-icon>
          {{ typeOption.title }}
        </v-chip>
      </div>

      <template v-if="groupMode === META_GROUP_BY_MODES.type">
        <div
          v-for="group in groupedFields"
          :key="`key_${metaKey}_param_${group.type}`"
          class="meta-group mb-3"
        >
          <div class="meta-group__label d-flex align-center text-subtitle-2 text-medium-emphasis ps-2 mb-1">
            <v-icon color="grey" start>{{ getIconDataType(group.type) }}</v-icon>
            <span>{{ formatDataType(group.type) }}</span>
          </div>

          <v-chip-group column>
            <v-chip
              v-for="m in group.items"
              :key="`key_${metaKey}__id_${m.id}`"
              class="ma-1"
              @click="openEditDialog(m)"
              @contextmenu.prevent.stop="showMetaChipMenu($event, m)"
            >
              <v-icon size="20" start>mdi-{{ m.icon }}</v-icon>
              <span v-html="highlightChars(m.name ?? '', search ?? '')"/>
            </v-chip>
          </v-chip-group>
        </div>
      </template>

      <v-chip-group v-else column class="meta-fields-flat mb-3">
        <v-chip
          v-for="m in flatFields"
          :key="`key_${metaKey}__id_${m.id}`"
          class="ma-1"
          @click="openEditDialog(m)"
          @contextmenu.prevent.stop="showMetaChipMenu($event, m)"
        >
          <v-icon size="20" start>mdi-{{ m.icon }}</v-icon>
          <span v-html="highlightChars(m.name ?? '', search ?? '')"/>
        </v-chip>
      </v-chip-group>
    </template>

    <div v-if="meta.length && isSearchEmpty" class="settings-empty text-center py-10 px-4 mt-4">
      <v-img src="/images/filters/filters-no-results-meta.svg" max-height="120" class="mb-3 mx-auto" contain></v-img>
      <div class="text-body-1 font-weight-medium">
        {{ t('meta.dialogs.no_meta_found') }}
      </div>
    </div>

    <MetaManager
      :edit-mode="editMode"
      :meta="selectedMeta"
      :dialog="editDialog"
      :initial-tab="initialEditTab"
      :allowed-types="[...META_FIELD_TYPES]"
      @updated="getMeta"
      @close="closeEditDialog"
      @request-edit="onRequestEdit"
      @delete="getMeta"
    />

    <DialogConfirm
      v-if="deleteConfirmDialog"
      variant="delete"
      :dialog="deleteConfirmDialog"
      :text="deleteConfirmText"
      @close="cancelDeleteMeta"
      @delete="confirmDeleteMeta"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRouter} from 'vue-router'
import {useSettingsStore} from '@/stores/settings'
import {useAppStore} from '@/stores/app'
import {useContextMenu} from '@/stores/contextMenu'
import {useAppShell} from '@/composable/appShell'
import {reloadMetaCatalog} from '@/composable/metaCatalog'
import {typedApi} from '@/services/typedApi'
import {setNotification} from '@/services/notificationService'
import isEmpty from 'lodash/isEmpty'
import MetaManager from '@/components/dialogs/DialogMetaManager.vue'
import DialogConfirm from '@/components/dialogs/DialogConfirm.vue'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import {
  groupMetaByType,
  META_GROUP_BY_MODES,
  META_SORT_MODES,
  META_TYPE_ORDER,
  sortMetaItems,
  type MetaGroupByMode,
} from '@/utils/metaSort'
import {highlightChars} from '@/services/formatUtils'
import {getIconDataType, getTextDataType} from '@/services/metaTypeUtils'
import {setOption} from '@/services/settingsService'
import type {ContextMenuEntry, Meta} from '@/types/stores'

const settingsStore = useSettingsStore()
const appStore = useAppStore()
const contextMenuStore = useContextMenu()
const appShell = useAppShell()
const router = useRouter()
const {t, te} = useI18n()

/** Tag categories (`array`) live in Settings → Tag categories. */
const META_FIELD_TYPES = ['string', 'number', 'boolean', 'date', 'rating'] as const

const formatDataType = (type: string) => getTextDataType(type, {te, t})

const meta = ref<Meta[]>([])
const search = ref('')
const typeFilter = ref<string | null>(null)
const initiated = ref(false)
const selectedMeta = ref<Meta | null>(null)
const editDialog = ref(false)
const editMode = ref(false)
const initialEditTab = ref<'basics' | 'where' | 'appearance' | 'capabilities' | 'from-path' | null>(null)
const metaKey = ref(0)
const deleteConfirmDialog = ref(false)
const metaPendingDelete = ref<Meta | null>(null)

const groupMode = computed((): MetaGroupByMode =>
  (settingsStore.meta_group_by as MetaGroupByMode) || META_GROUP_BY_MODES.none,
)

const searchedMeta = computed(() => {
  const searchTerm = search.value?.toLowerCase() || ''
  return meta.value.filter((item) => {
    if (!searchTerm) return true
    return (item.name ?? '').toLowerCase().includes(searchTerm)
  })
})

const availableTypeFilters = computed(() => {
  const present = new Set(
    meta.value
      .map((item) => String(item.type || ''))
      .filter(Boolean),
  )
  const ordered = [
    ...META_TYPE_ORDER.filter((type) => present.has(type)),
    ...[...present].filter((type) => !META_TYPE_ORDER.includes(type)).sort(),
  ]
  return ordered.map((type) => ({
    value: type,
    title: formatDataType(type),
    icon: getIconDataType(type) || 'mdi-shape-outline',
  }))
})

const visibleMeta = computed(() => {
  const filtered = typeFilter.value
    ? searchedMeta.value.filter((item) => item.type === typeFilter.value)
    : searchedMeta.value
  return sortMetaItems(filtered, META_SORT_MODES.alphabet)
})

const flatFields = computed(() => visibleMeta.value)

const groupedFields = computed(() => {
  const grouped = groupMetaByType(visibleMeta.value, META_SORT_MODES.alphabet)
  return Object.entries(grouped).map(([type, items]) => ({type, items}))
})

const deleteConfirmText = computed(() => {
  const item = metaPendingDelete.value
  if (!item) return ''
  let text = t('meta.dialogs.delete_meta_assigned_confirm') + '\n'
  if (item.type === 'array') {
    text += t('meta.dialogs.delete_meta_tags_confirm') + '\n'
  }
  text += t('common.are_you_sure')
  return text
})

const setGroupByType = (value: boolean | null) => {
  if (value) typeFilter.value = null
  setOption(
    value ? META_GROUP_BY_MODES.type : META_GROUP_BY_MODES.none,
    'meta_group_by',
  )
}

const isSearchEmpty = computed(() => isEmpty(visibleMeta.value))

const getMeta = async (_type?: string) => {
  try {
    initiated.value = false

    await reloadMetaCatalog()
    meta.value = appStore.meta.filter((item) => item.type !== 'array')

    metaKey.value = Date.now()
  } catch (error) {
    console.error('Error fetching meta:', error)
  } finally {
    initiated.value = true
  }
}

const openCreateDialog = () => {
  editMode.value = false
  selectedMeta.value = null
  initialEditTab.value = null
  editDialog.value = true
}

const openEditDialog = (
  metaItem: Meta,
  tab: 'basics' | 'where' | 'appearance' | 'capabilities' | 'from-path' | null = null,
) => {
  selectedMeta.value = metaItem
  editMode.value = true
  initialEditTab.value = tab
  editDialog.value = true
}

const closeEditDialog = () => {
  editDialog.value = false
  selectedMeta.value = null
  initialEditTab.value = null
}

const onRequestEdit = async (payload: {
  meta: Meta
  tab?: 'basics' | 'where' | 'appearance' | 'capabilities' | 'from-path'
}) => {
  await getMeta()
  const fresh = meta.value.find((item) => item.id === payload.meta.id) || payload.meta
  openEditDialog(fresh, payload.tab || 'basics')
}

const requestDeleteMeta = (metaItem: Meta) => {
  metaPendingDelete.value = metaItem
  deleteConfirmDialog.value = true
}

const cancelDeleteMeta = () => {
  deleteConfirmDialog.value = false
  metaPendingDelete.value = null
}

const confirmDeleteMeta = async () => {
  const item = metaPendingDelete.value
  deleteConfirmDialog.value = false
  metaPendingDelete.value = null
  if (!item?.id) return

  try {
    await typedApi.deleteMeta(item.id)
    setNotification({
      type: 'success',
      title: t('meta.dialogs.meta_deleted', {name: item.name}),
    })
    await getMeta()
  } catch (error) {
    console.error('Error deleting meta:', error)
    setNotification({
      type: 'error',
      text: t('meta.dialogs.failed_delete'),
    })
  }
}

const showMetaChipMenu = (e: MouseEvent, metaItem: Meta) => {
  const isArray = metaItem.type === 'array'
  const content: ContextMenuEntry[] = [
    {
      name: t('common.edit'),
      type: 'item',
      icon: 'pencil',
      action: () => openEditDialog(metaItem),
    },
  ]

  if (isArray) {
    content.push({
      name: t('context_menu.open_page'),
      type: 'item',
      icon: 'open-in-app',
      action: () => {
        void router.push({path: '/meta', query: {metaId: metaItem.id}})
      },
    })
  }

  content.push({type: 'divider'})

  if (isArray) {
    content.push({
      name: metaItem.hidden
        ? t('meta.settings.show_in_navigation')
        : t('meta.settings.hide_in_navigation'),
      type: 'item',
      icon: metaItem.hidden ? 'eye' : 'eye-off',
      action: () => {
        void updateMetaFlag(metaItem, 'hidden', !metaItem.hidden)
      },
    })
    content.push({type: 'divider'})
  }

  content.push({
    name: t('meta.dialogs.tab_where'),
    type: 'item',
    icon: 'pin',
    action: () => openEditDialog(metaItem, 'where'),
  })

  if (isArray) {
    content.push({
      name: t('meta.dialogs.tab_appearance'),
      type: 'item',
      icon: 'palette-outline',
      action: () => openEditDialog(metaItem, 'appearance'),
    })
    content.push({
      name: t('meta.dialogs.tab_capabilities'),
      type: 'item',
      icon: 'shape',
      action: () => openEditDialog(metaItem, 'capabilities'),
    })
    content.push({
      name: t('meta.dialogs.tab_from_path'),
      type: 'item',
      icon: 'folder-search-outline',
      action: () => openEditDialog(metaItem, 'from-path'),
    })

    content.push({type: 'divider'})

    content.push({
      name: t('meta.settings.preset_meta_in_tags'),
      type: 'menu',
      icon: 'shape',
      menu: [
        flagMenuItem(metaItem, 'rating', t('meta.types.rating')),
        flagMenuItem(metaItem, 'favorite', t('meta.sorting.favorite')),
        flagMenuItem(metaItem, 'synonyms', t('filters.sort.synonyms')),
        flagMenuItem(metaItem, 'bookmark', t('player.controls.bookmark')),
        flagMenuItem(metaItem, 'country', t('meta.types.country')),
      ],
    })

    content.push(
      flagMenuItem(
        metaItem,
        'parser',
        t('meta.settings.parse_media_for_tags'),
      ),
    )
  }

  content.push(
    {type: 'divider'},
    {
      name: t('common.delete'),
      type: 'item',
      icon: 'delete',
      color: 'error',
      action: () => requestDeleteMeta(metaItem),
    },
  )

  contextMenuStore.showContextMenu({
    x: e.clientX,
    y: e.clientY,
    content,
  })
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

type MetaToggleKey = 'hidden' | 'rating' | 'favorite' | 'synonyms' | 'bookmark' | 'country' | 'parser' | 'marks'

const updateMetaFlag = async (
  metaItem: Meta,
  key: MetaToggleKey,
  value: boolean,
) => {
  if (!metaItem.id) return
  try {
    await typedApi.updateMeta(metaItem.id, {[key]: value})
    await reloadMetaCatalog()
    await getMeta()
  } catch (error) {
    console.error(`Failed updating meta.${key}`, error)
    setNotification({
      type: 'error',
      text: t('meta.dialogs.failed_add'),
    })
  }
}

watch(availableTypeFilters, (filters) => {
  if (typeFilter.value && !filters.some((item) => item.value === typeFilter.value)) {
    typeFilter.value = null
  }
})

const showMetaDocs = () => {
  appShell.showDocumentation('meta')
}

onMounted(async () => {
  await getMeta()
})
</script>

<style scoped>
.meta-toolbar {
  display: flex;
  flex-direction: column;
  margin-bottom: 8px;
}

.meta-toolbar__search {
  flex: 1 1 240px;
  min-width: 200px;
}

.meta-fields-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.meta-empty {
  text-align: center;
}

.settings-empty {
  border-radius: 22px;
  border: 1px dashed rgba(var(--v-theme-on-surface), 0.14);
  background:
    radial-gradient(80% 120% at 50% 0%, rgba(var(--v-theme-primary), 0.08), transparent 65%),
    rgba(var(--v-theme-on-surface), 0.02);
}

.settings-empty__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 18px;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
}

.meta-group__label {
  line-height: 1.2;
  letter-spacing: 0.02em;
}

.meta-type-filters .v-chip {
  cursor: pointer;
}

.meta-field-chip--hidden {
  opacity: 0.55;
}
</style>
