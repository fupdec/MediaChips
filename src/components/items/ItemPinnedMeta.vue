<template>
  <div class="nested-tags">

    <!-- TAG PAGE -->
    <div v-if="tagPage" class="tag-page-params">

      <!-- Rating -->
      <div class="tag-page-param">
        <div class="tag-page-param__value">
          <v-rating
            :model-value="itemRating"
            density="compact"
            half-increments
            readonly
          />
        </div>
        <div class="tag-page-param__title">
          Rating
        </div>
      </div>

      <!-- Favorite -->
      <div class="tag-page-param">
        <div class="tag-page-param__value">
          <v-icon size="24">
            mdi-heart{{ item.favorite ? '' : '-outline' }}
          </v-icon>
        </div>
        <div class="tag-page-param__title">
          Favorite
        </div>
      </div>

      <!-- PRESET META -->
      <div
        v-for="meta in preset_meta"
        :key="meta.name"
        class="tag-page-param"
      >
        <div class="tag-page-param__value">
          <v-chip>
            {{ meta.value || item[meta.name] || 0 }}
          </v-chip>
        </div>
        <div class="tag-page-param__title">
          <span>{{ meta.text }}</span>
          <v-icon size="18">mdi-{{ meta.icon }}</v-icon>
        </div>
      </div>

      <!-- PINNED FIELDS -->
      <div
        v-for="category in pinnedCategoriesComputed"
        :key="`${category.kind}_${category.metaId}_${item.id}`"
        class="tag-page-param"
      >
        <div v-if="category.kind === 'tags'" class="tag-page-param__value">
          <v-chip-group column>
            <v-chip
              v-for="tag in category.items"
              :key="`${tag.id}_${item.id}`"
              @click.stop.prevent="showMenu($event, tag)"
              @mouseenter="onTagHover($event, tag)"
              @mouseleave="hideHoverImage"
            >
              {{ tag.name }}
            </v-chip>
          </v-chip-group>
        </div>

        <div v-else class="tag-page-param__value">
          <v-chip
            v-for="i in category.items"
            :key="`${i.name}_${item.id}`"
          >{{ i.value }}
          </v-chip>
        </div>

        <div class="tag-page-param__title">
          <span>{{ category.kind === 'tags' ? category.items[0].meta.name : category.items[0].name }}</span>
          <v-icon size="18">mdi-{{ category.kind === 'tags' ? category.items[0].meta.icon : category.items[0].icon }}</v-icon>
        </div>
      </div>
    </div>

    <!-- GROUPED -->
    <div v-else-if="isGrouped">
      <!-- PRESET META GROUPED -->
      <div
        v-for="meta in preset_meta"
        :key="meta.name"
        class="category"
      >
        <div class="category-name d-flex align-center ga-2">
          <v-icon start>mdi-{{ meta.icon }}</v-icon>
          {{ meta.text }}
        </div>

        <v-chip
          :label="settingsStore.show_default_meta_label == '1'"
          :variant="defaultMetaChipVariant"
          :text="String(meta.value ?? item[meta.name] ?? '')"
        ></v-chip>
      </div>

      <!-- PINNED FIELDS GROUPED -->
      <div
        v-for="category in pinnedCategoriesComputed"
        :key="`${category.kind}_${category.metaId}_${item.id}`"
        class="category"
      >
        <div class="category-name d-flex align-center ga-2">
          <v-icon start>mdi-{{ category.kind === 'tags' ? category.items[0].meta.icon : category.items[0].icon }}</v-icon>
          {{ category.kind === 'tags' ? category.items[0].meta.name : category.items[0].name }}
        </div>

        <template v-if="category.kind === 'tags'">
          <v-chip
            v-for="tag in category.items"
            :key="`${tag.id}_${item.id}`"
            :color="tag.meta?.color ? tag.color : undefined"
            :variant="getMetaChipVariant(tag.meta)"
            :label="getMetaChipLabel(tag.meta)"
            :text="tag.name"
            @click.stop.prevent="showMenu($event, tag)"
            @mouseenter="onTagHover($event, tag)"
            @mouseleave="hideHoverImage"
          ></v-chip>
        </template>

        <template v-else>
          <v-chip
            v-for="i in category.items"
            :key="`${i.name}_${item.id}`"
            :text="formatMetaValue(i.value)"
          ></v-chip>
        </template>
      </div>
    </div>

    <!-- FLAT -->
    <div v-else>
      <!-- PRESET META FLAT -->
      <v-chip
        v-for="meta in preset_meta"
        :key="meta.name"
        :title="meta.text"
        :label="settingsStore.show_default_meta_label == '1'"
        :variant="defaultMetaChipVariant"
        :prepend-icon="`mdi-${meta.icon}`"
        :text="String(meta.value ?? item[meta.name] ?? '')"
      ></v-chip>

      <!-- PINNED FIELDS FLAT -->
      <template v-for="entry in pinnedFlatComputed" :key="`${entry.kind}_${entry.metaId}_${entry.data.id || entry.data.name}_${item.id}`">
        <v-chip
          v-if="entry.kind === 'tag'"
          :color="entry.data.meta?.color ? entry.data.color : undefined"
          :variant="getMetaChipVariant(entry.data.meta)"
          :label="getMetaChipLabel(entry.data.meta)"
          :prepend-icon="`mdi-${entry.data?.meta?.icon}`"
          :text="entry.data.name"
          @click.stop.prevent="showMenu($event, entry.data)"
        ></v-chip>

        <v-chip
          v-else
          :prepend-icon="`mdi-${entry.data.icon}`"
          :text="formatMetaValue(entry.data.value)"
        ></v-chip>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import groupBy from 'lodash/groupBy'
