<template>
  <div id="settings-meta-assignment" class="settings-meta-assignment">
    <div class="settings-meta-assignment__intro mb-4">
      <SettingsCategoryDivider
        :title="t('settings_labels.field_pinning.title')"
        icon="pin-outline"
      >
        <template #actions>
          <button-documentation id="meta.assign"/>
        </template>
      </SettingsCategoryDivider>

      <v-alert
        color="info"
        icon="mdi-content-save-alert"
        class="text-caption"
        variant="tonal"
        rounded="xl"
        density="compact"
      >
        {{ t('settings_labels.media_type_added_meta.irreversible_changes') }}
      </v-alert>
    </div>

    <v-btn-toggle
      v-model="viewMode"
      mandatory
      rounded="xl"
      color="primary"
      density="comfortable"
      class="settings-meta-assignment__toggle mb-4"
    >
      <v-btn value="media" size="small" variant="outlined">
        <v-icon start size="18">mdi-file-outline</v-icon>
        {{ t('settings_labels.field_pinning.view_by_media') }}
      </v-btn>
      <v-btn value="tags" size="small" variant="outlined">
        <v-icon start size="18">mdi-tag-multiple-outline</v-icon>
        {{ t('settings_labels.field_pinning.view_by_tags') }}
      </v-btn>
    </v-btn-toggle>

    <div v-if="!hasItems" class="layout-img">
      <v-img src="/images/no-data.svg" max-height="30vh" class="my-4" contain/>
      <div class="text-medium-emphasis">
        {{ viewMode === 'media'
          ? t('meta.settings.no_media_types_available')
          : t('settings_labels.field_pinning.no_tag_categories') }}
      </div>
    </div>

    <div v-else class="settings-meta-assignment__layout">
      <aside class="settings-meta-assignment__sidebar">
        <v-list
          v-model:selected="selectedIds"
          select-strategy="single-independent"
          class="settings-meta-assignment__list"
          color="primary"
          density="compact"
          nav
        >
          <v-list-item
            v-for="item in listItems"
            :key="item.id"
            :value="item.id"
            rounded="md"
            class="settings-meta-assignment__list-item"
          >
            <template #prepend>
              <v-icon size="16">mdi-{{ item.icon }}</v-icon>
            </template>

            <v-list-item-title class="text-caption">{{ item.title }}</v-list-item-title>

            <template #append>
              <span
                class="text-caption text-medium-emphasis settings-meta-assignment__count"
                :title="item.pinnedCountHint"
              >
                {{ item.pinnedCount }}
              </span>
            </template>
          </v-list-item>
        </v-list>
      </aside>

      <main class="settings-meta-assignment__panel">
        <div v-if="!selectedItem" class="settings-meta-assignment__placeholder">
          <v-icon size="56" color="grey-lighten-1" class="mb-3">mdi-pin-outline</v-icon>
          <div class="text-body-1 text-medium-emphasis">
            {{ viewMode === 'media'
              ? t('settings_labels.field_pinning.select_media_type')
              : t('settings_labels.field_pinning.select_tag_category') }}
          </div>
        </div>

        <MetaAssignmentPanel
          v-else-if="selectedMediaTypeItem"
          :key="`media_${selectedMediaTypeItem.id}`"
          mode="from-media-type"
          :media-type="selectedMediaTypeItem"
          :show-warning="false"
          :show-anchor="false"
          @meta-updated="onAssignmentUpdated"
        />

        <MetaAssignmentPanel
          v-else-if="selectedMetaItem"
          :key="`meta_${selectedMetaItem.id}`"
          mode="from-meta"
          :meta="selectedMetaItem"
          :show-warning="false"
          :show-anchor="false"
          @pinned-meta-updated="onAssignmentUpdated"
        />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted} from 'vue'
import {useRoute} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import orderBy from 'lodash/orderBy'
import {useAppStore} from '@/stores/app'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import MetaAssignmentPanel from '@/components/meta/assignment/MetaAssignmentPanel.vue'
import ButtonDocumentation from '@/components/ui/ButtonDocumentation.vue'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import type {Meta} from '@/types/stores'
import type {MediaType} from '@/types/media'
import type {MetaInMediaTypeRow} from '@/types/metaAssignment'

type AssignmentViewMode = 'media' | 'tags'

interface AssignmentListItem {
  id: number
  icon?: string
  title: string
  pinnedCount: number
  pinnedCountHint: string
  raw: MediaType | Meta
}



const {t} = useI18n()
const route = useRoute()

const viewMode = ref<AssignmentViewMode>('media')
const selectedIds = ref<number[]>([])
const pinnedFieldsByMediaType = ref<Record<number, number>>({})
const pinnedMediaByMeta = ref<Record<number, number>>({})
const childPinnedByMeta = ref<Record<number, number>>({})

