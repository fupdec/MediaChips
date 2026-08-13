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
            <span
              v-for="tag in category.items"
              :key="`${tag.id}_${item.id}`"
              class="nested-tag-chip-wrap"
              :class="{
                'nested-tag-chip-wrap--active': isNestedTagContextTarget(tag.id),
                'nested-tag-chip-wrap--label': getMetaChipLabel(tag.meta),
              }"
            >
              <v-chip
                v-bind="getTagChipBind(tag)"
                @click.stop.prevent="openTagPage(tag)"
                @contextmenu.stop.prevent="showMenu($event, tag)"
                @mouseenter="onTagHover($event, tag)"
                @mouseleave="hideHoverImage"
              >
                {{ tag.name }}
              </v-chip>
            </span>
          </v-chip-group>
        </div>

        <div v-else class="tag-page-param__value">
          <v-chip
            v-for="i in category.items"
            :key="`${i.name}_${item.id}`"
          >{{ formatMetaValue(i) }}
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
        v-for="meta in visiblePresetMeta"
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
        v-for="category in visibleCategories"
        :key="`${category.kind}_${category.metaId}_${item.id}`"
        class="category"
      >
        <div class="category-name d-flex align-center ga-2">
          <v-icon start>mdi-{{ category.kind === 'tags' ? category.items[0].meta.icon : category.items[0].icon }}</v-icon>
          {{ category.kind === 'tags' ? category.items[0].meta.name : category.items[0].name }}
        </div>

        <template v-if="category.kind === 'tags'">
          <span
            v-for="tag in category.items"
            :key="`${tag.id}_${item.id}`"
            class="nested-tag-chip-wrap"
            :class="{
              'nested-tag-chip-wrap--active': isNestedTagContextTarget(tag.id),
              'nested-tag-chip-wrap--label': getMetaChipLabel(tag.meta),
            }"
          >
            <v-chip
              v-bind="getTagChipBind(tag)"
              :text="tag.name"
              @click.stop.prevent="openTagPage(tag)"
              @contextmenu.stop.prevent="showMenu($event, tag)"
              @mouseenter="onTagHover($event, tag)"
              @mouseleave="hideHoverImage"
            ></v-chip>
          </span>
        </template>

        <template v-else>
          <v-chip
            v-for="i in category.items"
            :key="`${i.name}_${item.id}`"
            :text="formatMetaValue(i)"
          ></v-chip>
        </template>
      </div>

      <div
        v-if="needsCollapse"
        class="category"
      >
        <v-chip
          class="nested-tags__toggle"
          variant="tonal"
          color="primary"
          :prepend-icon="chipsExpanded ? 'mdi-chevron-up' : 'mdi-dots-horizontal'"
          :text="collapseToggleLabel"
          @click.stop.prevent="toggleChipsExpanded"
        />
      </div>
    </div>

    <!-- FLAT -->
    <div v-else>
      <!-- PRESET META FLAT -->
      <v-chip
        v-for="meta in visiblePresetMeta"
        :key="meta.name"
        :title="meta.text"
        :label="settingsStore.show_default_meta_label == '1'"
        :variant="defaultMetaChipVariant"
        :prepend-icon="`mdi-${meta.icon}`"
        :text="String(meta.value ?? item[meta.name] ?? '')"
      ></v-chip>

      <!-- PINNED FIELDS FLAT -->
      <template v-for="entry in visibleFlatEntries" :key="`${entry.kind}_${entry.metaId}_${entry.data.id || entry.data.name}_${item.id}`">
        <span
          v-if="entry.kind === 'tag'"
          class="nested-tag-chip-wrap"
          :class="{
            'nested-tag-chip-wrap--active': isNestedTagContextTarget(entry.data.id),
            'nested-tag-chip-wrap--label': getMetaChipLabel(entry.data.meta),
          }"
        >
          <v-chip
            v-bind="getTagChipBind(entry.data)"
            :prepend-icon="getTagChipPrependIcon(entry.data)"
            :text="entry.data.name"
            @click.stop.prevent="openTagPage(entry.data)"
            @contextmenu.stop.prevent="showMenu($event, entry.data)"
            @mouseenter="onTagHover($event, entry.data)"
            @mouseleave="hideHoverImage"
          ></v-chip>
        </span>

        <v-chip
          v-else
          :prepend-icon="`mdi-${entry.data.icon}`"
          :text="formatMetaValue(entry.data)"
        ></v-chip>
      </template>

      <v-chip
        v-if="needsCollapse"
        class="nested-tags__toggle"
        variant="tonal"
        color="primary"
        :prepend-icon="chipsExpanded ? 'mdi-chevron-up' : 'mdi-dots-horizontal'"
        :text="collapseToggleLabel"
        @click.stop.prevent="toggleChipsExpanded"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import groupBy from 'lodash/groupBy'
