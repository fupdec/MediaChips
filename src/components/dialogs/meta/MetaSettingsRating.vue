<template>
  <SettingsSection padded>
    <settings-category-divider
      icon="star"
      compact
      :title="t('meta.settings.rating_customization')"
    />

    <v-row>
      <v-col cols="12" md="6">
        <DialogIcons
          :icon="settings.ratingIcon"
          @apply="changeIcon($event, 'ratingIcon')"
        ></DialogIcons>

        <div class="py-1"></div>

        <DialogIcons
          :icon="settings.ratingIconEmpty"
          @apply="changeIcon($event, 'ratingIconEmpty')"
        ></DialogIcons>

        <div class="py-1"></div>

        <DialogIcons
          v-if="settings.ratingHalf"
          :icon="settings.ratingIconHalf"
          @apply="changeIcon($event, 'ratingIconHalf')"
        ></DialogIcons>
      </v-col>
      <v-col cols="12" md="6">
        <div class="text-medium-emphasis text-caption mt-2 mb-1">{{ t('meta.settings.fill_color') }}</div>
        <div class="d-flex align-center mb-4">
          <v-icon @click="dialogPalette = true" :color="settings.ratingColor" size="large" class="mr-2">mdi-circle</v-icon>
          <v-btn @click="dialogPalette = true" color="primary" rounded variant="flat">
            {{ t('meta.settings.select_color') }}
          </v-btn>
        </div>

        <v-number-input
          v-model="settings.ratingMax"
          :rules="[(v) => (v > 1 && v < 11) || t('validation.incorrect_value')]"
          :min="2"
          :max="10"
          :label="t('meta.settings.max_value')"
          :hint="t('meta.settings.rating_range_hint', {max: settings.ratingMax})"
          variant="outlined"
          rounded="xl"
          class="mt-8"
          max-width="200"
        ></v-number-input>

        <v-switch v-model="settings.ratingHalf" :label="t('meta.settings.half_increment')" inset/>
      </v-col>
    </v-row>

    <ColorPicker
      :model-value="dialogPalette"
      @update:model-value="dialogPalette = $event"
      :color="settings.ratingColor"
      @close="dialogPalette = false"
      @getColor="changeColor($event)"
    />
  </SettingsSection>
</template>

<script setup lang="ts">
import {ref, watch, onMounted, nextTick, defineAsyncComponent} from 'vue'
import type {PropType} from 'vue'
import {useI18n} from 'vue-i18n'
const DialogIcons = defineAsyncComponent(() => import('@/components/dialogs/DialogIcons.vue'))
import ColorPicker from '@/components/elements/ColorPicker.vue'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import SettingsSection from '@/components/ui/SettingsSection.vue'
import type {Meta} from '@/types/stores'

interface RatingSettings {
  ratingIcon: string
  ratingIconEmpty: string
  ratingIconHalf: string
  ratingHalf: boolean
  ratingMax: number
  ratingColor: string
}


const props = defineProps({
  meta: {
    type: Object as PropType<Meta>,
    default: undefined,
  },
})

const emit = defineEmits(['update'])
const {t} = useI18n()

const dialogPalette = ref(false)

const settings = ref<RatingSettings>({
  ratingIcon: "star",
  ratingIconEmpty: "star-outline",
  ratingIconHalf: "star-half-full",
  ratingHalf: false,
  ratingMax: 5,
  ratingColor: "#ffab00",
})

const initSettings = () => {
  if (!props.meta) return

  const meta = props.meta
  if (typeof meta.ratingIcon === 'string') settings.value.ratingIcon = meta.ratingIcon
  if (typeof meta.ratingIconEmpty === 'string') settings.value.ratingIconEmpty = meta.ratingIconEmpty
  if (typeof meta.ratingIconHalf === 'string') settings.value.ratingIconHalf = meta.ratingIconHalf
  if (typeof meta.ratingHalf === 'boolean') settings.value.ratingHalf = meta.ratingHalf
  if (typeof meta.ratingMax === 'number') settings.value.ratingMax = meta.ratingMax
  if (typeof meta.ratingColor === 'string') settings.value.ratingColor = meta.ratingColor
}

const changeIcon = (icon: string, iconType: 'ratingIcon' | 'ratingIconEmpty' | 'ratingIconHalf') => {
  settings.value[iconType] = icon
}

const changeColor = (e: string) => {
  settings.value.ratingColor = e
  dialogPalette.value = false
}


onMounted(() => {
  nextTick(() => {
    initSettings()
  })
})

watch(settings.value, () => {
  emit('update', settings.value)
}, { deep: true })
</script>
