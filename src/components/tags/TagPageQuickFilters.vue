<template>
  <div
    v-if="shouldShow"
    class="tag-quick-filters"
  >
    <v-alert
      v-if="loading"
      type="info"
      variant="tonal"
      rounded="xl"
      density="comfortable"
      class="mb-0 mx-auto"
      style="max-width: 480px"
    >
      {{ t('tags.quick_filters_loading') }}
      <v-progress-linear
        indeterminate
        color="primary"
        rounded
        height="4"
        class="mt-3"
      />
    </v-alert>

    <div
      v-else-if="groups.length > 0"
      class="tag-quick-filters__shell"
    >
      <button
        type="button"
        class="tag-quick-filters__chrome"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <div class="tag-quick-filters__chrome-start">
          <v-icon
            size="18"
            icon="mdi-filter-outline"
          />
          <span class="tag-quick-filters__chrome-title">{{ t('tags.quick_filters') }}</span>
          <v-chip
            v-if="activeChipsCount > 0"
            size="x-small"
            color="primary"
            variant="flat"
            class="tag-quick-filters__active-count"
          >
            {{ activeChipsCount }}
          </v-chip>
          <v-tooltip location="top">
            <template #activator="{ props: tipProps }">
              <v-btn
                v-bind="tipProps"
                icon
                variant="text"
                size="x-small"
                :aria-label="t('tags.quick_filters_hint')"
                @click.stop
              >
                <v-icon size="16">mdi-help-circle-outline</v-icon>
              </v-btn>
            </template>
            <span>{{ t('tags.quick_filters_hint') }}</span>
          </v-tooltip>
        </div>

        <v-icon
          class="tag-quick-filters__chevron"
          size="18"
        >
          {{ expanded ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
        </v-icon>
      </button>

      <v-expand-transition>
        <div
          v-if="expanded"
          class="tag-quick-filters__body"
        >
          <div
            v-for="(group, groupIndex) in groups"
            :key="group.metaId"
            class="tag-quick-filters__group"
          >
            <div
              class="tag-quick-filters__group-label"
              :class="{'tag-quick-filters__group-label--first': groupIndex === 0}"
            >
              <v-icon size="small" class="mr-1">mdi-{{ group.meta.icon || 'tag' }}</v-icon>
              <span>{{ group.meta.name }}</span>
            </div>
            <div class="tag-quick-filters__chips">
              <span
                v-for="chip in group.chips"
                :key="chip.id"
                class="tag-quick-filters__chip-wrap"
                :class="{
                  'tag-quick-filters__chip-wrap--active': isSelected(group.metaId, chip.id),
                  'tag-quick-filters__chip-wrap--label': chip.label,
                }"
              >
                <v-chip
                  :size="isSelected(group.metaId, chip.id) ? 'large' : 'small'"
                  filter
                  :label="chip.label"
                  :variant="chip.variant"
                  :color="chip.color"
                  :style="chip.textColor ? { color: chip.textColor } : undefined"
                  :prepend-icon="isSelected(group.metaId, chip.id) ? 'mdi-check' : undefined"
                  :class="[
                    chip.className,
                    isSelected(group.metaId, chip.id) ? 'active-chip px-3' : 'px-2',
                  ]"
                  :disabled="chip.id === pageTagId"
                  @click="toggleChip(group.metaId, chip.id)"
                  @mouseover.stop="onChipHover($event, group.metaId, chip.id)"
                  @mouseleave.stop="hideHoverImage()"
                >
                  {{ chip.name }}
                </v-chip>
              </span>
            </div>
          </div>
        </div>
      </v-expand-transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useSettingsStore} from '@/stores/settings'
import {typedApi} from '@/services/typedApi'
import {getFilterObject, getTextColor} from '@/services/formatUtils'
import {useItemsPageCommands} from '@/composable/itemsPageCommands'
import {TAG_PAGE_QUICK_FILTER_NOTE} from '@/constants/tagPageQuickFilter'
import {hideHoverImage, showHoverImage} from '@/services/hoverService'
import {resolveTagChipColor} from '@shared/tagChipColor'
import {toChipVariant, type ChipVariant} from '@/utils/chipVariant'
import type {Meta} from '@/types/stores'