import {typedApi} from '@/services/typedApi'

import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'
import {useContextMenu} from '@/stores/contextMenu'
import {useDialogsStore} from '@/stores/dialogs'
import {useItemsStore} from '@/stores/items'

import {useEventBus} from "@/utils/eventBus"
import translate, {toLocale} from '@/utils/translate'
import {toChipVariant, type ChipVariant} from '@/utils/chipVariant'
import {useRouter} from "vue-router"
import {usePresetMeta} from "@/composable/ItemPresetMeta"
import {getDefaultMediaTypeId} from '@/utils/mediaType'
import {getFilterObject} from '@/services/formatUtils'
import {hideHoverImage, showHoverImage} from '@/services/hoverService'
import {
  groupByPinnedAssignmentOrder,
  sortByPinnedAssignmentOrder,
  sortPinnedAssignmentItems,
} from '@/utils/pinnedMetaOrder'
import type {ItemsPageType, ItemContextMenuEntry, PresetMetaProps} from '@/types/itemsPage'
import type { RemoveTagFromItemPayload } from '@shared/api/responses'
import type {AssignedMeta, MediaItem, Meta, Tag, ItemTagRef, ItemValueRef} from '@/types/stores'

type PinnedMetaAssignment = AssignedMeta

type TagWithMeta = Tag & { meta: Meta; metaId: number }

type ValueWithMeta = Meta & { value: unknown }

type PinnedCategory =
  | { kind: 'tags'; metaId: number; items: TagWithMeta[]; name?: string; meta?: { name?: string } }
  | { kind: 'values'; metaId: number; items: ValueWithMeta[]; name?: string; meta?: { name?: string } }

type PinnedFlatEntry =
  | { kind: 'tag'; metaId: number; data: TagWithMeta; name?: string; meta?: { name?: string } }
  | { kind: 'value'; metaId: number; data: ValueWithMeta; name?: string; meta?: { name?: string } }

interface RemoveTagPayload extends RemoveTagFromItemPayload {}

const router = useRouter()

const props = withDefaults(defineProps<{
  item: MediaItem | Tag
  tags?: ItemTagRef[]
  values?: ItemValueRef[]
  type: ItemsPageType | string
  tagPage?: boolean
  isShowAll?: boolean
  assignment?: PinnedMetaAssignment[]
}>(), {
  tags: () => [],
  values: () => [],
  tagPage: false,
  isShowAll: false,
  assignment: () => [],
})

const presetMetaProps: PresetMetaProps = {
  type: props.type,
  item: props.item,
  isShowAll: props.isShowAll,
}

const {preset_meta} = usePresetMeta(presetMetaProps)

const settingsStore = useSettingsStore()
const appStore = useAppStore()
const metaStore = useAppStore().meta
const tagsStore = useAppStore().tags
const contextMenuStore = useContextMenu()
const dialogsStore = useDialogsStore()
const itemsStore = useItemsStore()

const eventBus = useEventBus()