const mediaTypes = computed(() => useAppStore().mediaTypes || [])

const tagCategories = computed(() =>
  orderBy(
    (useAppStore().meta || []).filter((m) => m.type === 'array'),
    ['hidden', 'order'],
    ['asc', 'asc']
  )
)

const listItems = computed((): AssignmentListItem[] => {
  if (viewMode.value === 'media') {
    return mediaTypes.value.map((mt: MediaType) => {
      const pinnedCount = pinnedFieldsByMediaType.value[Number(mt.id)] || 0
      return {
        id: mt.id,
        icon: mt.icon,
        title: getMediaTypeName(mt, t),
        pinnedCount,
        pinnedCountHint: t('settings_labels.field_pinning.pinned_fields_count', {count: pinnedCount}),
        raw: mt,
      }
    })
  }

  return tagCategories.value.map((meta: Meta) => {
    const mediaCount = pinnedMediaByMeta.value[Number(meta.id)] || 0
    const childCount = childPinnedByMeta.value[Number(meta.id)] || 0
    const pinnedCount = mediaCount + childCount
    return {
      id: meta.id,
      icon: meta.icon,
      title: meta.name ?? '',
      pinnedCount,
      pinnedCountHint: t('settings_labels.field_pinning.pinned_assignments_hint', {
        media: mediaCount,
        children: childCount,
      }),
      raw: meta,
    }
  })
})

const hasItems = computed(() => listItems.value.length > 0)

const selectedItem = computed(() => {
  const id = selectedIds.value[0]
  if (!id) return null
  return listItems.value.find((item) => item.id === id) || null
})

const selectedMediaTypeItem = computed((): MediaType | null => {
  if (viewMode.value !== 'media') return null
  const id = selectedIds.value[0]
  if (!id) return null
  return mediaTypes.value.find((item) => item.id === id) ?? null
})

const selectedMetaItem = computed((): Meta | null => {
  if (viewMode.value !== 'tags') return null
  const id = selectedIds.value[0]
  if (!id) return null
  return tagCategories.value.find((item) => item.id === id) ?? null
})

const loadAssignmentCounts = async () => {
  try {
    const [mediaTypeRows, pinnedMetaRows] = await Promise.all([
      typedApi.getAllMetaInMediaType(),
      typedApi.getAllPinnedMeta(),
    ])

    const fieldsByMedia: Record<number, number> = {}
    const mediaByMeta: Record<number, number> = {}

    for (const row of mediaTypeRows.data || []) {
      const mediaTypeId = Number(row.mediaTypeId)
      const metaId = Number(row.metaId)
      fieldsByMedia[mediaTypeId] = (fieldsByMedia[mediaTypeId] || 0) + 1
      mediaByMeta[metaId] = (mediaByMeta[metaId] || 0) + 1
    }

    const childByMeta: Record<number, number> = {}
    for (const row of pinnedMetaRows.data || []) {
      const metaId = Number(row.metaId)
      childByMeta[metaId] = (childByMeta[metaId] || 0) + 1
    }

    pinnedFieldsByMediaType.value = fieldsByMedia
    pinnedMediaByMeta.value = mediaByMeta
    childPinnedByMeta.value = childByMeta
  } catch (e) {
    console.error('Error loading assignment counts:', e)
  }
}

const selectFromRoute = () => {
  const routeView = route.query.view
  if (routeView === 'media' || routeView === 'tags') {
    viewMode.value = routeView
  }

  const mediaTypeId = Number(route.query.mediaTypeId)
  const metaId = Number(route.query.metaId)

  if (viewMode.value === 'media' && mediaTypeId) {
    selectedIds.value = [mediaTypeId]
    return
  }

  if (viewMode.value === 'tags' && metaId) {
    selectedIds.value = [metaId]
  }
}

const ensureSelection = () => {
  if (selectedIds.value.length && listItems.value.some((i) => i.id === selectedIds.value[0])) {
    return
  }
  if (listItems.value.length) {
    selectedIds.value = [listItems.value[0].id]
  } else {
    selectedIds.value = []
  }
}

const onAssignmentUpdated = (items?: MetaInMediaTypeRow[]) => {
  const selectedId = selectedIds.value[0]
  if (viewMode.value === 'media' && selectedId != null && Array.isArray(items)) {
    pinnedFieldsByMediaType.value = {
      ...pinnedFieldsByMediaType.value,
      [selectedId]: items.length,
    }
  }
  void loadAssignmentCounts()
}

watch(viewMode, () => {
  ensureSelection()
})

watch(listItems, () => {
  ensureSelection()
})

watch(() => route.fullPath, () => {
  selectFromRoute()
  ensureSelection()
})

onMounted(async () => {
  await loadAssignmentCounts()
  selectFromRoute()
  ensureSelection()
})
</script>