import {typedApi} from '@/services/typedApi'

import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'
import {useContextMenu} from '@/stores/contextMenu'
import {useDialogsStore} from '@/stores/dialogs'
import {useItemsStore} from '@/stores/items'
import {useNotificationsStore} from '@/stores/notifications'
import {useScraperStore} from '@mediachips/plugin-adult/stores/scraper'
import {autoScrapeTmdbPersonTag} from '@mediachips/plugin-tmdb/services/tmdbPersonAutoScrape'
import {isAdultUiAvailable} from '@/services/adultFeatures'
import {isTmdbUiAvailable, isTmdbPersonCategory} from '@/services/tmdbFeatures'
import {refreshTagThumbDisplay} from '@/utils/tagThumbRefresh'

import {useEventBus} from "@/utils/eventBus"
import {useItemsListSync} from '@/composable/itemsListSync'
import {reloadTagsCatalog, reloadTabsCatalog} from '@/composable/appCatalogs'
import {refreshPageTag} from '@/composable/pageTagLayoutRemount'
import {useItemsFiltersController} from '@/composable/itemsFiltersController'
import {useSessionFocusActions} from '@/composable/useSessionFocusActions'
import {useSessionFocusStore} from '@/stores/sessionFocus'
import translate, {toLocale} from '@/utils/translate'
import {toChipVariant, type ChipVariant} from '@/utils/chipVariant'
import {resolveTagChipColor} from '@shared/tagChipColor'
import {useRouter} from "vue-router"
import {usePresetMeta} from "@/composable/ItemPresetMeta"
import {getDefaultMediaTypeId} from '@/utils/mediaType'
import {getFilterObject, getTagChipTextColor} from '@/services/formatUtils'
import {isNearWhiteColor} from '@/utils/headerColorUtils'
import {hideHoverImage, showHoverImage} from '@/services/hoverService'
import {copyToClipboard} from '@/utils/copyToClipboard'
import {
  formatMeasurementDisplay,
  normalizeMeasurementUnit,
} from '@/utils/measurementUnits'
import {
  groupByPinnedAssignmentOrder,
  sortByPinnedAssignmentOrder,
  sortPinnedAssignmentItems,
} from '@/utils/pinnedMetaOrder'
import type {ItemsPageType, ItemContextMenuEntry, PresetMetaProps} from '@/types/itemsPage'
import type { RemoveTagFromItemPayload } from '@shared/api/responses'
import type {AssignedMeta, MediaItem, Meta, Tag, ItemTagRef, ItemValueRef} from '@/types/stores'

/** Max chips shown on cards before a "+N" toggle appears. */
const CHIP_COLLAPSE_LIMIT = 12

type PinnedMetaAssignment = AssignedMeta

type TagWithMeta = Tag & { meta: Meta; metaId: number; fromFolder?: boolean }

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
  showPreset?: boolean
  assignment?: PinnedMetaAssignment[]
}>(), {
  tags: () => [],
  values: () => [],
  tagPage: false,
  isShowAll: false,
  showPreset: true,
  assignment: () => [],
})