interface CooccurringTag {
  id: number
  name: string
  metaId: number
  color: string | null
}

interface QuickFilterChip {
  id: number
  name: string
  label: boolean | undefined
  variant: ChipVariant
  color: string | undefined
  textColor: string | undefined
  className: string | undefined
}

interface QuickFilterGroup {
  metaId: number
  meta: Meta
  chips: QuickFilterChip[]
}

const props = defineProps<{
  tagId: number
  mediaTypeId: number | null
  pageTagId: number
}>()

const {t} = useI18n()
const appStore = useAppStore()
const itemsStore = useItemsStore()
const settingsStore = useSettingsStore()
const pageCommands = useItemsPageCommands()

const tags = ref<CooccurringTag[]>([])
const selections = ref<Record<number, number[]>>({})
const loadToken = ref(0)
const loading = ref(true)
const applyingFilters = ref(false)
/** Open by default (same as previous expand state). */
const expanded = ref(true)

const shouldShow = computed(() =>
  Boolean(props.tagId)
  && props.mediaTypeId != null
  && (loading.value || groups.value.length > 0),
)

const defaultChipVariant = computed((): ChipVariant =>
  toChipVariant(settingsStore.default_meta_chip_variant) ?? 'flat',
)

const groups = computed((): QuickFilterGroup[] => {
  const byMeta = new Map<number, CooccurringTag[]>()
  for (const tag of tags.value) {
    const metaId = Number(tag.metaId)
    if (!Number.isFinite(metaId)) continue
    const list = byMeta.get(metaId) || []
    list.push(tag)
    byMeta.set(metaId, list)
  }

  const result: QuickFilterGroup[] = []
  for (const [metaId, chips] of byMeta) {
    const meta = appStore.meta.find((entry) => Number(entry.id) === metaId)
    if (!meta) continue

    result.push({
      metaId,
      meta,
      chips: chips.map((chip) => buildChip(chip, meta)),
    })
  }

  result.sort((a, b) => {
    const orderA = Number(a.meta.order) || 0
    const orderB = Number(b.meta.order) || 0
    if (orderA !== orderB) return orderA - orderB
    return String(a.meta.name || '').localeCompare(String(b.meta.name || ''))
  })

  return result
})

const activeChipsCount = computed(() =>
  Object.values(selections.value).reduce((sum, ids) => sum + ids.length, 0),
)

function buildChip(tag: CooccurringTag, meta: Meta): QuickFilterChip {
  const variant = toChipVariant(meta.chipVariant) ?? defaultChipVariant.value
  const color = resolveTagChipColor(meta.color, tag.color)
  const colored = Boolean(color)
  const label = typeof meta.chipLabel === 'boolean' ? meta.chipLabel : undefined

  return {
    id: tag.id,
    name: tag.name,
    label,
    variant,
    color: colored ? color : undefined,
    textColor: colored ? getTextColor(color, variant === 'outlined') || undefined : undefined,
    className: colored ? 'tag-chip--colored' : undefined,
  }
}

function isSelected(metaId: number, tagId: number): boolean {
  return (selections.value[metaId] || []).includes(tagId)
}

function clearSelections(): void {
  selections.value = {}
}

function selectionSignature(): string {
  return Object.entries(selections.value)
    .map(([metaId, ids]) => [Number(metaId), ids] as const)
    .filter((entry) => entry[1].length > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([metaId, ids]) => `${metaId}:${[...ids].map(Number).sort((a, b) => a - b).join(',')}`)
    .join('|')
}

function storeQuickSignature(): string {
  const byMeta = new Map<number, number[]>()
  for (const filter of itemsStore.filters) {
    if (filter.note !== TAG_PAGE_QUICK_FILTER_NOTE || filter.removed) continue
    const metaId = Number(filter.param ?? filter.metaId)
    if (!Number.isFinite(metaId)) continue
    const ids = Array.isArray(filter.val)
      ? filter.val.map(Number).filter((id) => Number.isFinite(id))
      : []
    byMeta.set(metaId, ids)
  }
  return [...byMeta.entries()]
    .filter(([, ids]) => ids.length > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([metaId, ids]) => `${metaId}:${[...ids].sort((a, b) => a - b).join(',')}`)
    .join('|')
}

