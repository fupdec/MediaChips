<template>
  <component
    :is="embedded ? 'div' : 'v-card'"
    :rounded="embedded ? undefined : 'xl'"
    :variant="embedded ? undefined : 'tonal'"
    :color="embedded ? undefined : 'primary'"
    :class="embedded ? 'toolbar-appearance toolbar-appearance--embedded' : 'toolbar-appearance mb-6'"
  >
    <v-overlay
      :model-value="!itemsStore.isFiltersLoaded"
      :opacity="0.1"
      contained
      persistent
      class="d-flex justify-center align-center"
    >
      <v-progress-circular indeterminate size="64" width="6" color="primary"/>
    </v-overlay>

    <!-- Browser control-deck: one dense toolbar row -->
    <div
      v-if="embedded"
      class="toolbar-appearance__deck"
    >
      <div class="toolbar-appearance__deck-group">
        <span class="toolbar-appearance__deck-label">{{ t('settings_labels.appearance.items_per_page') }}</span>
        <div class="toolbar-appearance__deck-track">
          <button
            v-for="limit in [25, 50, 75, 99, 101]"
            :key="limit"
            type="button"
            class="toolbar-appearance__deck-opt"
            :class="{'toolbar-appearance__deck-opt--active': limit === itemsStore.limit}"
            @click="updateLimit(limit)"
          >
            <span v-if="limit > 100">∞</span>
            <span v-else>{{ limit }}</span>
          </button>
        </div>
      </div>

      <div class="toolbar-appearance__deck-group">
        <span class="toolbar-appearance__deck-label">{{ t('settings_labels.appearance.item_size') }}</span>
        <div class="toolbar-appearance__deck-track">
          <button
            v-for="(label, index) in ['XS', 'S', 'M', 'L', 'XL', 'XXL']"
            :key="label"
            type="button"
            class="toolbar-appearance__deck-opt"
            :class="{'toolbar-appearance__deck-opt--active': index + 1 === itemsStore.size}"
            @click="updateSize(index + 1)"
          >
            {{ label }}
          </button>
        </div>
      </div>

      <div class="toolbar-appearance__deck-group toolbar-appearance__deck-group--view">
        <span class="toolbar-appearance__deck-label">{{ t('items.view_type') }}</span>
        <ItemsView dense/>
      </div>
    </div>

    <!-- Classic / standalone card layout -->
    <div
      v-else
      class="v-card-text toolbar-appearance__body pa-4"
    >
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
    </div>

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
  </component>
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

defineProps({
  embedded: {
    type: Boolean,
    default: false,
  },
})

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
      gap: 4px;
      flex-wrap: nowrap;
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

  &--embedded {
    position: relative;
  }

  &__deck {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 12px 14px;
    padding: 10px 14px;
    background: rgba(var(--v-theme-primary), 0.03);
  }

  &__deck-group {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    min-width: 0;

    & + & {
      padding-left: 14px;
      border-left: 1px solid rgba(var(--v-theme-primary), 0.12);
    }

    &--view {
      min-width: 0;
    }
  }

  &__deck-label {
    font-size: 0.6875rem;
    font-weight: 400;
    letter-spacing: normal;
    text-transform: none;
    opacity: 0.55;
    padding-inline: 6px;
    line-height: 1.2;
  }

  &__deck-track {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: 999px;
    background: rgba(var(--v-theme-surface), 0.9);
    border: 1px solid rgba(var(--v-theme-primary), 0.12);
  }

  &__deck-opt {
    appearance: none;
    border: 0;
    margin: 0;
    min-width: 28px;
    height: 26px;
    padding: 0 8px;
    border-radius: 999px;
    background: transparent;
    color: rgba(var(--v-theme-primary), 0.72);
    font: inherit;
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1;
    cursor: pointer;
    transition: background-color 120ms ease, color 120ms ease;

    &:hover {
      background: rgba(var(--v-theme-primary), 0.08);
      color: rgb(var(--v-theme-primary));
    }

    &--active {
      background: rgb(var(--v-theme-primary));
      color: rgb(var(--v-theme-on-primary));

      &:hover {
        background: rgb(var(--v-theme-primary));
        color: rgb(var(--v-theme-on-primary));
      }
    }
  }

  &__deck-field {
    flex: 0 0 auto;
    width: 220px;
    min-width: 200px;
    max-width: 240px;

    :deep(.v-input) {
      margin: 0;
    }

    :deep(.v-field) {
      --v-input-control-height: 36px;
    }

    :deep(.v-field__input) {
      min-height: 36px !important;
      font-size: 0.8125rem;
      flex-wrap: nowrap;
      overflow: hidden;
    }

    :deep(.v-select__selection) {
      max-width: 100%;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }

  &__deck-field &__group-by {
    max-width: none;
    min-width: 0;
    width: 100%;
  }
}
</style>