const presetMetaProps: PresetMetaProps = {
  get type() { return props.type },
  get item() { return props.item },
  get isShowAll() { return props.isShowAll },
  get showPreset() { return props.showPreset },
}

const {preset_meta: presetMetaSource} = usePresetMeta(presetMetaProps)
const preset_meta = computed(() => presetMetaSource.value)

const settingsStore = useSettingsStore()
const appStore = useAppStore()
const contextMenuStore = useContextMenu()
const dialogsStore = useDialogsStore()
const itemsStore = useItemsStore()
const notificationsStore = useNotificationsStore()
const scraperStore = useScraperStore()

const eventBus = useEventBus()
const listSync = useItemsListSync()
const filtersController = useItemsFiltersController()
const sessionFocusStore = useSessionFocusStore()
const {startFocus, clearFocus} = useSessionFocusActions()

const itemRating = computed((): number | undefined => {
  const rating = props.item.rating
  return typeof rating === 'number' ? rating : undefined
})

const defaultMetaChipVariant = computed((): ChipVariant | undefined =>
  toChipVariant(settingsStore.default_meta_chip_variant),
)

const getMetaChipLabel = (meta?: Meta): boolean | undefined => {
  const label = meta?.chipLabel
  return typeof label === 'boolean' ? label : undefined
}

const isNestedTagContextTarget = (tagId: number): boolean => {
  return contextMenuStore.show
    && contextMenuStore.targetNestedTagId != null
    && Number(contextMenuStore.targetNestedTagId) === Number(tagId)
    && contextMenuStore.targetItemId != null
    && Number(contextMenuStore.targetItemId) === Number(props.item.id)
}

const getTagChipBind = (tag: TagWithMeta) => {
  const active = isNestedTagContextTarget(tag.id)
  const variant: ChipVariant = tag.fromFolder
    ? 'tonal'
    : (toChipVariant(tag.meta?.chipVariant) ?? 'flat')
  const color = resolveTagChipColor(tag.meta?.color, tag.color)
  const colored = Boolean(color)
  const light = colored && isNearWhiteColor(color)
  const textColor = colored ? getTagChipTextColor(color, variant) : undefined
  const locale = toLocale(settingsStore.locale)
  const fromFolderTitle = tag.fromFolder
    ? translate('items.tag_from_folder', {}, locale)
    : undefined

  return {
    variant,
    color: colored ? color : undefined,
    // Flat/elevated only — see getTagChipTextStyle.
    style: textColor ? {color: textColor} : undefined,
    label: getMetaChipLabel(tag.meta),
    title: fromFolderTitle || tag.name || undefined,
    size: active ? 'large' : undefined,
    filter: active || undefined,
    prependIcon: tag.fromFolder ? 'mdi-folder-outline' : undefined,
    class: [
      colored ? 'tag-chip--colored' : undefined,
      light ? 'tag-chip--light' : undefined,
      tag.fromFolder ? 'tag-chip--from-folder' : undefined,
      active ? 'active-chip' : undefined,
    ].filter(Boolean).join(' ') || undefined,
  }
}

const getTagChipPrependIcon = (tag: TagWithMeta): string | undefined => {
  if (tag.fromFolder) return 'mdi-folder-outline'
  return tag.meta?.icon ? `mdi-${tag.meta.icon}` : undefined
}

const onTagHover = (event: MouseEvent | KeyboardEvent, tag: TagWithMeta): void => {
  if (!(event instanceof MouseEvent)) return
  showHoverImage(event, tag.metaId ?? null, tag.id, 'tag', {
    label: tag.name,
    imageAspectRatio: tag.meta.imageAspectRatio,
  })
}

const isGrouped = computed(() =>
  settingsStore.group_chips_in_card_description === '1' || props.tagPage
)

const usePinnedMetaIdKey = computed(() =>
  props.type === 'tag' || itemsStore.type === 'tag' || props.tagPage
)

