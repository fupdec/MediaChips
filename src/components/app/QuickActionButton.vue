<template>
  <div class="speed-dial-container">
    <v-speed-dial
      v-model="fab"
      :top="top"
      :bottom="bottom"
      :right="right"
      :left="left"
      :direction="direction"
      :open-on-hover="hover"
      :transition="transition"
      :close-on-content-click="false"
    >
      <template v-slot:activator="{ props }">
        <v-btn
          @click="scrollTop"
          v-bind="props"
          color="primary"
          elevation="10"
          icon
        >
          <v-icon v-if="fab">
            mdi-chevron-up
          </v-icon>
          <v-icon v-else>
            mdi-flash
          </v-icon>
        </v-btn>
      </template>

      <v-tooltip location="left">
        <template v-slot:activator="{ props }">
          <v-btn
            @click="toggleFilters"
            v-bind="props"
            :color="filtersVisible ? 'primary' : ''"
            size="small"
            icon
          >
            <v-icon>mdi-filter-outline</v-icon>
          </v-btn>
        </template>
        <span>
        {{ t('appbar.buttons.filter') }}
      </span>
      </v-tooltip>

      <v-tooltip location="left">
        <template v-slot:activator="{ props }">
          <v-btn
            @click="toggleCustomizeToolbar"
            v-bind="props"
            :color="toolbarAppearanceShow ? 'primary' : ''"
            size="small"
            icon
          >
            <v-icon>mdi-tune</v-icon>
          </v-btn>
        </template>
        <span>
        {{ t('appbar.buttons.customize') }}
      </span>
      </v-tooltip>

      <!-- Выборка -->
      <v-tooltip location="left">
        <template v-slot:activator="{ props }">
          <v-btn
            @click="toggleSelect"
            v-bind="props"
            size="small"
            icon
          >
            <v-icon v-if="ITEMS.isSelect">mdi-select-off</v-icon>
            <v-icon v-else>mdi-checkbox-marked-outline</v-icon>
          </v-btn>
        </template>
        <span>
        <span v-if="ITEMS.isSelect">{{ t('appbar.buttons.unselect') }}</span>
        <span v-else>{{ t('appbar.buttons.select') }}</span>
      </span>
      </v-tooltip>

      <v-tooltip v-if="ITEMS.isSelect" location="left">
        <template v-slot:activator="{ props }">
          <v-btn
            @click="selectVisible"
            v-bind="props"
            size="small"
            icon
          >
            <v-icon>mdi-select-group</v-icon>
          </v-btn>
        </template>
        <span>
        {{ t('appbar.buttons.selectVisible') }}
      </span>
      </v-tooltip>

      <v-tooltip v-if="ITEMS.isSelect" location="left">
        <template v-slot:activator="{ props }">
          <v-btn
            @click="selectAll"
            v-bind="props"
            size="small"
            icon
          >
            <v-icon>mdi-select-all</v-icon>
          </v-btn>
        </template>
        <span>
        {{ t('appbar.buttons.selectAll') }}
      </span>
      </v-tooltip>
    </v-speed-dial>
  </div>
</template>

<script setup lang="ts">
import {ref, computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useToolbarStore} from '@/stores/toolbar'
import {scrollMainTo} from '@/utils/mainScroll'

// i18n
const {t} = useI18n()

// Stores
const filtersStore = useAppStore().filters
const itemsStore = useItemsStore()
const toolbarStore = useToolbarStore()

// Reactive data
const direction = ref('top')
const fab = ref(false)
const hover = ref(true)
const top = ref(false)
const right = ref(true)
const bottom = ref(true)
const left = ref(false)
const transition = ref('slide-y-reverse-transition')

// Computed properties
const ITEMS = computed(() => itemsStore)
const filtersVisible = computed(() => filtersStore.visible)
const toolbarAppearanceShow = computed(() => toolbarStore.appearance.show)

// Methods
const toggleFilters = () => {
  filtersStore.visible = !filtersStore.visible
}

const toggleCustomizeToolbar = () => {
  toolbarStore.toggleAppearance()
  if (toolbarStore.appearance.show) {
    scrollTop()
  }
}

const scrollTop = () => {
  scrollMainTo({ top: 0, behavior: 'smooth' })
}

const toggleSelect = () => {
  const newSelectState = !ITEMS.value.isSelect
  itemsStore.updateMultiple({
    isSelect: newSelectState,
    selection: [],
    selected_last: null
  })
}

const selectVisible = () => {
  const ids = ITEMS.value.itemsOnPage.map(i => i.id)
  itemsStore.updateState({
    key: 'selection',
    value: ids
  })
}

const selectAll = async () => {
  await itemsStore.selectAllFiltered()
}
</script>

<style lang="scss">
.speed-dial-container {
  position: fixed;
  bottom: 60px;
  right: 20px;
  width: 56px;
  height: 56px;
  z-index: 1;
}

.speed-dial-absolute {
  position: absolute;
  bottom: 24px;
  right: 24px;
}
</style>