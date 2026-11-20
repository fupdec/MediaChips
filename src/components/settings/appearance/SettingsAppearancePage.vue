<script setup lang="ts">
import SettingsSegmentedControl from '@/components/ui/SettingsSegmentedControl.vue'
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useSettingsStore} from '@/stores/settings'
import SettingsSwitch from '@/components/ui/SettingsSwitch.vue'
import SettingsGroupPanel from '@/components/ui/SettingsGroupPanel.vue'
import {setOption} from '@/services/settingsService'
import ItemsPaginationBar from '@/components/elements/ItemsPaginationBar.vue'

const settingsStore = useSettingsStore()
const SETTINGS = computed(() => settingsStore)
const examplePage = ref(50)
const {t} = useI18n()
</script>

<template>
  <SettingsGroupPanel icon="monitor-dashboard" :title="t('settings_labels.appearance.group_interface')">
    <settings-switch
      :title="t('settings_labels.appearance.saved_filters')"
      :hint="t('settings_labels.appearance.saved_filters_hint')"
      option="showSavedFilters"
    />

    <settings-switch
      :title="t('settings_labels.appearance.alphabet_filter')"
      :hint="t('settings_labels.appearance.alphabet_filter_hint')"
      option="showAlphabetFilter"
    />

    <settings-switch
      :title="t('settings_labels.appearance.color_filter')"
      :hint="t('settings_labels.appearance.color_filter_hint')"
      option="showColorFilter"
    />

    <settings-switch
      :title="t('settings_labels.appearance.inspector_inline_edit')"
      :hint="t('settings_labels.appearance.inspector_inline_edit_hint')"
      option="inspectorInlineEdit"
    />

    <settings-switch
      :title="t('settings_labels.appearance.sticky_control_deck')"
      :hint="t('settings_labels.appearance.sticky_control_deck_hint')"
      option="stickyControlDeck"
    />

    <settings-switch
      :title="t('settings_labels.appearance.quick_action_button')"
      :hint="t('settings_labels.appearance.quick_action_button_hint')"
      option="show_quick_action_button"
    />
  </SettingsGroupPanel>

  <SettingsGroupPanel icon="pencil-outline" :title="t('settings_labels.appearance.group_editing')">
    <settings-switch
      option="showIconsOfMetaInEditingDialog"
      :hide-details="false"
    >
      <template #label>
        <div class="d-flex flex-column ml-4">
          <div class="text-body-1 text-high-emphasis">{{ t('settings_labels.appearance.meta_icon_editing_dialog') }}</div>
          <div class="d-flex align-center text-medium-emphasis text-caption">
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


  </SettingsGroupPanel>

  <SettingsGroupPanel icon="view-agenda-outline"
    :title="t('settings_labels.appearance.group_layout')"
    :spaced="false"
  >
    <div class="d-flex align-center flex-wrap mb-4">
      <div class="text-body-1 text-high-emphasis mb-2 mr-4">
        <v-icon start>mdi-view-agenda</v-icon>
        {{ t('settings_labels.appearance.gap_size_between_items') }}
      </div>

      <SettingsSegmentedControl
        v-model="SETTINGS.gapSize"
        @update:model-value="setOption($event, 'gapSize')"
        class="mb-2"
        :label="t('settings_labels.appearance.gap_size_between_items')"
        :items="[
          {value: 'xs', title: 'XS'},
          {value: 's', title: 'S'},
          {value: 'm', title: 'M'},
          {value: 'l', title: 'L'},
          {value: 'xl', title: 'XL'},
        ]"
      />
    </div>

    <div class="d-flex align-center flex-wrap">
      <div class="text-body-1 text-high-emphasis mb-2 mr-4">
        <v-icon start>mdi-page-next</v-icon>
        {{ t('settings_labels.appearance.visible_pages_pagination') }}
      </div>

      <SettingsSegmentedControl
        v-model="SETTINGS.numberOfPagesLimit"
        @update:model-value="setOption($event, 'numberOfPagesLimit')"
        class="mb-2"
        :label="t('settings_labels.appearance.visible_pages_pagination')"
        :items="[
          {value: '5', title: '5'},
          {value: '7', title: '7'},
          {value: '9', title: '9'},
          {value: '11', title: '11'},
          {value: '13', title: '13'},
          {value: '15', title: '15'},
        ]"
      />
    </div>

    <v-card
      variant="tonal"
      class="text-caption mt-3 pa-4"
      color="primary"
      rounded="xl"
    >
      {{ t('settings_labels.appearance.example_pagination') }}
      <ItemsPaginationBar
        class="mt-2"
        v-model:page="examplePage"
        :pages="99"
        :total-visible="Number(SETTINGS.numberOfPagesLimit) || 7"
      />
    </v-card>
  </SettingsGroupPanel>
</template>
