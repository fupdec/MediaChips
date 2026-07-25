<template>
  <div v-if="filters.length" class="saved-filters-list">
    <v-card
      v-for="filter in filters"
      :key="filter.id"
      class="mb-4 pa-2 saved-filter"
      :class="{'saved-filter--selectable': selectable}"
      variant="tonal"
      color="primary"
      rounded="xl"
      :hover="selectable"
      @click="handleClick(filter)"
    >
      <div class="pa-1 mb-2 d-flex justify-space-between flex-wrap align-center ga-2">
        <v-btn
          v-if="editable"
          variant="text"
          rounded="xl"
          size="small"
          class="pr-4"
          @click.stop="emit('edit', filter)"
        >
          <v-icon start size="16">mdi-pencil</v-icon>
          <span class="text-body-1">{{ filter.name }}</span>
        </v-btn>

        <span
          v-else
          class="text-body-1 font-weight-medium px-2"
        >
          {{ filter.name }}
        </span>

        <v-btn
          v-if="deletable"
          variant="text"
          rounded="xl"
          color="error"
          size="small"
          class="pr-4 saved-filter_delete"
          @click.stop="emit('delete', filter)"
        >
          <v-icon start size="16">mdi-delete</v-icon>
          {{ t('common.delete') }}
        </v-btn>
      </div>

      <div class="d-flex align-center">
        <FiltersChips
          :key="filter.id"
          :filters="filter.filters ?? []"
          readonly
          is-tooltip
        />
      </div>
    </v-card>
  </div>

  <div v-else class="text-center pt-4 pb-6">
    <v-img
      src="/images/no-saved-filters.svg"
      max-height="200"
      class="mb-4"
      contain
    />
    <v-alert
      type="info"
      variant="tonal"
      density="compact"
      rounded="xl"
      class="text-start text-caption"
    >
      {{ emptyText || t('filters.no_saved_filters') }}
    </v-alert>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import {useI18n} from 'vue-i18n'
import FiltersChips from '@/components/elements/FiltersChips.vue'
import type { SavedFilter } from '@/types/stores'

const props = defineProps({
  filters: {
    type: Array as PropType<SavedFilter[]>,
    default: () => [],
  },
  selectable: {
    type: Boolean,
    default: false,
  },
  editable: {
    type: Boolean,
    default: false,
  },
  deletable: {
    type: Boolean,
    default: false,
  },
  emptyText: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['apply', 'edit', 'delete'])
const {t} = useI18n()

const handleClick = (filter: SavedFilter) => {
  if (!props.selectable) return
  emit('apply', filter)
}
</script>

<style lang="scss" scoped>
.saved-filter {
  &--selectable {
    cursor: pointer;
  }

  .saved-filter_delete {
    opacity: 0;
  }

  &:hover .saved-filter_delete {
    opacity: 1;
  }
}
</style>