const assignmentRows = computed(() => {
  if (props.assignment?.length) {
    return sortPinnedAssignmentItems(props.assignment)
  }
  return itemsStore.sortedAssigned
})

const formatMetaValue = (meta: ValueWithMeta): string => {
  const unit = normalizeMeasurementUnit(meta.measurementUnit)
  return formatMeasurementDisplay(meta.value, unit)
}

const tagItems = computed((): TagWithMeta[] => {
  // Access via store (not a destructured snapshot) so getTags() replacements stay reactive.
  const metaStore = appStore.meta
  const tagsStore = appStore.tags
  if (!metaStore.length || !tagsStore.length || !props.tags?.length) return []

  const result = props.tags
    .map((i): TagWithMeta | null => {
      if (!i) return null
      const meta = metaStore.find(m => m.id === i.metaId)
      const tag = tagsStore.find(t => t.id === i.tagId)
      const metaId = i.metaId ?? tag?.metaId ?? meta?.id
      if (!tag || !meta || metaId == null) return null
      return {...tag, meta, metaId, fromFolder: Boolean(i.fromFolder)}
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
  const metaStore = appStore.meta
  if (!metaStore.length || !props.values?.length) return []

  const result = props.values
    .map((i): ValueWithMeta | null => {
      if (!i) return null
      // Skip blank stored values so cards don't render empty chips.
      if (i.value == null || i.value === '') return null
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

const chipsExpanded = ref(false)

watch(() => props.item.id, () => {
  chipsExpanded.value = false
})

const collapseEnabled = computed(() => !props.tagPage && !props.isShowAll)

const totalChipCount = computed((): number => {
  if (isGrouped.value) {
    return preset_meta.value.length
      + pinnedCategoriesComputed.value.reduce((sum, category) => sum + category.items.length, 0)
  }
  return preset_meta.value.length + pinnedFlatComputed.value.length
})

const needsCollapse = computed(() =>
  collapseEnabled.value && totalChipCount.value > CHIP_COLLAPSE_LIMIT,
)

const hiddenChipCount = computed(() =>
  Math.max(0, totalChipCount.value - CHIP_COLLAPSE_LIMIT),
)

const isChipsCollapsed = computed(() => needsCollapse.value && !chipsExpanded.value)

const visiblePresetMeta = computed(() => {
  if (!isChipsCollapsed.value) return preset_meta.value
  return preset_meta.value.slice(0, CHIP_COLLAPSE_LIMIT)
})

const visibleFlatEntries = computed((): PinnedFlatEntry[] => {
  if (!isChipsCollapsed.value) return pinnedFlatComputed.value
  const remaining = Math.max(0, CHIP_COLLAPSE_LIMIT - preset_meta.value.length)
  return pinnedFlatComputed.value.slice(0, remaining)
})

const visibleCategories = computed((): PinnedCategory[] => {
  if (!isChipsCollapsed.value) return pinnedCategoriesComputed.value

  let remaining = Math.max(0, CHIP_COLLAPSE_LIMIT - preset_meta.value.length)
  const result: PinnedCategory[] = []

  for (const category of pinnedCategoriesComputed.value) {
    if (remaining <= 0) break

    if (category.kind === 'tags') {
      const items = category.items.slice(0, remaining)
      remaining -= items.length
      result.push({...category, items})
    } else {
      const items = category.items.slice(0, remaining)
      remaining -= items.length
      result.push({...category, items})
    }
  }

  return result
})

const collapseToggleLabel = computed((): string => {
  const locale = toLocale(settingsStore.locale)
  if (chipsExpanded.value) {
    return translate('items.chips_show_less', {}, locale)
  }
  return translate('items.chips_show_more', {count: hiddenChipCount.value}, locale)
})

const toggleChipsExpanded = (): void => {
  chipsExpanded.value = !chipsExpanded.value
}

const checkShow = (metaId: number): boolean => {
  if (props.tagPage || props.isShowAll) {
    return true
  }
  // Prefer explicit assignment (hover cards, tag page) over the current list page.
  const assigned = assignmentRows.value
  const tagName: 'metaId' | 'pinnedMetaId' = usePinnedMetaIdKey.value ? 'pinnedMetaId' : 'metaId'
  const x = assigned.findIndex((i) => i[tagName] == metaId)
  if (x > -1) {
    return assigned[x].show === true || assigned[x].show == 1
  }
  return false
}

const getPath = (tag: TagWithMeta): string => {
  const mediaTypeId = itemsStore.environment?.media_type_id || getDefaultMediaTypeId(appStore.mediaTypes)
  return "/tag?metaId=" + tag.metaId + "&tagId=" + tag.id + "&mediaTypeId=" + mediaTypeId
}

const openTagPage = (tag: TagWithMeta): void => {
  hideHoverImage()
  const url = getPath(tag)
  if (url === router.currentRoute.value.fullPath) return
  router.push(url)
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
      void reloadTabsCatalog()
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

      listSync.getItemsFromDb({
        ids: [props.item.id],
        type: props.type,
      })

      if (props.type === 'tag') {
        void refreshPageTag()
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
    void filtersController.apply()
  }, 0)
}

const autoScrapeTpdbTag = async (tag: TagWithMeta): Promise<void> => {
  const meta = tag.meta
  if (!meta) return

  const locale = toLocale(settingsStore.locale)
  const t = (key: string, params: Record<string, string | number> = {}) =>
    translate(key, params, locale)

  dialogsStore.process.show = true
  dialogsStore.process.text = t('scraper.auto_scrape_in_progress', {name: tag.name || ''})

  try {
    const result = await scraperStore.autoScrapeTag({tag, meta})
    notificationsStore.setNotification({
      type: result.success ? 'success' : result.error === 'not_found' ? 'warning' : 'error',
      title: t(result.success ? 'scraper.auto_scrape_done' : 'scraper.auto_scrape_failed'),
      text: result.performerName || tag.name || '',
    })
    if (result.success) {
      refreshTagThumbDisplay(itemsStore, appStore.dbPath, meta.id, tag.id)
      listSync.getItemsFromDb({ids: [tag.id], type: 'tag'})
      void reloadTagsCatalog()
    }
  } finally {
    dialogsStore.process.show = false
    dialogsStore.process.text = null
  }
}

const autoScrapeTmdbTag = async (tag: TagWithMeta): Promise<void> => {
  const meta = tag.meta
  if (!meta) return

  const locale = toLocale(settingsStore.locale)
  const t = (key: string, params: Record<string, string | number> = {}) =>
    translate(key, params, locale)

  dialogsStore.process.show = true
  dialogsStore.process.text = t('tmdb.auto_scrape_in_progress', {name: tag.name || ''})

  try {
    const result = await autoScrapeTmdbPersonTag({
      tag,
      meta,
      dbPath: appStore.dbPath,
    })
    notificationsStore.setNotification({
      type: result.success
        ? (result.error === 'image_failed' ? 'warning' : 'success')
        : result.error === 'not_found' ? 'warning' : 'error',
      title: t(
        result.success
          ? (result.error === 'image_failed' ? 'tmdb.auto_scrape_image_failed' : 'tmdb.auto_scrape_done')
          : 'tmdb.auto_scrape_failed',
      ),
      text: result.personName || tag.name || '',
    })
    if (result.success) {
      refreshTagThumbDisplay(itemsStore, appStore.dbPath, meta.id, tag.id)
      listSync.getItemsFromDb({ids: [tag.id], type: 'tag'})
      void reloadTagsCatalog()
    }
  } finally {
    dialogsStore.process.show = false
    dialogsStore.process.text = null
  }
}

const showMenu = (e: MouseEvent | KeyboardEvent, tag: TagWithMeta): void => {
  hideHoverImage()

  const locale = toLocale(settingsStore.locale)
  const t = (key: string, params: Record<string, string | number> = {}) => translate(key, params, locale)
  const clientX = e instanceof MouseEvent ? e.clientX : 0
  const clientY = e instanceof MouseEvent ? e.clientY : 0

  const canTpdbAutoScrape = isAdultUiAvailable() && Boolean(tag.meta?.scraper)
  const canTmdbAutoScrape = isTmdbUiAvailable()
    && isTmdbPersonCategory(tag.meta, [
      ...assignmentRows.value,
      ...itemsStore.sortedAssigned,
    ])

  const contextMenu: ItemContextMenuEntry[] = [
    {
      name: t('context_menu.edit_tag'),
      type: "item",
      icon: "pencil",
      action: () => {
        const meta = appStore.getMetaById(tag.metaId)
        if (meta) dialogsStore.editTag(tag, meta)
      },
    },
    {
      name: t('context_menu.copy_tag'),
      type: 'item',
      icon: 'content-copy',
      action: () => {
        void copyToClipboard(String(tag.name ?? ''), {
          successText: t('common.copied'),
        })
      },
    },
  ]

  const focused = Number(sessionFocusStore.tagId) === Number(tag.id)
  contextMenu.push({
    name: focused ? t('session_focus.clear') : t('session_focus.start'),
    type: 'item',
    icon: focused ? 'bullseye-arrow' : 'bullseye',
    action: () => {
      if (focused) {
        clearFocus()
        return
      }
      startFocus({
        tagId: Number(tag.id),
        metaId: Number(tag.metaId),
        name: String(tag.name || ''),
        icon: tag.meta?.icon ? String(tag.meta.icon) : null,
        color: tag.color ? String(tag.color) : null,
      })
    },
  })

  if (canTpdbAutoScrape || canTmdbAutoScrape) {
    contextMenu.push({type: 'divider'})
    if (canTpdbAutoScrape) {
      contextMenu.push({
        name: t('context_menu.auto_scrape'),
        type: 'item',
        icon: 'cloud-download',
        disabled: scraperStore.autoScrapeInProgress,
        action: () => {
          void autoScrapeTpdbTag(tag)
        },
      })
    }
    if (canTmdbAutoScrape) {
      contextMenu.push({
        name: t('context_menu.tmdb_auto_scrape'),
        type: 'item',
        icon: 'movie-search-outline',
        action: () => {
          void autoScrapeTmdbTag(tag)
        },
      })
    }
  }

  contextMenu.push(
    {type: 'divider'},
    {
      name: t('context_menu.filter_by_tag'),
      type: "item",
      icon: "filter",
      action: () => {
        filterByTag(tag)
      },
    },
    {type: 'divider'},
    {
      name: t('context_menu.open_page'),
      type: "item",
      icon: "open-in-app",
      disabled: getPath(tag) == router.currentRoute.value.fullPath,
      action: () => {
        const url = getPath(tag)
        router.push(url)
      },
    },
    {
      name: t('context_menu.open_in_new_tab'),
      type: "item",
      icon: "tab",
      action: () => {
        openNewTab(tag)
      },
    },
    {type: 'divider'},
    tag.fromFolder
      ? {
        name: t('items.tag_from_folder'),
        type: 'item',
        icon: 'folder-outline',
        disabled: true,
        action: undefined,
      }
      : {
        name: t('common.remove'),
        type: 'item',
        icon: 'close',
        color: 'error',
        action: () => {
          removeTag(tag)
        },
      },
  )

  contextMenuStore.showContextMenu({
    x: clientX,
    y: clientY,
    content: contextMenu,
    tagMeta: tag,
    targetItemId: props.item.id,
    targetNestedTagId: tag.id,
  })
}
</script>

<style scoped>
.tag-chip--from-folder {
  opacity: 0.92;
  border-style: dashed !important;
}
</style>
