<template>
  <section v-if="marks.length" class="widget-random-markers mb-6">
    <div class="d-flex align-center justify-space-between mb-3">
      <div class="d-flex align-center text-h6">
        <v-icon class="mr-2" size="24">mdi-tooltip-outline</v-icon>
        <span>{{ t('home.widgets.random_markers') }}</span>
      </div>

      <div class="d-flex align-center ga-1">
        <v-btn
          @click="loadMarks"
          :loading="loading"
          color="primary"
          icon
          size="small"
          variant="text"
          :title="t('home.widgets.random_markers_refresh')"
        >
          <v-icon>mdi-shuffle</v-icon>
        </v-btn>

        <v-btn
          to="/markers"
          color="primary"
          variant="text"
          rounded
          size="small"
        >
          {{ t('home.widgets.view_all') }}
          <v-icon end size="18">mdi-chevron-right</v-icon>
        </v-btn>
      </div>
    </div>

    <div class="widget-random-markers__scroll">
      <div
        v-for="mark in marks"
        :key="mark.id"
        class="widget-random-markers__item"
      >
        <ItemMarker :mark="mark" plain-card/>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import {onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import ItemMarker from '@/components/items/ItemMarker.vue'
import type { MarkItem } from '@/types/stores'

const props = withDefaults(defineProps<{
  limit?: number
}>(), {
  limit: 8,
})

const {t} = useI18n()

const marks = ref<MarkItem[]>([])
const loading = ref(false)

async function loadMarks() {
  loading.value = true

  try {
    const response = await typedApi.getHomeMarkers({limit: props.limit})
    marks.value = response.data?.marks || []
  } catch (error) {
    console.error(error)
    marks.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadMarks()
})

watch(() => props.limit, () => loadMarks())
</script>

<style lang="scss" scoped>
.widget-random-markers {
  &__scroll {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    overflow-x: auto;
    padding-bottom: 4px;
    scroll-snap-type: x proximity;
  }

  &__item {
    width: 168px;
    flex: 0 0 168px;
    scroll-snap-align: start;

    :deep(.item--plain-card > .v-card.item-mark) {
      box-shadow: unset;
    }

    :deep(.item-mark) {
      .v-card-subtitle {
        margin-top: 8px !important;
        font-size: 0.75rem;
        line-height: 1.2;
      }

      .v-card-text {
        padding-top: 4px;
        padding-bottom: 8px;
      }

      .time {
        font-size: 11px;
        padding: 0 6px;
      }
    }
  }
}
</style>
