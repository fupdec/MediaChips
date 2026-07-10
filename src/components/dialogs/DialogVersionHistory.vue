<template>
  <v-dialog
    v-show="dialogs.versions"
    v-model="dialogs.versions"
    :fullscreen="xs"
    scrollable
    width="800"
    @after-leave="resetSelection"
  >
    <v-card>
      <DialogHeader
        @close="closeDialog"
        header="Version history"
        closable
      />

      <div class="history-container">
        <div class="articles">
          <v-list nav
            density="compact"
            color="primary"
          >
            <v-list-item v-for="item in items" :key="item.id" @click="updateActive(item)">
              <template v-slot:title>
                <div class="text-caption mr-4">
                  <span>{{ item.version }}</span>
                  <span v-if="item.name"> ({{ item.name }})</span>
                  <span v-if="item.date" class="text-medium-emphasis">
                  <span> / {{ convertDate(item.date) }}</span>
                </span>
                </div>
              </template>
            </v-list-item>
          </v-list>
        </div>

        <v-divider vertical></v-divider>

        <v-card-text class="article stylish-article pt-0">
          <v-card-title class="px-0">
            <div class="d-flex align-center">
              <span>{{ selected.version }}</span>
              <span v-if="selected.name" class="ml-1">({{ selected.name }})</span>
            </div>

            <v-spacer></v-spacer>

            <span v-if="selected.date" class="text-medium-emphasis text-caption">
              <span>Release date: </span>
              {{ convertDate(selected.date) }}
            </span>
          </v-card-title>

          <div v-if="!selected.version" class="text-center">Please select any version</div>

          <div v-else variant="flat" v-html="selected.content"></div>
        </v-card-text>
      </div>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {ref, computed, onMounted} from 'vue'
import {useDisplay} from 'vuetify'
import {useDialogsStore} from '@/stores/dialogs'
import DialogHeader from "@/components/elements/DialogHeader.vue"
import { getMergedVersionHistory } from '@/services/changelog'

interface VersionEntry {
  id: string
  version: string
  name: string
  content: string
  date?: string
}

const emptyVersion: VersionEntry = {
  id: '',
  version: '',
  name: '',
  content: '',
}

// Инициализация
const {xs} = useDisplay()
const dialogsStore = useDialogsStore()

// Реактивные данные
const activeItems = ref<VersionEntry[]>([])
const selected = ref<VersionEntry>(emptyVersion)
const items = ref<VersionEntry[]>(getMergedVersionHistory())

// Вычисляемые свойства
const dialogs = computed(() => dialogsStore)

// Методы
const updateActive = (version: VersionEntry) => {
  selected.value = version || emptyVersion
}

const convertDate = (str: string) => {
  try {
    const date = new Date(str)
    return date.toLocaleDateString()
  } catch (error) {
    console.error('Date conversion error:', error)
    return str // Возвращаем исходную строку в случае ошибки
  }
}

const closeDialog = () => {
  dialogsStore.versions = false
}

const resetSelection = () => {
  // Сбрасываем выделение при закрытии диалога
  if (activeItems.value.length > 0 && items.value && items.value.length > 0) {
    selected.value = items.value[0]
    activeItems.value = [items.value[0]]
  }
}

// Хуки жизненного цикла
onMounted(() => {
  // Устанавливаем начальный выбор
  if (items.value && items.value.length > 0) {
    selected.value = items.value[0]
    activeItems.value = [items.value[0]]
  }
})
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