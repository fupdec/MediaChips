<template>
  <v-autocomplete
    :model-value="items.sortBy"
    @update:model-value="sort"
    :items="sortParamsGrouped"
    item-value="param"
    rounded="xl"
    variant="outlined"
    density="compact"
    min-width="200"
    :label="t('filters.sort_by')"
    :placeholder="t('filters.select_parameter')"
    class="mx-4"
    hide-details
    :disabled="!items.isFiltersLoaded"
  >
    <template #prepend>
      <v-btn
        v-tooltip:top="t('filters.change_direction')"
        color="primary"
        variant="tonal"
        size="small"
        icon
        @click="toggleDir"
      >
        <v-icon>
          {{
            items.sortDir === 'asc'
              ? 'mdi-sort-ascending'
              : 'mdi-sort-descending'
          }}
        </v-icon>

      </v-btn>
    </template>
    <template v-slot:selection>
      <v-icon v-if="selectionIcon"
        :icon="`mdi-${selectionIcon}`"
        size="small"></v-icon>
      <span class="pl-2">{{ selectionLabel }}</span>
    </template>
    <template v-slot:item="{ item, props: menuProps }">
      <template v-if="isSortGroupHeader(item.raw)">
        <v-list-subheader>{{ getGroupText(item.raw.header) }}</v-list-subheader>
      </template>

      <template v-else-if="isSortGroupDivider(item.raw)">
        <v-divider />
      </template>

      <v-list-item v-else
        v-bind="menuProps"
        :active="isActiveSortParam(item.raw)"
        color="primary"
        density="compact">
        <template v-slot:title>
          <div class="text-body-2 py-1">
            <v-icon :icon="`mdi-${item.raw.icon}`"
              size="small"></v-icon>
            <span class="pl-4">{{ 'textKey' in item.raw && item.raw.textKey ? t(item.raw.textKey) : item.raw.text }}</span>
          </div>
        </template>
        <template v-if="isActiveSortParam(item.raw)" #append>
          <v-icon size="small">
            {{
              items.sortDir === 'asc'
                ? 'mdi-sort-ascending'
                : 'mdi-sort-descending'
            }}
          </v-icon>
        </template>
      </v-list-item>
    </template>
  </v-autocomplete>

<!--  <v-card v-show="false"-->
<!--    rounded="xl"-->
<!--    variant="tonal"-->
<!--    color="primary"-->
<!--  >-->
<!--    <v-overlay-->
<!--      :model-value="!items.isFiltersLoaded"-->
<!--      :opacity="0.1"-->
<!--      contained-->
<!--      persistent-->
<!--      class="d-flex justify-center align-center"-->
<!--    >-->
<!--      <v-progress-circular indeterminate-->
<!--        size="100"-->
<!--        width="10"-->
<!--        color="primary"/>-->
<!--    </v-overlay>-->

<!--    &lt;!&ndash; HEADER &ndash;&gt;-->
<!--    <v-card-title class="d-flex align-center">-->
<!--      <span class="text-h5">-->
<!--        Sort by-->
<!--      </span>-->

<!--      <v-btn-->
<!--        class="ml-4"-->
<!--        color="primary"-->
<!--        variant="tonal"-->
<!--        rounded-->
<!--        @click="toggleDir"-->
<!--      >-->
<!--        <v-icon start>-->
<!--          {{-->
<!--            items.sortDir === 'asc'-->
<!--              ? 'mdi-sort-ascending'-->
<!--              : 'mdi-sort-descending'-->
<!--          }}-->
<!--        </v-icon>-->
<!--        Change direction-->
<!--      </v-btn>-->

<!--      <v-spacer/>-->

<!--      <v-btn-->
<!--        icon-->
<!--        variant="text"-->
<!--        @click="toolbarStore.sort.show = false"-->
<!--      >-->
<!--        <v-icon>mdi-close</v-icon>-->
<!--      </v-btn>-->
<!--    </v-card-title>-->

