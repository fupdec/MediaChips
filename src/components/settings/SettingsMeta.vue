<template>
  <div>
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
          v-if="tagCategories.length >= 2"
          variant="tonal"
          color="primary"
          class="text-none"
          rounded="xl"
          prepend-icon="mdi-set-merge"
          :text="t('meta.dialogs.merge_categories_title')"
          @click="openCategoryMerge"
        />

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
              append-inner-icon="mdi-magnify"
              :placeholder="t('common.quick_search_placeholder')"
              hide-details
              autofocus
              clearable
              variant="solo-filled"
              flat
              density="compact"
              rounded="pill"
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

    <div v-if="!meta.length" class="meta-empty text-medium-emphasis mt-3">
      {{ t('meta.dialogs.meta_missing_add_first') }}
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
              :class="{'meta-field-chip--hidden': m.hidden && m.type === 'array'}"
              @click="openEditDialog(m)"
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
          :class="{'meta-field-chip--hidden': m.hidden && m.type === 'array'}"
          @click="openEditDialog(m)"
        >
          <v-icon size="20" start>mdi-{{ m.icon }}</v-icon>
          <span v-html="highlightChars(m.name ?? '', search ?? '')"/>
        </v-chip>
      </v-chip-group>
    </template>

    <div v-if="meta.length && isSearchEmpty" class="meta-empty text-medium-emphasis mt-4">
      <v-img src="/images/filters/filters-no-results-meta.svg" max-height="120" class="mb-2" contain></v-img>
      <div>{{ t('meta.dialogs.no_meta_found') }}</div>
    </div>

    <MetaManager
      :edit-mode="editMode"
      :meta="selectedMeta"
      :dialog="editDialog"
      @updated="getMeta"
      @close="closeEditDialog"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useSettingsStore} from '@/stores/settings'
import {useDialogsStore} from '@/stores/dialogs'
import {useAppStore} from '@/stores/app'
import {useAppShell} from '@/composable/appShell'
import {reloadMetaCatalog} from '@/composable/metaCatalog'
import isEmpty from 'lodash/isEmpty'
import MetaManager from '@/components/dialogs/DialogMetaManager.vue'
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
import type {Meta} from '@/types/stores'

const settingsStore = useSettingsStore()
const dialogsStore = useDialogsStore()
const appStore = useAppStore()
const appShell = useAppShell()
const {t, te} = useI18n()

const formatDataType = (type: string) => getTextDataType(type, {te, t})

const meta = ref<Meta[]>([])
const search = ref('')
const typeFilter = ref<string | null>(null)
const initiated = ref(false)
const selectedMeta = ref<Meta | null>(null)
const editDialog = ref(false)
const editMode = ref(false)
const metaKey = ref(0)

const groupMode = computed((): MetaGroupByMode =>
  (settingsStore.meta_group_by as MetaGroupByMode) || META_GROUP_BY_MODES.none,
)

const tagCategories = computed(() =>
  meta.value.filter((item) => item.type === 'array'),
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
    meta.value = [...appStore.meta]

    metaKey.value = Date.now()
  } catch (error) {
    console.error('Error fetching meta:', error)
  } finally {
    initiated.value = true
  }
}

const openCreateDialog = () => {
  editMode.value = false
  editDialog.value = true
}

const openEditDialog = (metaItem: Meta) => {
  selectedMeta.value = metaItem
  editMode.value = true
  editDialog.value = true
}

const closeEditDialog = () => {
  editDialog.value = false
  selectedMeta.value = null
}

const openCategoryMerge = () => {
  if (tagCategories.value.length < 2) return
  dialogsStore.openTagCategoryMerge(tagCategories.value)
}

watch(
  () => dialogsStore.tagCategoryMerge.show,
  async (show, wasShown) => {
    if (wasShown && !show) await getMeta('array')
  },
)

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

.meta-fields-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.meta-empty {
  text-align: center;
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
