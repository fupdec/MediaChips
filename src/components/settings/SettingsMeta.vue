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

      <div v-if="initiated && meta.length" class="meta-toolbar__filters d-flex align-center flex-wrap ga-4">
        <v-text-field
          v-model="search"
          append-inner-icon="mdi-magnify"
          :placeholder="t('common.quick_search_placeholder')"
          hide-details
          autofocus
          clearable
          variant="filled"
          density="compact"
          max-width="300"
        ></v-text-field>

        <v-select
          :model-value="sortMode"
          @update:model-value="setSortMode"
          :items="sortOptions"
          :label="t('settings_labels.meta.sort_label')"
          hide-details
          variant="filled"
          density="compact"
          max-width="260"
        ></v-select>
      </div>
    </div>

    <div v-if="!meta.length" class="meta-empty text-medium-emphasis mt-3">
      {{ t('meta.dialogs.meta_missing_add_first') }}
    </div>

    <template v-else-if="!isSearchEmpty">
      <div class="meta-fields__caption text-caption text-medium-emphasis mt-3 mb-1">
        {{ t('meta.dialogs.fields_section_label') }}
      </div>

      <v-card
        v-for="(group, param) in filteredMeta"
        :key="`key_${metaKey}_param_${param}`"
        class="meta-group pa-2 mb-3 mt-3 rounded-xl"
        variant="flat"
      >
        <div class="meta-group__label d-flex align-center text-subtitle-2 text-medium-emphasis ps-2 mb-1">
          <v-icon color="grey" start>{{ getIconDataType(param) }}</v-icon>
          <span>{{ formatDataType(param) }}</span>
          <v-spacer />
          <v-btn
            v-if="param === 'array' && tagCategories.length >= 2"
            size="small"
            variant="tonal"
            color="primary"
            class="text-none"
            rounded="xl"
            prepend-icon="mdi-set-merge"
            :text="t('meta.dialogs.merge_categories_title')"
            @click="openCategoryMerge"
          />
        </div>

        <v-chip-group column>
          <v-chip
            v-for="m in group"
            :key="`key_${metaKey}__id_${m.id}`"
            @click="openEditDialog(m)"
            class="ma-1"
          >
            <v-icon size="20" start>mdi-{{ m.icon }}</v-icon>
            <span v-html="highlightChars(m.name ?? '', search ?? '')"/>
          </v-chip>
        </v-chip-group>
      </v-card>
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
import {useEventBus} from '@/utils/eventBus'
import {typedApi} from '@/services/typedApi'
import isEmpty from 'lodash/isEmpty'
import MetaManager from '@/components/dialogs/DialogMetaManager.vue'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import {getMetaSortOptions, groupMetaByType, META_SORT_MODES, type MetaSortMode} from '@/utils/metaSort'
import {highlightChars} from '@/services/formatUtils'
import {getIconDataType, getTextDataType} from '@/services/metaTypeUtils'
import {setOption} from '@/services/settingsService'
import type {Meta} from '@/types/stores'

const settingsStore = useSettingsStore()
const dialogsStore = useDialogsStore()
const eventBus = useEventBus()
const {t, te} = useI18n()

const formatDataType = (type: string) => getTextDataType(type, {te, t})

const meta = ref<Meta[]>([])
const search = ref('')
const initiated = ref(false)
const selectedMeta = ref<Meta | null>(null)
const editDialog = ref(false)
const editMode = ref(false)
const metaKey = ref(0)

const sortMode = computed((): MetaSortMode =>
  (settingsStore.meta_sort_mode as MetaSortMode) || META_SORT_MODES.menu,
)
const sortOptions = computed(() => getMetaSortOptions(t))

const tagCategories = computed(() =>
  meta.value.filter((item) => item.type === 'array'),
)

const filteredMeta = computed(() => {
  const searchTerm = search.value?.toLowerCase() || ''

  const filtered = meta.value.filter(item => {
    if (!searchTerm) return true
    return (item.name ?? '').toLowerCase().includes(searchTerm)
  })

  return groupMetaByType(filtered, sortMode.value)
})

const setSortMode = (value: MetaSortMode) => {
  setOption(value, 'meta_sort_mode')
}

const isSearchEmpty = computed(() => isEmpty(filteredMeta.value))

const getMeta = async (type?: string) => {
  try {
    initiated.value = false

    const response = await typedApi.getMeta()
    meta.value = response.data

    if (type === 'array') {
      eventBus.emit('getMeta')
    }
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

const showMetaDocs = () => {
  eventBus.emit('showDocumentation', 'meta')
}

onMounted(async () => {
  await getMeta()
})
</script>

<style scoped>
.meta-toolbar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 8px;
}

.meta-empty {
  text-align: center;
}

.meta-group {
  background-color: rgb(120 120 120 / 5%) !important;

  &__label {
    line-height: 1.2;
    letter-spacing: 0.02em;
  }
}
</style>
