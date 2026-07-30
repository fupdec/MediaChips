<template>
  <v-card
    rounded="xl"
    variant="tonal"
    color="primary"
    class="toolbar-appearance mb-6"
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

    <v-card-text class="toolbar-appearance__body pa-4">
      <div class="toolbar-appearance__actions d-flex flex-wrap align-end justify-end ga-3 mb-4">
        <ToolbarGroupBy class="toolbar-appearance__group-by"/>
        <v-btn
          @click="dialogEditingPinnedMeta = true"
          color="primary"
          :title="t('meta.settings.edit_pinned_meta')"
          variant="flat"
          rounded="xl"
          class="toolbar-appearance__edit-btn"
        >
          <v-icon start>mdi-pencil-outline</v-icon>
          {{ t('meta.settings.edit_pinned_meta') }}
        </v-btn>
      </div>

      <v-row dense class="toolbar-appearance__grid">
        <v-col cols="12" sm="4">
          <section class="toolbar-appearance__section">
            <div class="toolbar-appearance__label">
              {{ t('settings_labels.appearance.items_per_page') }}
            </div>
            <v-chip-group column class="toolbar-appearance__chips">
              <v-chip
                v-for="limit in [25, 50, 75, 99, 101]"
                :key="limit"
                @click="updateLimit(limit)"
                :variant="limit === itemsStore.limit ? 'flat' : 'outlined'"
                base-color="primary"
              >
                <span v-if="limit > 100">∞</span>
                <span v-else>{{ limit }}</span>
              </v-chip>
            </v-chip-group>
          </section>
        </v-col>

        <v-col cols="12" sm="4">
          <section class="toolbar-appearance__section">
            <div class="toolbar-appearance__label">
              {{ t('settings_labels.appearance.item_size') }}
            </div>
            <v-chip-group column class="toolbar-appearance__chips">
              <v-chip
                v-for="(label, index) in ['XS', 'S', 'M', 'L', 'XL', 'XXL']"
                :key="label"
                @click="updateSize(index + 1)"
                :variant="index + 1 === itemsStore.size ? 'flat' : 'outlined'"
                base-color="primary"
              >
                <span>{{ label }}</span>
              </v-chip>
            </v-chip-group>
          </section>
        </v-col>

        <v-col cols="12" sm="4">
          <section class="toolbar-appearance__section">
            <div class="toolbar-appearance__label">
              {{ t('items.view_type') }}
            </div>
            <ItemsView/>
          </section>
        </v-col>
      </v-row>
    </v-card-text>

    <v-dialog
      v-model="dialogEditingPinnedMeta"
      @update:model-value="updatePinnedMeta"
      max-width="860"
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
import {ref, computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useItemsPageCommands} from '@/composable/itemsPageCommands'
import {remountPageTagLayoutItems} from '@/composable/pageTagLayoutRemount'
import {reloadMetaCatalog} from '@/composable/metaCatalog'

import DialogHeader from '@/components/elements/DialogHeader.vue'
import ItemsView from '@/components/app/appbar/elements/ItemsView.vue'
import ToolbarGroupBy from '@/components/app/toolbar/ToolbarGroupBy.vue'
import SettingsMediaTypeAddedMeta from '@/components/settings/SettingsMediaTypeAddedMeta.vue'
import MetaSettingsPinned from '@/components/dialogs/meta/MetaSettingsPinned.vue'
import type { Meta } from '@/types/stores'
import type { MediaType } from '@/types/media'

const itemsStore = useItemsStore()
const mediaTypesStore = useAppStore().mediaTypes
const metaStore = useAppStore().meta
const pageCommands = useItemsPageCommands()
const {t} = useI18n()

const dialogEditingPinnedMeta = ref(false)

const ENV = computed(() => itemsStore.environment || {})

const media_type = computed((): MediaType | null => {
  if (!ENV.value.media_type_id) return null
  return mediaTypesStore.find(i => i.id === ENV.value.media_type_id) ?? null
})

const meta = computed((): Meta | null => {
  if (!ENV.value.meta_id) return null
  return metaStore.find(i => i.id === ENV.value.meta_id) ?? null
})

const updateLimit = (val: number) => {
  itemsStore.updateState({key: 'limit', value: val})
  pageCommands.setLimit(val)
}

const updateSize = (val: number) => {
  itemsStore.updateState({key: 'size', value: val})
}

const updatePinnedMeta = () => {
  if (itemsStore.type === 'tag') {
    void reloadMetaCatalog()
  }
  void pageCommands.refreshAssignedMeta()
  remountPageTagLayoutItems()
}

const closePinnedMetaDialog = () => {
  dialogEditingPinnedMeta.value = false
  updatePinnedMeta()
}
</script>

<style scoped lang="scss">
.toolbar-appearance {
  &__label {
    margin-bottom: 10px;
    padding-inline: 2px;
    font-size: 0.875rem;
    font-weight: 500;
    letter-spacing: normal;
    line-height: 1.25;
    text-transform: none;
    opacity: 0.85;
  }

  &__section {
    height: 100%;
    padding: 12px;
    border-radius: 16px;
    background: rgba(var(--v-theme-surface), 0.45);
    border: 1px solid rgba(var(--v-theme-primary), 0.1);
  }

  &__chips {
    :deep(.v-chip-group__content) {
      gap: 6px;
    }
  }

  &__group-by {
    flex: 0 1 33.333%;
    max-width: 280px;
    min-width: 180px;
    width: 100%;
  }

  &__edit-btn {
    flex: 0 0 auto;
  }
}
</style>
