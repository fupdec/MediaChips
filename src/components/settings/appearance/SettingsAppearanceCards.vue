<script setup lang="ts">
import {computed} from 'vue'
import {useSettingsStore} from '@/stores/settings'
import {useI18n} from 'vue-i18n'
import SettingsSwitch from '@/components/ui/SettingsSwitch.vue'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import SettingsGroupPanel from '@/components/ui/SettingsGroupPanel.vue'
import {setOption} from '@/services/settingsService'
import type {SettingsState} from '@/types/settings'

const settingsStore = useSettingsStore()
const SETTINGS = computed(() => settingsStore)
const {t} = useI18n()

type ChipVariant = 'flat' | 'tonal' | 'outlined' | 'text'

type DefaultMetaChipKey = Extract<keyof SettingsState,
  | 'show_default_meta_filesize'
  | 'show_default_meta_duration'
  | 'show_default_meta_resolution'
  | 'show_default_meta_ext'
  | 'show_default_meta_codec'
  | 'show_default_meta_bitrate'
  | 'show_default_meta_fps'
  | 'show_default_meta_number_media'
  | 'show_default_meta_number_views'
>

const chipVariants: ChipVariant[] = [
  'flat',
  'tonal',
  'outlined',
  'text',
]

const chips_default_data: Array<{icon: string; textKey: string; value: DefaultMetaChipKey}> = [
  {icon: 'harddisk', textKey: 'settings_labels.appearance.filesize', value: 'show_default_meta_filesize'},
  {icon: 'clock-outline', textKey: 'settings_labels.appearance.duration', value: 'show_default_meta_duration'},
  {icon: 'monitor-screenshot', textKey: 'settings_labels.appearance.resolution', value: 'show_default_meta_resolution'},
  {icon: 'file-outline', textKey: 'settings_labels.appearance.extension', value: 'show_default_meta_ext'},
  {icon: 'filmstrip', textKey: 'settings_labels.appearance.codec', value: 'show_default_meta_codec'},
  {icon: 'filmstrip', textKey: 'settings_labels.appearance.bitrate', value: 'show_default_meta_bitrate'},
  {icon: 'filmstrip', textKey: 'settings_labels.appearance.framerate', value: 'show_default_meta_fps'},
  {icon: 'folder-multiple-outline', textKey: 'settings_labels.appearance.number_of_media', value: 'show_default_meta_number_media'},
  {icon: 'eye-outline', textKey: 'settings_labels.appearance.number_of_views', value: 'show_default_meta_number_views'},
]
</script>

<template>
  <SettingsCategoryDivider
    :title="t('settings_labels.appearance.cards')"
    icon="post"
  />

  <SettingsGroupPanel :title="t('settings_labels.appearance.group_card_display')">
    <settings-switch
      :title="t('settings_labels.appearance.rating_favorite_description')"
      option="ratingAndFavoriteInCard"
    />

    <settings-switch
      :title="t('settings_labels.appearance.group_chips_description')"
      option="group_chips_in_card_description"
    />

    <settings-switch
      :title="t('settings_labels.appearance.show_default_metadata')"
      option="show_preset_metadata_in_card"
    />
  </SettingsGroupPanel>

  <SettingsGroupPanel
    v-if="SETTINGS.show_preset_metadata_in_card === '1'"
    :title="t('settings_labels.appearance.group_card_metadata')"
    :spaced="false"
  >
    <settings-switch
      :title="t('settings_labels.appearance.label_chips_default_metadata')"
      option="show_default_meta_label"
    />

    <v-chip-group column>
      <v-chip
        v-for="chip in chips_default_data"
        :key="chip.value"
        @click="setOption(SETTINGS[chip.value] == '1' ? '0' : '1', chip.value)"
        :variant="SETTINGS.default_meta_chip_variant as ChipVariant"
        :base-color="SETTINGS[chip.value] == '1' ? 'primary' : ''"
        :label="SETTINGS.show_default_meta_label == '1'"
      >
        <v-icon start size="small">
          mdi-{{ chip.icon }}
        </v-icon>
        <span>{{ t(chip.textKey) }}</span>
      </v-chip>
    </v-chip-group>

    <div class="d-flex align-center flex-wrap mt-4">
      <div class="text-body-1 text-high-emphasis mr-6">
        <v-icon start>mdi-label</v-icon>
        {{ t('settings_labels.appearance.chip_variant') }}
      </div>

      <v-chip-group column>
        <v-chip
          v-for="variant in chipVariants"
          :key="variant"
          @click="setOption(variant, 'default_meta_chip_variant')"
          :variant="variant"
          base-color="primary"
          :label="SETTINGS.show_default_meta_label == '1'"
        >
          <v-icon
            v-if="SETTINGS.default_meta_chip_variant == variant"
            start
          >
            mdi-check
          </v-icon>
          <span>{{ variant }}</span>
        </v-chip>
      </v-chip-group>
    </div>
  </SettingsGroupPanel>
</template>
