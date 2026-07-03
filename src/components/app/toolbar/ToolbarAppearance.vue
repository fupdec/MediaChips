<template>
  <v-card
    rounded="xl"
    variant="tonal"
    color="primary"
    class="mb-6"
  >
    <v-overlay
      :model-value="!itemsStore.isFiltersLoaded"
      :opacity="0.1"
      contained
      persistent
      class="d-flex justify-center align-center"
    >
      <v-progress-circular indeterminate size="100" width="10" color="primary"/>
    </v-overlay>

    <!-- HEADER -->
    <v-card-title class="d-flex align-center">
      <span class="text-h5">
        {{ t('settings_labels.appearance.title') }}
      </span>

      <v-spacer/>

      <v-btn
        icon
        variant="text"
        @click="toolbarStore.appearance.show = false"
      >
        <v-icon>mdi-close</v-icon>
      </v-btn>
    </v-card-title>

    <v-card-text>
      <v-row>
        <!-- Items Per Page -->
        <v-col cols="12" sm="4">
          <div class="toolbar-section-title">{{ t('settings_labels.appearance.items_per_page') }}</div>

          <v-chip-group column>
            <v-chip
              v-for="limit in [25, 50, 75, 99, 101]"
              @click="updateLimit(limit)"
              :key="limit"
              :variant="limit === itemsStore.limit ? 'flat' : 'outlined'"
              base-color="primary"
            >
              <span v-if="limit > 100">∞</span>
              <span v-else>{{ limit }}</span>
            </v-chip>
          </v-chip-group>
        </v-col>

        <!-- Item Size -->
        <v-col cols="12" sm="4">
          <div class="toolbar-section-title">{{ t('settings_labels.appearance.item_size') }}</div>

          <v-chip-group column>
            <v-chip
              v-for="(label, index) in ['XS', 'S', 'M', 'L', 'XL', 'XXL']"
              @click="updateSize(index + 1)"
              :key="label"
              :variant="index + 1 === itemsStore.size ? 'flat' : 'outlined'"
              base-color="primary"
            >
              <span>{{ label }}</span>
            </v-chip>
          </v-chip-group>
        </v-col>

        <!-- View -->
        <v-col cols="12" sm="4">
          <div class="toolbar-section-title">{{ t('items.view_type') }}</div>

          <ItemsView/>
        </v-col>

        <!-- Visibility of Pinned Meta -->
        <v-col cols="12">
          <div class="toolbar-section-title">
            <span>{{ t('meta.settings.pinned_meta_visibility') }}</span>
            <v-btn
              @click="dialogEditingPinnedMeta = true"
              color="primary"
              class="ml-4"
              :title="t('meta.settings.edit_pinned_meta')"
              variant="tonal"
              rounded
            >
              <v-icon start>mdi-pencil-outline</v-icon>
              {{ t('meta.settings.edit_pinned_meta') }}
            </v-btn>
          </div>

          <v-chip-group v-if="itemsStore.assigned?.length" column class="pb-0 mt-2">
            <v-chip
              v-for="assigned_meta in itemsStore.assigned"
              @click="toggleMetaVisibility(assigned_meta)"
              :key="assigned_meta.id"
              :variant="assigned_meta.show ? 'flat' : 'outlined'"
              base-color="primary"
            >
              <v-icon start>mdi-{{ assigned_meta.meta?.icon }}</v-icon>
              {{ getMetaName(assigned_meta.meta, t) }}
            </v-chip>
          </v-chip-group>

          <v-alert
            v-else
            type="warning"
            icon="mdi-pin"
            class="mb-0 mt-2"
            variant="tonal"
            rounded="xl"
          >
            {{ t('meta.settings.no_pinned_meta_edit_first') }}
          </v-alert>
        </v-col>
      </v-row>
    </v-card-text>

    <!-- Dialog for Editing Pinned Meta -->
    <v-dialog
      v-model="dialogEditingPinnedMeta"
      @update:model-value="updatePinnedMeta"
      max-width="960"
      width="95vw"
      scrollable
    >
      <v-card>
        <DialogHeader
          @close="closePinnedMetaDialog"
          :header="t('meta.settings.editing_pinned_meta')"
          closable
        />

        <v-card-text class="py-4 px-2 px-sm-4">
          <SettingsMediaTypeAddedMeta
            v-if="itemsStore.type === 'media' && media_type"
            :media-type="media_type"
          />
          <MetaSettingsPinned
            v-if="itemsStore.type === 'tag' && meta"
            :meta="meta"
          />
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import {ref, computed, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useToolbarStore} from '@/stores/toolbar'
import {useEventBus} from '@/utils/eventBus'
import {typedApi} from '@/services/typedApi'

