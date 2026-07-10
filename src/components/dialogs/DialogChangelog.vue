<template>
  <v-dialog
    v-model="visible"
    :fullscreen="xs"
    scrollable
    width="800"
    @after-leave="handleAfterLeave"
  >
    <v-card>
      <DialogHeader
        @close="closeDialog"
        :header="dialogTitle"
        closable
      />

      <div class="history-container">
        <div v-if="entries.length > 1" class="articles">
          <v-list nav density="compact" color="primary">
            <v-list-item
              v-for="item in entries"
              :key="item.id"
              @click="selected = item"
              :active="selected.id === item.id"
            >
              <template v-slot:title>
                <div class="text-caption mr-4">
                  <span>{{ item.version }}</span>
                  <span v-if="item.name"> ({{ item.name }})</span>
                </div>
              </template>
            </v-list-item>
          </v-list>
        </div>

        <v-divider v-if="entries.length > 1" vertical></v-divider>

        <v-card-text class="article stylish-article pt-0">
          <v-card-title class="px-0">
            <div class="d-flex align-center">
              <span>{{ selected.version }}</span>
              <span v-if="selected.name" class="ml-1">({{ selected.name }})</span>
            </div>

            <v-spacer></v-spacer>

            <span v-if="selected.date" class="text-medium-emphasis text-caption">
              {{ t('changelog.release_date', { date: formatDate(selected.date) }) }}
            </span>
          </v-card-title>

          <div v-if="!selected.content" class="text-medium-emphasis">
            {{ t('changelog.empty') }}
          </div>

          <div v-else v-html="selected.content"></div>
        </v-card-text>
      </div>

      <v-card-actions v-if="showWhatsNewActions" class="px-4 pb-4">
        <v-spacer></v-spacer>
        <v-btn color="primary" variant="flat" @click="closeDialog">
          {{ t('changelog.got_it') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { useDialogsStore } from '@/stores/dialogs'
import { closeChangelogDialog } from '@/composable/useWhatsNew'
import DialogHeader from '@/components/elements/DialogHeader.vue'

type ChangelogDialogEntry = {
  id: string
  version: string
  name: string
  date?: string
  content: string
}

const emptyEntry: ChangelogDialogEntry = {
  id: '',
  version: '',
  name: '',
  content: '',
}

const { xs } = useDisplay()
const { t } = useI18n()
const dialogsStore = useDialogsStore()

const selected = ref<ChangelogDialogEntry>(emptyEntry)

const visible = computed({
  get: () => dialogsStore.changelog.show,
  set: (value: boolean) => {
    if (!value) {
      void closeChangelogDialog()
    }
  },
})

const entries = computed(() => dialogsStore.changelog.entries)
const showWhatsNewActions = computed(() => dialogsStore.changelog.markSeenOnClose)

const dialogTitle = computed(() => {
  if (dialogsStore.changelog.title === 'whats_new') {
    return t('changelog.whats_new_title')
  }

  if (dialogsStore.changelog.title) {
    return dialogsStore.changelog.title
  }

  return t('changelog.title')
})

watch(entries, (value) => {
  selected.value = value[0] || emptyEntry
}, { immediate: true })

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString()
  } catch {
    return value
  }
}

function closeDialog() {
  visible.value = false
}

function handleAfterLeave() {
  selected.value = entries.value[0] || emptyEntry
}
</script>

<style scoped>
.history-container {
  display: flex;
  overflow: hidden;

  .articles {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    padding-top: 10px;
    max-height: calc(100% - 82px);
    width: 250px;
    max-width: 300px;
    flex: 1 0 auto;
  }

  .article {
    overflow-y: auto;
    max-height: calc(100% - 82px);
  }
}

@media (max-width: 480px) {
  .history-container {
    flex-direction: column;

    .article {
      max-height: none;
    }

    .v-divider {
      display: none;
    }
  }
}
</style>
