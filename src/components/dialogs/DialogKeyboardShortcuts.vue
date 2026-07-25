<template>
  <v-dialog
    :model-value="modelValue"
    max-width="520"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="xl">
      <DialogHeader
        :header="t('keyboard_shortcuts.title')"
        icon="keyboard"
        closable
        @close="emit('update:modelValue', false)"
      />

      <v-card-text class="pt-2">
        <div class="text-subtitle-2 mb-2">{{ t('keyboard_shortcuts.app') }}</div>
        <v-table density="compact" class="mb-4">
          <tbody>
            <tr v-for="row in appRows" :key="row.keys">
              <td class="text-medium-emphasis">{{ row.label }}</td>
              <td class="text-right">
                <v-hotkey :keys="row.keys" variant="flat"/>
              </td>
            </tr>
          </tbody>
        </v-table>

        <div class="text-subtitle-2 mb-2">{{ t('keyboard_shortcuts.select') }}</div>
        <v-table density="compact" class="mb-4">
          <tbody>
            <tr v-for="row in selectRows" :key="row.keys">
              <td class="text-medium-emphasis">{{ row.label }}</td>
              <td class="text-right">
                <v-hotkey :keys="row.keys" variant="flat"/>
              </td>
            </tr>
          </tbody>
        </v-table>

        <div class="text-subtitle-2 mb-2">{{ t('keyboard_shortcuts.player') }}</div>
        <div class="text-body-2 text-medium-emphasis mb-3">
          {{ t('keyboard_shortcuts.see_player_docs') }}
        </div>
        <v-btn
          color="primary"
          variant="tonal"
          rounded="xl"
          size="small"
          @click="emit('open-player-docs')"
        >
          <v-icon start size="small">mdi-book-open-page-variant</v-icon>
          {{ t('systemBar.keyboard_shortcuts') }}
        </v-btn>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import DialogHeader from '@/components/elements/DialogHeader.vue'

defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'open-player-docs': []
}>()

const { t } = useI18n()

const appRows = computed(() => [
  { keys: 'slash', label: t('keyboard_shortcuts.search') },
  { keys: 'a', label: t('keyboard_shortcuts.add_media') },
  { keys: 'f', label: t('keyboard_shortcuts.filters') },
  { keys: 's', label: t('keyboard_shortcuts.toggle_select') },
  { keys: 'shift+slash', label: t('keyboard_shortcuts.shortcuts') },
])

const selectRows = computed(() => [
  { keys: 'e', label: t('keyboard_shortcuts.bulk_edit') },
  { keys: 'delete', label: t('keyboard_shortcuts.delete') },
  { keys: 'esc', label: t('keyboard_shortcuts.exit_select') },
])
</script>