<!--    &lt;!&ndash; CONTENT &ndash;&gt;-->
<!--    <v-card-text>-->
<!--      <v-chip-group column-->
<!--        class="pb-0">-->
<!--        <v-chip-->
<!--          v-for="param in sortParams"-->
<!--          :key="param.param"-->
<!--          class="ma-1"-->
<!--          base-color="primary"-->
<!--          :variant="param.param === items.sortBy ? 'flat' : 'outlined'"-->
<!--          @click="sort(param.param)"-->
<!--        >-->
<!--          <v-icon start>-->
<!--            {{ `mdi-${param.icon}` }}-->
<!--          </v-icon>-->

<!--          <span v-html="param.text"></span>-->

<!--          <v-icon v-if="param.param === items.sortBy"-->
<!--            end>-->
<!--            {{-->
<!--              items.sortDir === 'asc'-->
<!--                ? 'mdi-sort-ascending'-->
<!--                : 'mdi-sort-descending'-->
<!--            }}-->
<!--          </v-icon>-->
<!--        </v-chip>-->
<!--      </v-chip-group>-->
<!--    </v-card-text>-->
<!--  </v-card>-->
</template>

<script setup lang="ts">
import {computed, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useEventBus} from "@/utils/eventBus";
import {getCurrentMediaType, matchesMediaTypeFilter} from '@/utils/mediaType'
import {
  buildGroupedSortItems,
  getAllSortParams,
  isSortGroupDivider,
  isSortGroupHeader,
  isSortParamItem,
} from '@/utils/mediaSortFilter'

/* ================= STORES ================= */

const itemsStore = useItemsStore()
const appStore = useAppStore()
const eventBus = useEventBus()
const {t} = useI18n()

/* ================= COMPUTED ================= */

const items = computed(() => itemsStore)
const env = computed(() => itemsStore.environment)

const currentMediaType = computed(() =>
  getCurrentMediaType(appStore.mediaTypes, env.value.media_type_id),
)

const sortParams = computed(() => {
  return getAllSortParams(
    items.value.type,
    currentMediaType.value,
    items.value.safeAssigned,
  ).filter((param) =>
    param.types.includes(items.value.type) &&
    (!('media_types' in param) || matchesMediaTypeFilter(param, currentMediaType.value))
  )
})

const sortParamsGrouped = computed(() =>
  buildGroupedSortItems(sortParams.value, items.value.type, currentMediaType.value),
)

const getGroupText = (group?: string) =>
  t(`filters.groups.${group}`, group || '')

const selectionLabel = computed(() => {
  const current = sortParams.value.find((param) => String(param.param) === String(items.value.sortBy))
  if (!current) return t('filters.sort_by')
  if ('textKey' in current && current.textKey) return t(current.textKey)
  return current.text || t('filters.sort_by')
})

const selectionIcon = computed(() => {
  const current = sortParams.value.find((param) => String(param.param) === String(items.value.sortBy))
  return current?.icon || ''
})

const isActiveSortParam = (raw: unknown) =>
  isSortParamItem(raw) && String(raw.param) === String(items.value.sortBy)

const normalizeSortBy = () => {
  if (!items.value.isFiltersLoaded) return

  const allowed = sortParams.value.map((param) => String(param.param))
  const currentSortBy = items.value.sortBy == null ? '' : String(items.value.sortBy)

  if (currentSortBy && currentSortBy !== 'shuffle' && !allowed.includes(currentSortBy)) {
    const fallback = allowed.includes('createdAt') ? 'createdAt' : allowed[0]
    if (fallback && fallback !== currentSortBy) {
      itemsStore.setSortBy(fallback)
      eventBus.emit('setItemsSortBy', fallback)
    }
  }
}

watch(sortParams, normalizeSortBy)
watch(() => items.value.isFiltersLoaded, normalizeSortBy)

/* ================= METHODS ================= */

function toggleDir() {
  const dir = items.value.sortDir === 'asc' ? 'desc' : 'asc'
  itemsStore.setSortDir(dir)
  eventBus.emit("setItemsSortDir", dir);
}

function sort(param: string | number) {
  const nextSortBy = String(param)
  if (String(items.value.sortBy) === nextSortBy) {
    toggleDir()
    return
  }

  itemsStore.setSortBy(nextSortBy)
  eventBus.emit("setItemsSortBy", nextSortBy);
}
</script>