// Components
import DialogHeader from '@/components/elements/DialogHeader.vue'
import ItemsView from '@/components/app/appbar/elements/ItemsView.vue'
import SettingsMediaTypeAddedMeta from '@/components/settings/SettingsMediaTypeAddedMeta.vue'
import MetaSettingsPinned from '@/components/dialogs/meta/MetaSettingsPinned.vue'
import {getMetaName} from '@/utils/metaI18n'
import type { AssignedMeta, Meta } from '@/types/stores'
import type { MediaType } from '@/types/media'

// Stores
const itemsStore = useItemsStore()
const toolbarStore = useToolbarStore()
const mediaTypesStore = useAppStore().mediaTypes
const metaStore = useAppStore().meta
const eventBus = useEventBus()
const {t} = useI18n()

// State
const dialogEditingPinnedMeta = ref(false)

// Computed properties
const ENV = computed(() => itemsStore.environment || {})

const media_type = computed((): MediaType | null => {
  if (!ENV.value.media_type_id) return null
  return mediaTypesStore.find(i => i.id === ENV.value.media_type_id) ?? null
})

const meta = computed((): Meta | null => {
  if (!ENV.value.meta_id) return null
  return metaStore.find(i => i.id === ENV.value.meta_id) ?? null
})

interface MetaVisibilityPayload {
  data: { show: boolean }
  metaId?: number | null
  pinnedMetaId?: number
  mediaTypeId?: number | null
}

const toggleMetaVisibility = async (metaItem: AssignedMeta) => {
  try {
    const data: MetaVisibilityPayload = {
      data: {show: !metaItem.show},
    }

    if (itemsStore.type === 'tag') {
      await typedApi.updatePinnedMetaAssignment({
        ...data,
        metaId: ENV.value.meta_id,
        pinnedMetaId: metaItem.pinnedMetaId,
      })
    } else if (itemsStore.type === 'media') {
      await typedApi.updateMetaInMediaTypeAssignment({
        ...data,
        metaId: metaItem.metaId,
        mediaTypeId: ENV.value.media_type_id,
      })
    }

    // Emit event or update store
    eventBus.emit('updateAssignedMeta')
  } catch (error) {
    console.error('Error toggling meta visibility:', error)
  }
}

const updateLimit = (val: number) => {
  itemsStore.updateState({key: 'limit', value: val})
  eventBus.emit('setItemsLimit', val)
}

const updateSize = (val: number) => {
  itemsStore.updateState({key: 'size', value: val})
}

const updatePinnedMeta = () => {
  if (itemsStore.type === 'tag') {
    eventBus.emit('getMeta')
  } else {
    eventBus.emit('getMediaType')
  }
  eventBus.emit('updateAssignedMeta')
  eventBus.emit('updateLayoutItems')
}

const closePinnedMetaDialog = () => {
  dialogEditingPinnedMeta.value = false
  updatePinnedMeta()
}

// Optional: Watch for changes
watch(() => itemsStore.type, (newType) => {
  console.log('Items type changed to:', newType)
})
</script>

<style scoped>
.toolbar-section-title {
  display: flex;
  align-items: center;
  min-height: 48px;
  padding: 0 16px;
  font-size: 0.875rem;
  font-weight: 500;
  letter-spacing: normal;
  text-transform: none;
}
</style>
