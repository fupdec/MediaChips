<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useSettingsStore } from "@/stores/settings";
import SettingsSwitch from "@/components/ui/SettingsSwitch.vue";
import SettingsCategoryDivider from "@/components/ui/SettingsCategoryDivider.vue";
import {setOption} from '@/services/settingsService'

const settingsStore = useSettingsStore();
const SETTINGS = computed(() => settingsStore);
const {t} = useI18n();

const slideshowIntervalSeconds = computed(() => {
  const raw = Number(SETTINGS.value.imageSlideshowInterval)
  if (!Number.isFinite(raw)) return 4
  return Math.min(30, Math.max(1, Math.round(raw)))
})

const onSlideshowIntervalChange = (val: number | number[]) => {
  const seconds = Array.isArray(val) ? val[0] : val
  void setOption(String(seconds), 'imageSlideshowInterval')
}
</script>

<template>
  <SettingsCategoryDivider
    :title="t('settings_labels.appearance.page')"
    icon="page-layout-body"
  />

  <settings-switch
    :title="t('settings_labels.appearance.saved_filters')"
    :hint="t('settings_labels.appearance.saved_filters_hint')"
    option="showSavedFilters"
  ></settings-switch>

  <settings-switch
    :title="t('settings_labels.appearance.quick_action_button')"
    :hint="t('settings_labels.appearance.quick_action_button_hint')"
    option="show_quick_action_button"
  ></settings-switch>

  <settings-switch
    option="showIconsOfMetaInEditingDialog"
    :hide-details="false"
  >
    <template #label>
      <div class="d-flex flex-column ml-4">
        <div class="text-body-1 text-high-emphasis">{{ t('settings_labels.appearance.meta_icon_editing_dialog') }}</div>
        <div class="d-flex align-center text-medium-emphasis  text-caption">
          <span class="mr-4">{{ t('common.sample') }}</span>
          <v-text-field
            model-value="John"
            :prepend-icon="SETTINGS.showIconsOfMetaInEditingDialog == '1' ? `mdi-account` : ''"
            density="compact"
            class="pa-0 ma-0"
            hide-details
            variant="filled"
            readonly
          />
        </div>
      </div>
    </template>
  </settings-switch>

  <div id="settings-editing-overview">
    <settings-switch
      option="editingOverviewExpanded"
      :title="t('settings_labels.appearance.editing_overview_expanded')"
      :hint="t('settings_labels.appearance.editing_overview_expanded_hint')"
    />
  </div>

  <settings-switch
    option="mixedTagsInputInEditingDialog"
    :title="t('settings_labels.appearance.mixed_tags_input')"
    :hint="t('settings_labels.appearance.mixed_tags_input_hint')"
  />

  <settings-switch
    option="showIconsInsteadTextOnFiltersChips"
    :hide-details="false"
  >
    <template #label>
      <div class="d-flex flex-column ml-4">
        <div class="text-body-1 text-high-emphasis">{{ t('settings_labels.appearance.icons_filter_chips') }}</div>
        <div class="text-caption text-medium-emphasis mt-1">
          <span class="mr-4">{{ t('common.sample') }}</span>
          <v-chip
            v-if="SETTINGS.showIconsInsteadTextOnFiltersChips == '0'"
            color="primary"
            size="small"
          >
            {{ t('settings_labels.appearance.filter_chip_sample') }}
          </v-chip>
          <v-chip v-else
            color="primary"
            size="small">
            <v-icon start>mdi-account</v-icon>
            <v-icon start>mdi-not-equal-variant</v-icon>
            "John"
          </v-chip>
        </div>
      </div>
    </template>
  </settings-switch>

  <div class="d-flex align-center flex-wrap mt-4 mb-8">
    <div class="text-body-1 text-high-emphasis mb-2 mr-4">
      <v-icon start>mdi-view-agenda</v-icon>
      {{ t('settings_labels.appearance.gap_size_between_items') }}
    </div>

    <v-btn-toggle
      v-model="SETTINGS.gapSize"
      @update:model-value="setOption($event, 'gapSize')"
      color="primary"
      class="mb-2"
      rounded="xl"
      mandatory
    >
      <v-btn variant="outlined" value="xs">XS</v-btn>
      <v-btn variant="outlined" value="s">S</v-btn>
      <v-btn variant="outlined" value="m">M</v-btn>
      <v-btn variant="outlined" value="l">L</v-btn>
      <v-btn variant="outlined" value="xl">XL</v-btn>
    </v-btn-toggle>
  </div>

  <div class="d-flex align-center flex-wrap">
    <div class="text-body-1 text-high-emphasis mb-2 mr-4">
      <v-icon start>mdi-page-next</v-icon>
      {{ t('settings_labels.appearance.visible_pages_pagination') }}
    </div>

    <v-btn-toggle
      v-model="SETTINGS.numberOfPagesLimit"
      @update:model-value="setOption($event, 'numberOfPagesLimit')"
      color="primary"
      class="mb-2"
      rounded="xl"
      mandatory
    >
      <v-btn variant="outlined" value="5">5</v-btn>
      <v-btn variant="outlined" value="7">7</v-btn>
      <v-btn variant="outlined" value="9">9</v-btn>
      <v-btn variant="outlined" value="11">11</v-btn>
      <v-btn variant="outlined" value="13">13</v-btn>
      <v-btn variant="outlined" value="15">15</v-btn>
    </v-btn-toggle>
  </div>

  <v-card variant="tonal" class="text-caption mt-3 pa-4" color="primary" rounded="xl">
    {{ t('settings_labels.appearance.example_pagination') }}
    <v-pagination
      :total-visible="SETTINGS.numberOfPagesLimit"
      :length="99"
      active-color="primary"
      density="comfortable"
      rounded
    />
  </v-card>

  <div class="pt-6"></div>

  <SettingsCategoryDivider
    :title="t('settings_labels.appearance.image_viewer')"
    icon="image-multiple-outline"
  />

  <div class="mt-2 mb-6" style="max-width: 420px">
    <div class="d-flex align-center justify-space-between mb-1">
      <span class="text-body-1 text-high-emphasis">
        {{ t('settings_labels.appearance.slideshow_interval') }}
      </span>
      <span class="text-caption text-medium-emphasis">
        {{ slideshowIntervalSeconds }}s
      </span>
    </div>
    <div class="text-caption text-medium-emphasis mb-2">
      {{ t('settings_labels.appearance.slideshow_interval_hint') }}
    </div>
    <v-slider
      :model-value="slideshowIntervalSeconds"
      @update:model-value="onSlideshowIntervalChange"
      min="1"
      max="30"
      step="1"
      track-size="7"
      density="compact"
      color="primary"
      hide-details
      thumb-label
    />
  </div>

  <settings-switch
    option="imageSlideshowLoop"
    :title="t('settings_labels.appearance.slideshow_loop')"
    :hint="t('settings_labels.appearance.slideshow_loop_hint')"
  />

  <settings-switch
    option="virtualImageGrid"
    :title="t('settings_labels.appearance.virtual_image_grid')"
    :hint="t('settings_labels.appearance.virtual_image_grid_hint')"
  />

  <div class="pt-6"></div>
</template>