<template>
  <v-tooltip
    v-if="showTrash"
    location="bottom"
  >
    <template #activator="{ props }">
      <v-btn
        v-bind="props"
        icon
        @click="dialogsStore.openMediaTrash()"
      >
        <v-icon>mdi-delete-outline</v-icon>
      </v-btn>
    </template>
    <span>{{ t('media_trash.title') }}</span>
  </v-tooltip>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {useDialogsStore} from '@/stores/dialogs'
import {useSettingsStore} from '@/stores/settings'

const dialogsStore = useDialogsStore()
const settingsStore = useSettingsStore()
const {t} = useI18n()

const showTrash = computed(() => settingsStore.showTrashInNavigation === '1')
</script>