function quickFiltersInSync(): boolean {
  return selectionSignature() === storeQuickSignature()
}

async function loadTags(): Promise<void> {
  const token = ++loadToken.value

  if (!props.tagId || props.mediaTypeId == null) {
    loading.value = false
    tags.value = []
    clearSelections()
    syncFiltersToStore()
    return
  }

  loading.value = true
  tags.value = []

  try {
    const res = await typedApi.getTagCooccurring(props.tagId, props.mediaTypeId)
    if (token !== loadToken.value) return
    tags.value = res.data || []

    const validIds = new Set(tags.value.map((tag) => tag.id))
    const next: Record<number, number[]> = {}
    for (const [metaId, ids] of Object.entries(selections.value)) {
      const kept = ids.filter((id) => validIds.has(id))
      if (kept.length) next[Number(metaId)] = kept
    }
    selections.value = next
  } catch (error) {
    if (token !== loadToken.value) return
    console.warn('Failed to load co-occurring tags:', error)
    tags.value = []
  } finally {
    if (token === loadToken.value) {
      loading.value = false
    }
  }
}

function syncFiltersToStore(): void {
  const remaining = itemsStore.filters.filter(
    (filter) => filter.note !== TAG_PAGE_QUICK_FILTER_NOTE,
  )
  const quick = Object.entries(selections.value).flatMap(([metaIdStr, tagIds]) => {
    if (!tagIds.length) return []
    const metaId = Number(metaIdStr)
    return [getFilterObject({
      param: metaId,
      type: 'array',
      cond: 'in',
      lock: true,
      note: TAG_PAGE_QUICK_FILTER_NOTE,
      val: [...tagIds],
      metaId,
    })]
  })
  itemsStore.filters = [...remaining, ...quick]
}

/** Update store filters and reload the list — never call setFilters/getFilters (avoids loops). */
async function applyQuickFilters(): Promise<void> {
  if (applyingFilters.value) return
  if (quickFiltersInSync()) {
    syncFiltersToStore()
    return
  }

  applyingFilters.value = true
  try {
    syncFiltersToStore()
    itemsStore.updateState({key: 'page', value: 1})
    await nextTick()
    await Promise.resolve(pageCommands.reloadItems())
  } finally {
    await nextTick()
    applyingFilters.value = false
  }
}

async function toggleChip(metaId: number, tagId: number): Promise<void> {
  if (tagId === props.pageTagId) return

  const current = [...(selections.value[metaId] || [])]
  const index = current.indexOf(tagId)
  if (index > -1) current.splice(index, 1)
  else current.push(tagId)

  if (current.length) {
    selections.value = {...selections.value, [metaId]: current}
  } else {
    const next = {...selections.value}
    delete next[metaId]
    selections.value = next
  }

  await applyQuickFilters()
}

function onChipHover(event: MouseEvent, metaId: number, tagId: number): void {
  const meta = appStore.meta.find((entry) => Number(entry.id) === metaId)
  showHoverImage(event, metaId, tagId, 'tag', {
    imageAspectRatio: typeof meta?.imageAspectRatio === 'number'
      ? meta.imageAspectRatio
      : undefined,
  })
}

watch(
  () => [props.tagId, props.mediaTypeId] as const,
  async (current, previous) => {
    const [, mediaTypeId] = current
    const prevMediaTypeId = previous?.[1]
    if (previous && mediaTypeId !== prevMediaTypeId) {
      clearSelections()
      syncFiltersToStore()
    }
    // Load chips only — do not apply filters here (that blocked the API / looped).
    await loadTags()
  },
  {immediate: true},
)

// After LayoutItems init resets filters from saved set, reinject selected quick filters once.
watch(
  () => itemsStore.isFiltersLoaded,
  async (loaded) => {
    if (!loaded || applyingFilters.value) return
    if (quickFiltersInSync()) return
    await applyQuickFilters()
  },
)

onBeforeUnmount(() => {
  const hadQuick = itemsStore.filters.some(
    (filter) => filter.note === TAG_PAGE_QUICK_FILTER_NOTE,
  )
  clearSelections()
  syncFiltersToStore()
  if (hadQuick) {
    void Promise.resolve(pageCommands.reloadItems())
  }
})
</script>