const itemRating = computed((): number | undefined => {
  const rating = props.item.rating
  return typeof rating === 'number' ? rating : undefined
})

const defaultMetaChipVariant = computed((): ChipVariant | undefined =>
  toChipVariant(settingsStore.default_meta_chip_variant),
)

const getMetaChipVariant = (meta?: Meta): ChipVariant | undefined =>
  toChipVariant(meta?.chipVariant)

const getMetaChipLabel = (meta?: Meta): boolean | undefined => {
  const label = meta?.chipLabel
  return typeof label === 'boolean' ? label : undefined
}

const formatMetaValue = (value: unknown): string => String(value ?? '')

const onTagHover = (event: MouseEvent | KeyboardEvent, tag: TagWithMeta): void => {
  if (event instanceof MouseEvent) {
    showHoverImage(event, tag.metaId ?? null, tag.id, 'tag', {
      label: tag.name,
      imageAspectRatio: tag.meta.imageAspectRatio,
    })
  }
}

const isGrouped = computed(() =>
  settingsStore.group_chips_in_card_description === '1' || props.tagPage
)

const usePinnedMetaIdKey = computed(() =>
  itemsStore.type === 'tag' || props.tagPage
)

const assignmentRows = computed(() => {
  if (props.assignment?.length) {
    return sortPinnedAssignmentItems(props.assignment)
  }
  return itemsStore.sortedAssigned
})

const tagItems = computed((): TagWithMeta[] => {
  if (!metaStore.length || !tagsStore.length || !props.tags?.length) return []

  const result = props.tags
    .map((i): TagWithMeta | null => {
      if (!i) return null
      const meta = metaStore.find(m => m.id === i.metaId)
      const tag = tagsStore.find(t => t.id === i.tagId)
      const metaId = i.metaId ?? tag?.metaId ?? meta?.id
      if (!tag || !meta || metaId == null) return null
      return {...tag, meta, metaId}
    })
    .filter((tag): tag is TagWithMeta => tag !== null && !!tag.meta && !!tag.id)
    .filter(tag => checkShow(tag.metaId))

  if (result.length === 0) return []

  return sortByPinnedAssignmentOrder(
    result,
    assignmentRows.value,
    (tag) => tag.metaId,
    {usePinnedMetaId: usePinnedMetaIdKey.value},
  )
})

const tagGroups = computed(() =>
  groupByPinnedAssignmentOrder(groupBy(tagItems.value, 'metaId'), assignmentRows.value, {
    usePinnedMetaId: usePinnedMetaIdKey.value,
  }),
)

const valueItems = computed((): ValueWithMeta[] => {
  if (!metaStore.length || !props.values?.length) return []

  const result = props.values
    .map((i): ValueWithMeta | null => {
      if (!i) return null
      const meta = metaStore.find(m => m.id === i.metaId)
      return meta ? {...meta, value: i.value} : null
    })
    .filter((meta): meta is ValueWithMeta => meta !== null && !!meta.id)
    .filter(meta => checkShow(meta.id))

  if (result.length === 0) return []

  return sortByPinnedAssignmentOrder(
    result,
    assignmentRows.value,
    (value) => value.id,
    {usePinnedMetaId: usePinnedMetaIdKey.value},
  )
})

const valueGroups = computed(() =>
  groupByPinnedAssignmentOrder(groupBy(valueItems.value, 'id'), assignmentRows.value, {
    usePinnedMetaId: usePinnedMetaIdKey.value,
  }),
)

const pinnedCategoriesComputed = computed((): PinnedCategory[] => {
  const categories: PinnedCategory[] = [
    ...tagGroups.value.map((items): PinnedCategory => ({
      kind: 'tags',
      metaId: items[0].metaId,
      items,
    })),
    ...valueGroups.value.map((items): PinnedCategory => ({
      kind: 'values',
      metaId: items[0].id,
      items,
    })),
  ]

  return sortByPinnedAssignmentOrder(
    categories,
    assignmentRows.value,
    (category) => category.metaId,
    {usePinnedMetaId: usePinnedMetaIdKey.value},
  )
})

