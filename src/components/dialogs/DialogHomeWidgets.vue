<template>
  <v-dialog
    :model-value="modelValue"
    width="560"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="xl">
      <DialogHeader
        icon="view-dashboard-outline"
        :header="t('settings_labels.general.home_widgets')"
        closable
        @close="emit('update:modelValue', false)"
      />

      <v-card-text class="pa-4 pa-sm-6">
        <v-alert
          type="info"
          variant="tonal"
          density="compact"
          rounded="xl"
          class="mb-4"
        >
          <span class="text-caption">{{ t('settings_labels.general.home_widgets_hint') }}</span>
        </v-alert>

        <HomeWidgetsEditor/>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import HomeWidgetsEditor from '@/components/widgets/HomeWidgetsEditor.vue'

defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue'])

const {t} = useI18n()
</script>
