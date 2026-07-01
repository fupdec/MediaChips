<template>
  <v-dialog
    :model-value="dialogs.documentation"
    :fullscreen="xs"
    scrollable
    width="960"
    @after-leave="resetSelection"
    @update:model-value="dialogs.documentation = $event"
  >
    <v-card rounded="lg">
      <DialogHeader
        @close="closeDialog"
        :header="t('documentation.title')"
        icon="help-circle"
        closable
      />
      <v-card-text class="pa-0">
        <div class="documentation-container">
          <!-- Левая колонка: TreeView -->
          <div class="treeview-column">
            <div class="sidebar-header">
              <v-text-field
                v-model="search"
                density="compact"
                :placeholder="t('documentation.search')"
                prepend-inner-icon="mdi-magnify"
                variant="outlined"
                hide-details
              />

              <v-btn
                @click="isOpenAll = !isOpenAll"
                :icon="`mdi-unfold-${isOpenAll?'less':'more'}-horizontal`"
                variant="text"
                size="small"
                class="ml-2"
              ></v-btn>
            </div>

            <div class="treeview-wrapper">
              <!-- Treeview -->
              <v-treeview
                v-model:activated="activatedIds"
                v-model:opened="openedIds"
                @update:activated="updateActivated"
                :items="filteredItems"
                :search="search"
                :open-all="isOpenAll"
                active-strategy="single-leaf"
                open-on-click
                item-title="name"
                item-value="id"
                activatable
                hoverable
                density="comfortable"
                color="primary"
                shaped
                class="styled-treeview"
              >
                <template #prepend="{ item }">
                  <v-icon :icon="getDocIcon(item as DocumentationItem)" size="small" />
                </template>
                <template #title="{ item }">
                  <div :id="'doc_' + (item as DocumentationItem).id" class="text-caption mr-4">
                    {{ (item as DocumentationItem).name || (item as DocumentationItem).title }}
                  </div>
                </template>
              </v-treeview>
            </div>
          </div>

          <!-- Разделитель -->
          <v-divider vertical />

          <!-- Правая колонка: Контент -->
          <div class="content-column" :class="{ 'no-selection': !selected.name }">
            <!-- Заглушка при отсутствии выбора -->
            <div v-if="!selected.name" class="no-selection-placeholder">
              <v-icon icon="mdi-file-tree-outline" size="large" color="grey" />
              <div class="text-h6 text-medium-emphasis mt-4">
                {{ t('documentation.select_item') }}
              </div>
              <div class="text-body-2 text-medium-emphasis mt-2">
                {{ t('documentation.choose_item') }}
              </div>
            </div>

            <!-- Контент выбранного элемента -->
            <div v-else class="selected-content">
              <!-- Заголовок -->
              <div class="content-header">
                <div class="header-left">
                  <v-icon :icon="selected.icon || 'mdi-file'" color="primary" class="mr-2" />
                  <div>
                    <div class="text-h5">{{ selected.name }}</div>
                    <div v-if="selected.subtitle || selected.description"
                      class="text-caption text-medium-emphasis mt-1">
                      {{ selected.subtitle || selected.description }}
                    </div>
                  </div>
                </div>

                <div class="header-right">
                  <v-btn
                    v-if="selected.link"
                    :href="selected.link"
                    target="_blank"
                    variant="text"
                    size="small"
                    prepend-icon="mdi-open-in-new"
                  >
                    {{ t('documentation.open') }}
                  </v-btn>

                  <v-btn
                    v-if="selected.selector"
                    @click="highlightElement(selected.selector)"
                    variant="text"
                    size="small"
                    prepend-icon="mdi-creation-outline"
                    class="ml-2"
                    color="primary"
                  >
                    {{ t('documentation.show_element') }}
                  </v-btn>
                </div>
              </div>

              <!-- Основной контент -->
              <div class="content-body">
                <v-alert v-if="errorSelector"
                  type="info"
                  class="text-caption"
                  density="compact"
                  variant="text">
                  {{ t('documentation.nothing_to_highlight') }}
                </v-alert>

                <!-- HTML контент -->
                <div v-if="selected.content" class="html-content" v-html="selected.content"></div>
                <div v-else-if="selected.id=='player.hotkeys'">
                  <v-table density="compact">
                    <thead>
                    <tr>
                      <th class="text-left">Hotkey</th>
                      <th class="text-left">Action</th>
                      <th class="text-left">Description</th>
                    </tr>
                    </thead>
                    <tbody>
                    <!-- Navigation & Playback Control -->
                    <tr>
                      <td><v-hotkey keys="Space"/></td>
                      <td>Play/Pause</td>
                      <td>Toggle between play and pause states</td>
                    </tr>
                    <tr>
                      <td><v-hotkey keys="x"/></td>
                      <td>Stop</td>
                      <td>Complete stop of video playback</td>
                    </tr>
                    <tr>
                      <td>
                        <v-hotkey keys="z"/>
                        <span class="mx-1">or</span>
                        <v-hotkey keys="alt+left"/>
                      </td>
                      <td>Previous Video</td>
                      <td>Switch to previous video in playlist</td>
                    </tr>
                    <tr>
                      <td>
                        <v-hotkey keys="c"/>
                        <span class="mx-1">or</span>
                        <v-hotkey keys="alt+right"/>
                      </td>
                      <td>Next Video</td>
                      <td>Switch to next video in playlist</td>
                    </tr>
                    <tr>
                      <td><v-hotkey keys="left"/></td>
                      <td>Seek Backward</td>
                      <td>Jump 10 seconds backward (Shift: 30 seconds)</td>
                    </tr>
                    <tr>
                      <td><v-hotkey keys="right"/></td>
                      <td>Seek Forward</td>
                      <td>Jump 10 seconds forward (Shift: 30 seconds)</td>
                    </tr>
                    <tr>
                      <td><v-hotkey keys="up"/></td>
                      <td>Volume Up</td>
                      <td>Increase volume level</td>
                    </tr>
                    <tr>
                      <td><v-hotkey keys="down"/></td>
                      <td>Volume Down</td>
                      <td>Decrease volume level</td>
                    </tr>

                    <!-- Marks System -->
                    <tr>
                      <td><v-hotkey keys="1"/></td>
                      <td>Add Favorite Mark</td>
                      <td>Create a favorite mark at current time</td>
                    </tr>
                    <tr>
                      <td><v-hotkey keys="2"/></td>
                      <td>Add Bookmark Mark</td>
                      <td>Create a bookmark mark at current time</td>
                    </tr>
                    <tr>
                      <td><v-hotkey keys=","/></td>
                      <td>Previous Mark</td>
                      <td>Jump to previous mark on timeline</td>
                    </tr>
                    <tr>
                      <td><v-hotkey keys="."/></td>
                      <td>Next Mark</td>
                      <td>Jump to next mark on timeline</td>
                    </tr>

                    <!-- Interface & Display -->
                    <tr>
                      <td><v-hotkey keys="f"/></td>
                      <td>Fullscreen</td>
                      <td>Toggle fullscreen mode</td>
                    </tr>
                    <tr>
                      <td><v-hotkey keys="p"/></td>
                      <td>Playlist</td>
                      <td>Show/hide playlist panel</td>
                    </tr>
                    <tr>
                      <td><v-hotkey keys="i"/></td>
                      <td>Marks List</td>
                      <td>Show/hide marks list panel</td>
                    </tr>
                    <tr>
                      <td><v-hotkey keys="m"/></td>
                      <td>Mute</td>
                      <td>Toggle audio mute</td>
                    </tr>

                    <!-- Advanced Functions -->
                    <tr>
                      <td><v-hotkey keys="e"/></td>
                      <td>Edit Video</td>
                      <td>Open video editing/metadata dialog</td>
                    </tr>
                    <tr>
                      <td><v-hotkey keys="esc"/></td>
                      <td>Close Player</td>
                      <td>Close the player when no dialog is open</td>
                    </tr>
                    <tr>
                      <td>
                        <v-hotkey keys="ctrl+del"/>
                        <span class="mx-1">or</span>
                        <v-hotkey keys="alt+del"/>
                      </td>
                      <td>Delete Video</td>
                      <td>Delete current video</td>
                    </tr>
                    <tr>
                      <td>
                        <v-hotkey keys="ctrl+shift+del"/>
                        <span class="mx-1">or</span>
                        <v-hotkey keys="alt+shift+del"/>
                      </td>
                      <td>Delete with File</td>
                      <td>Delete video including file from disk</td>
                    </tr>
                    </tbody>
                  </v-table>

                  <v-card class="mt-6">
                      <v-card-title class="text-h6">Mouse Controls</v-card-title>
                      <v-table density="compact">
                        <thead>
                        <tr>
                          <th class="text-left">Mouse Action</th>
                          <th class="text-left">Behavior</th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr>
                          <td>Left Click</td>
                          <td>Toggle play/pause</td>
                        </tr>
                        <tr>
                          <td>Double Click</td>
                          <td>Toggle fullscreen</td>
                        </tr>
                        <tr>
                          <td>Middle Click</td>
                          <td>Toggle fullscreen</td>
                        </tr>
                        <tr>
                          <td>Right Click (Back Button)</td>
                          <td>Previous video</td>
                        </tr>
                        <tr>
                          <td>Forward Button</td>
                          <td>Next video</td>
                        </tr>
                        <tr>
                          <td>Wheel Scroll</td>
                          <td>Volume control on video or timeline</td>
                        </tr>
                        <tr>
                          <td>
                            <v-hotkey keys="alt"/> + Wheel Scroll
                          </td>
                          <td>Navigate marks</td>
                        </tr>
                        <tr>
                          <td>
                            <v-hotkey keys="ctrl"/> + Wheel Scroll
                          </td>
                          <td>Fine seek adjustment</td>
                        </tr>
                        <tr>
                          <td>
                            <v-hotkey keys="shift"/> + Wheel Scroll
                          </td>
                          <td>Coarse seek adjustment</td>
                        </tr>
                        </tbody>
                      </v-table>
                    </v-card>
                </div>
                <div v-else class="text-body-1 text-medium-emphasis">
                  {{ t('documentation.no_content') }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import { useEventBus } from "@/utils/eventBus"
import { useDialogsStore } from '@/stores/dialogs'
import DialogHeader from "@/components/elements/DialogHeader.vue"
import Documentation from "@/assets/Documentation"
import { localizeDocumentation } from "@/assets/DocumentationTranslations"

interface DocumentationItem {
  id: string
  name?: string
  title?: string
  icon?: string
  subtitle?: string
  description?: string
  link?: string
  selector?: string | string[]
  content?: string
  children?: DocumentationItem[]
  [key: string]: unknown
}

// Инициализация
const { xs } = useDisplay()
const { t, locale } = useI18n()
const eventBus = useEventBus()
const dialogsStore = useDialogsStore()

// Реактивные данные
const isOpenAll = ref(false)
const errorSelector = ref(false)
const activatedIds = ref<string[]>([])
const openedIds = ref<string[]>([])
const selected = ref<Partial<DocumentationItem>>({})
const search = ref('')
const items = computed((): DocumentationItem[] => localizeDocumentation(Documentation, locale.value))

// Фильтрация по поиску
// Фильтрация по поиску - НЕ МУТИРУЕМ исходные данные
const filteredItems = computed(() => {
  if (!search.value.trim()) return items.value

  const searchTerm = search.value.toLowerCase()

  const filterItemsRecursive = (itemsList: DocumentationItem[]): DocumentationItem[] => {
    return itemsList.flatMap((item) => {
      const matches =
        item.name?.toLowerCase().includes(searchTerm) ||
        item.title?.toLowerCase().includes(searchTerm) ||
        item.description?.toLowerCase().includes(searchTerm) ||
        item.content?.toLowerCase().includes(searchTerm)

      if (item.children) {
        const filteredChildren = filterItemsRecursive(item.children)
        if (filteredChildren.length > 0 || matches) {
          return [{
            ...item,
            children: filteredChildren,
          }]
        }
        return []
      }

      return matches ? [item] : []
    })
  }

  return filterItemsRecursive([...items.value])
})

// Вычисляемые свойства
const dialogs = computed(() => dialogsStore)

// Methods
const getDocIcon = (item: DocumentationItem) => {
  if (item.children && item.children.length > 0) {
    return openedIds.value.includes(item.id) ? 'mdi-folder-open' : 'mdi-folder'
  }
  return item.icon || 'mdi-file'
}

const highlightElement = (selectors: string | string[]) => {
  errorSelector.value = false
  dialogs.value.documentation = false

  let isMatch = false
  const selectorArray = Array.isArray(selectors) ? selectors : [selectors]

  selectorArray.forEach((selector) => {
    const elements = document.querySelectorAll(selector)
    if (elements.length) {
      isMatch = true
      elements.forEach((el) => {
        el.classList.add("doc-highlighted")

        setTimeout(() => {
          el.classList.remove("doc-highlighted")
          dialogs.value.documentation = true
        }, 3000)
      })
    }
  })

  if (!isMatch) {
    errorSelector.value = true
    dialogs.value.documentation = true
  }
}

const closeDialog = () => {
  dialogs.value.documentation = false
}

const getAncestorIds = (
  nodes: DocumentationItem[],
  id: string,
  path: string[] = [],
): string[] | null => {
  for (const node of nodes) {
    if (node.id === id) return path

    if (node.children) {
      const found = getAncestorIds(node.children, id, [...path, node.id])
      if (found) return found
    }
  }

  return null
}

const selectById = (id: string, { scroll = false }: { scroll?: boolean } = {}) => {
  const foundItem = getSelected(items.value, id)
  if (!foundItem) return

  const ancestors = getAncestorIds(items.value, id) ?? []
  openedIds.value = [...new Set([...openedIds.value, ...ancestors])]
  activatedIds.value = [id]
  selected.value = foundItem

  if (scroll) scrollToArticle(id)
}

const updateActivated = (ids: string[]) => {
  if (!ids.length) {
    selected.value = {}
    return
  }

  selectById(ids[ids.length - 1], { scroll: false })
}

const resetSelection = () => {
  activatedIds.value = []
  openedIds.value = []
  selected.value = {}
}

const scrollToArticle = (id: string) => {
  setTimeout(() => {
    const element = document.getElementById('doc_' + id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, 0)
}

const getSelected = (nodes: DocumentationItem[] | DocumentationItem, id: string): DocumentationItem | null => {
  // Приводим к массиву
  const nodeArray = Array.isArray(nodes) ? nodes : [nodes]

  if (!nodeArray.length) return null

  for (const node of nodeArray) {
    if (node && node.id === id) {
      return node
    }

    if (node && node.children) {
      const found = getSelected(node.children, id)
      if (found) return found
    }
  }

  return null
}

watch(items, (localizedItems) => {
  const currentId = selected.value?.id
  if (!currentId) return

  const nextSelected = getSelected(localizedItems, currentId)
  selected.value = nextSelected || {}
  activatedIds.value = nextSelected ? [currentId] : []

  if (nextSelected) {
    const ancestors = getAncestorIds(localizedItems, currentId) ?? []
    openedIds.value = [...new Set([...openedIds.value, ...ancestors])]
  }
})

watch(() => dialogsStore.documentation, (isOpen) => {
  if (isOpen && selected.value?.id) {
    nextTick(() => selectById(selected.value.id!, { scroll: true }))
  }
})

const handleShowDocumentation = (payload: unknown) => {
  const id = payload as string
  dialogs.value.documentation = true
  nextTick(() => selectById(id, { scroll: true }))
}

onMounted(() => {
  if (items.value?.length) {
    selectById(items.value[0].id)
  }

  eventBus.on('showDocumentation', handleShowDocumentation)
})

onBeforeUnmount(() => {
  eventBus.off('showDocumentation', handleShowDocumentation)
})
</script>

<style lang="scss">
.documentation-container {
  display: flex;
  height: calc(100vh - 300px); /* Уменьшил отступ */
  min-height: 400px;
  max-height: 600px; /* Уменьшил максимальную высоту */
  overflow: hidden;

  /* Альтернативный подход - использовать 100% высоты родителя */
  /* height: 100%; */
}

/* Левая колонка: TreeView */
.treeview-column {
  display: flex;
  flex-direction: column;
  flex: 0 0 320px;
  min-width: 250px;
  max-width: 400px;
  border-right: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  overflow: hidden;
  height: 100%; /* Добавил 100% высоты */
}

.sidebar-header {
  display: flex;
  align-items: center;
  padding: 12px 16px; /* Уменьшил padding */
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgba(0, 0, 0, 0.02);
  flex-shrink: 0;
  min-height: 56px; /* Фиксированная минимальная высота */
}

.treeview-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.styled-treeview {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  max-height: 100%; /* Ограничиваем высоту */
}

/* Правая колонка: Контент */
.content-column {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%; /* Добавил 100% высоты */
}

.content-column.no-selection {
  display: flex;
  align-items: center;
  justify-content: center;
}

.no-selection-placeholder {
  text-align: center;
  max-width: 400px;
  padding: 20px; /* Уменьшил padding */
  opacity: 0.7;
}

.selected-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 16px 24px; /* Уменьшил вертикальный padding */
  max-height: 100%; /* Ограничиваем высоту */
}

.content-header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px; /* Уменьшил отступ */
  padding-bottom: 12px; /* Уменьшил padding */
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.header-left {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.header-right {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.content-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

/* Стили для HTML контента */
.html-content {
  font-size: 0.95rem;
  line-height: 1.6;
  color: rgba(var(--v-theme-on-surface), 0.9);
}

.html-content h1,
.html-content h2,
.html-content h3 {
  color: rgba(var(--v-theme-primary), 0.9);
  margin: 24px 0 16px 0;
  font-weight: 600;
}

.html-content h3 {
  font-size: 1.1rem;
  padding-bottom: 6px;
  border-bottom: 2px solid rgba(var(--v-theme-primary), 0.2);
}

.html-content h3:first-child {
  margin-top: 0;
}

.html-content ul,
.html-content ol {
  padding-left: 24px;
  margin: 16px 0;
}

.html-content li {
  margin: 8px 0;
  padding-left: 4px;
}

.html-content p {
  margin: 16px 0;
}

.html-content code {
  background: rgba(var(--v-theme-primary), 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 0.9em;
}

.html-content table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0 24px;
}

.html-content th,
.html-content td {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  text-align: left;
  vertical-align: top;
}

.html-content th {
  color: rgba(var(--v-theme-on-surface), 0.8);
  font-weight: 600;
}

.html-content pre {
  background: rgba(0, 0, 0, 0.05);
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 16px 0;
  border: 1px solid rgba(var(--v-border-color), 0.3);
}

/* Анимация выделения */
@keyframes highlight {
  0% {
    box-shadow: 0 0 0 0 red;
  }
  50% {
    box-shadow: 0 0 0 5px red;
  }
  100% {
    box-shadow: 0 0 0 3px red;
  }
}

.doc-highlighted {
  animation: highlight 3s ease;
}

/* Адаптивность */
@media (max-width: 768px) {
  .documentation-container {
    flex-direction: column;
    height: calc(100vh - 250px); /* Адаптивная высота для мобилок */
    min-height: 300px;
    max-height: none;
  }

  .treeview-column {
    flex: 0 0 auto;
    max-width: 100%;
    max-height: 250px; /* Уменьшил высоту для мобилок */
    border-right: none;
    border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  }

  .v-divider {
    display: none;
  }

  .selected-content {
    padding: 12px 16px; /* Уменьшил padding для мобилок */
  }

  .content-body {
    max-height: calc(100% - 80px); /* Меньший отступ для мобилок */
  }
}

@media (max-height: 700px) {
  .documentation-container {
    height: calc(100vh - 250px); /* Для маленьких экранов */
    min-height: 300px;
  }

  .selected-content {
    padding: 12px 16px;
  }

  .content-header {
    margin-bottom: 12px;
    padding-bottom: 8px;
  }
}
</style>