const pinnedFlatComputed = computed((): PinnedFlatEntry[] => {
  const items: PinnedFlatEntry[] = [
    ...tagItems.value.map((tag): PinnedFlatEntry => ({kind: 'tag', metaId: tag.metaId, data: tag})),
    ...valueItems.value.map((value): PinnedFlatEntry => ({kind: 'value', metaId: value.id, data: value})),
  ]

  return sortByPinnedAssignmentOrder(
    items,
    assignmentRows.value,
    (entry) => entry.metaId,
    {usePinnedMetaId: usePinnedMetaIdKey.value},
  )
})

const checkShow = (metaId: number): boolean => {
  if (props.tagPage) {
    return true
  }
  const assigned = itemsStore.safeAssigned
  let tagName: 'metaId' | 'pinnedMetaId' = 'metaId'
  if (itemsStore.type === 'tag') tagName = 'pinnedMetaId'
  const x = assigned.findIndex((i) => i[tagName] == metaId)
  if (x > -1) {
    return assigned[x].show == 1
  }
  return false
}

const getPath = (tag: TagWithMeta): string => {
  const mediaTypeId = itemsStore.environment?.media_type_id || getDefaultMediaTypeId(appStore.mediaTypes)
  return "/tag?metaId=" + tag.metaId + "&tagId=" + tag.id + "&mediaTypeId=" + mediaTypeId
}

const openNewTab = (tag: TagWithMeta): void => {
  typedApi.createTab({
    name: tag.name,
    icon: tag.meta.icon,
    url: '/tag',
    tagId: tag.id,
    mediaTypeId: itemsStore.environment?.media_type_id || getDefaultMediaTypeId(appStore.mediaTypes),
    metaId: tag.metaId,
  })
    .then(() => {
      eventBus.emit('getTabs')
    })
    .catch((e) => {
      console.error(e)
    })
}

const removeTag = (tag: TagWithMeta): void => {
  const data: RemoveTagPayload = {
    tagId: tag.id,
  }

  if (props.type === 'media') {
    data.mediaId = props.item.id
  } else if (props.type === 'tag') {
    data.parentTagId = props.item.id
  } else return

  typedApi.removeTagFromItem(props.type, data)
    .then(() => {
      itemsStore.removeTagFromItem({
        itemId: props.item.id,
        tagId: tag.id,
      })

      eventBus.emit('getItemsFromDb', {
        ids: [props.item.id],
        type: props.type,
      })

      if (props.type === 'tag') {
        eventBus.emit('getTag')
      }
    })
    .catch((e) => {
      console.error(e)
    })
}

const filterByTag = (tag: TagWithMeta): void => {
  const filter_new = getFilterObject({
    param: tag.metaId,
    type: "array",
    cond: "in all",
    lock: false,
    val: [tag.id],
  })

  itemsStore.filters.push(filter_new)

  setTimeout(() => {
    eventBus.emit('applyFilters')
  }, 0)
}

const showMenu = (e: MouseEvent | KeyboardEvent, tag: TagWithMeta): void => {
  hideHoverImage()

  const locale = toLocale(settingsStore.locale)
  const t = (key: string, params: Record<string, string | number> = {}) => translate(key, params, locale)
  const clientX = e instanceof MouseEvent ? e.clientX : 0
  const clientY = e instanceof MouseEvent ? e.clientY : 0

  const contextMenu: ItemContextMenuEntry[] = [
    {
      name: t('context_menu.edit_tag'),
      type: "item",
      icon: "pencil",
      action: () => {
        const meta = appStore.getMetaById(tag.metaId)
        if (meta) dialogsStore.editTag(tag, meta)
      },
    }, {
      type: "divider"
    },
    {
      name: t('context_menu.filter_by_tag'),
      type: "item",
      icon: "filter",
      action: () => {
        filterByTag(tag)
      },
    }, {
      type: "divider"
    },
    {
      name: t('context_menu.open_page'),
      type: "item",
      icon: "open-in-app",
      disabled: getPath(tag) == router.currentRoute.value.fullPath,
      action: () => {
        const url = getPath(tag)
        router.push(url)
      },
    }, {
      name: t('context_menu.open_in_new_tab'),
      type: "item",
      icon: "tab",
      action: () => {
        openNewTab(tag)
      },
    }, {
      type: "divider"
    }, {
      name: t('common.remove'),
      type: "item",
      icon: "close",
      color: "error",
      action: () => {
        removeTag(tag)
      },
    }
  ]

  contextMenuStore.showContextMenu({
    x: clientX,
    y: clientY,
    content: contextMenu,
    tagMeta: tag,
  })
}
</script>
