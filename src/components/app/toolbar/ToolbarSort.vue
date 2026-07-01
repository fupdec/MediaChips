<template>
  <v-autocomplete
    :model-value="items.sortBy"
    @update:model-value="sort"
    :items="sortParams"
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
    <template v-slot:selection="{ item }">
      <template v-if="item?.raw?.textKey">
        <v-icon :icon="`mdi-${item.raw.icon}`"
          size="small"></v-icon>
        <span class="pl-2">{{ t(item.raw.textKey) }}</span>
      </template>
      <span v-else class="pl-2">{{ selectionLabel }}</span>
    </template>
    <template v-slot:item="{ item, props: menuProps }">
      <v-list-item v-bind="menuProps"
        density="compact">
        <template v-slot:title>
          <div class="text-body-2 py-1">
            <v-icon :icon="`mdi-${item.raw.icon}`"
              size="small"></v-icon>
            <span class="pl-4">{{ t(item.raw.textKey) }}</span>
          </div>
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
import {MEDIA_SORT_PARAMS} from '@/utils/mediaSortFilter'

/* ================= STORES ================= */

const itemsStore = useItemsStore()
const appStore = useAppStore()
const eventBus = useEventBus()
const {t} = useI18n()

/* ================= DATA ================= */

const params = MEDIA_SORT_PARAMS

/* ================= COMPUTED ================= */

const items = computed(() => itemsStore)
const env = computed(() => itemsStore.environment)

const sortParams = computed(() => {
  const currentMediaType = getCurrentMediaType(appStore.mediaTypes, env.value.media_type_id)

  return params.filter(p =>
    p.types.includes(items.value.type) &&
    matchesMediaTypeFilter(p, currentMediaType)
  )
})

const selectionLabel = computed(() => {
  const current = sortParams.value.find((param) => param.param === items.value.sortBy)
  return current ? t(current.textKey) : t('filters.sort_by')
})

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

function sort(param: string) {
  if (items.value.sortBy === param) {
    toggleDir()
    return
  }

  itemsStore.setSortBy(param)
  eventBus.emit("setItemsSortBy", param);
}
</script>
