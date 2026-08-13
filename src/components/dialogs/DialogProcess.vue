<template>
  <v-dialog
    :model-value="dialog"
    :fullscreen="xs"
    :width="560"
    scrollable
    persistent
  >
    <v-card
      class="process-dialog"
      rounded="xl"
    >
      <v-card-text class="process-dialog__body pa-5 pa-sm-6">
        <v-alert
          type="info"
          density="compact"
          variant="tonal"
          rounded="xl"
          class="text-body-2 mb-4"
        >
          {{ displayText }}
        </v-alert>

        <div class="process-dialog__loader">
          <Loading />
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, defineAsyncComponent} from 'vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'

const props = defineProps({
  dialog: {
    type: Boolean,
    required: true,
  },
  text: {
    type: String,
    default: undefined,
  },
})

const {t} = useI18n()
const {xs} = useDisplay()

const displayText = computed(() => props.text ?? t('process.wait_until_end'))

const Loading = defineAsyncComponent(() =>
  import('@/components/elements/Loading.vue'),
)
</script>

<style scoped>
.process-dialog__loader {
  display: flex;
  justify-content: center;
  padding-block: 8px 4px;
}
</style>
