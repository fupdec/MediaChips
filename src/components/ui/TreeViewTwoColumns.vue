<template>
  <v-card variant="outlined" class="treeview-container">
    <!-- Контейнер с двумя колонками -->
    <div class="treeview-layout">
      <!-- Левая колонка: TreeView -->
      <div class="treeview-sidebar">
        <div class="sidebar-header">
          <v-text-field
            v-model="search"
            density="compact"
            placeholder="Search..."
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            hide-details
            clearable
            @update:model-value="filterTree"
          />
        </div>

        <div class="treeview-wrapper">
          <v-treeview
            v-model:opened="openedItems"
            v-model:selected="selectedItems"
            :items="filteredItems"
            :search="search"
            :filter="treeFilter"
            item-title="title"
            item-value="id"
            :return-object="true"
            activatable
            hoverable
            density="comfortable"
            color="primary"
            open-on-click
            transition
            class="custom-treeview"
          >
            <!-- Слот для кастомизации отображения элементов -->
            <template #prepend="slotData">
              <v-icon :icon="treeIcon(slotData)" size="small" />
            </template>

            <template #append="slotData">
              <v-chip
                v-if="treeItem(slotData.item).badge"
                size="x-small"
                :color="treeItem(slotData.item).badgeColor || 'primary'"
                variant="flat"
                class="ml-2"
              >
                {{ treeItem(slotData.item).badge }}
              </v-chip>
            </template>
          </v-treeview>
        </div>

        <!-- Статусная информация -->
        <div v-if="showStats" class="sidebar-footer">
          <div class="text-caption text-medium-emphasis">
            {{ selectedItems.length }} selected / {{ filteredItems.length }} items
          </div>
        </div>
      </div>

      <!-- Разделитель с возможностью изменения размера -->
      <v-divider vertical class="resizable-divider" />

      <!-- Правая колонка: Отображение контента -->
      <div class="content-area" :class="{ 'no-selection': !selectedItem }">
        <!-- Заглушка при отсутствии выбора -->
        <div v-if="!selectedItem" class="no-selection-placeholder">
          <v-icon icon="mdi-file-tree-outline" size="large" color="grey" />
          <div class="text-h6 text-medium-emphasis mt-4">
            Select an item to view details
          </div>
          <div class="text-body-2 text-medium-emphasis mt-2">
            Choose any item from the tree to see its content here
          </div>
        </div>

        <!-- Контент выбранного элемента -->
        <div v-else class="selected-content">
          <!-- Заголовок -->
          <div class="content-header">
            <div class="header-left">
              <v-icon :icon="selectedItem.icon || 'mdi-folder'" color="primary" class="mr-2" />
              <div>
                <div class="text-h6">{{ selectedItem.title }}</div>
                <div v-if="selectedItem.subtitle" class="text-caption text-medium-emphasis">
                  {{ selectedItem.subtitle }}
                </div>
              </div>
            </div>

            <div class="header-right">
              <v-btn
                v-if="selectedItem.link"
                :href="selectedItem.link"
                target="_blank"
                variant="text"
                size="small"
                prepend-icon="mdi-open-in-new"
              >
                Open
              </v-btn>
            </div>
          </div>

          <v-divider class="my-4" />

          <!-- Основной контент -->
          <div class="content-body">
            <!-- Отображение различных типов контента -->
            <div v-if="selectedItem.contentType === 'html'" v-html="sanitizeInlineHtml(selectedItem.content)" />

            <div v-else-if="selectedItem.contentType === 'component'">
              <component :is="selectedItem.component" v-bind="selectedItem.props || {}" />
            </div>

            <div v-else-if="selectedItem.contentType === 'list'">
              <v-list density="compact">
                <v-list-item
                  v-for="(item, index) in selectedItem.items"
                  :key="index"
                  :prepend-icon="item.icon"
                  :title="item.title"
                  :subtitle="item.subtitle"
                />
              </v-list>
            </div>

            <div v-else>
              <p class="text-body-1">{{ selectedItem.content || 'No content available' }}</p>

              <!-- Мета-информация -->
              <v-card v-if="hasMetaInfo" variant="outlined" class="mt-6">
                <v-card-text>
                  <div class="meta-info">
                    <div v-if="selectedItem.createdAt" class="meta-item">
                      <span class="meta-label">Created:</span>
                      <span class="meta-value">{{ formatDate(selectedItem.createdAt) }}</span>
                    </div>
                    <div v-if="selectedItem.updatedAt" class="meta-item">
                      <span class="meta-label">Updated:</span>
                      <span class="meta-value">{{ formatDate(selectedItem.updatedAt) }}</span>
                    </div>
                    <div v-if="selectedItem.tags && selectedItem.tags.length" class="meta-item">
                      <span class="meta-label">Tags:</span>
                      <div class="tags">
                        <v-chip
                          v-for="tag in selectedItem.tags"
                          :key="tag"
                          size="small"
                          variant="outlined"
                          class="mr-1 mb-1"
                        >
                          {{ tag }}
                        </v-chip>
                      </div>
                    </div>
                  </div>
                </v-card-text>
              </v-card>
            </div>
          </div>
        </div>
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import {sanitizeInlineHtml} from '@/utils/sanitizeHtml'
import { ref, computed, onMounted, type Component } from 'vue'

type TreeViewListEntry = {
  id: string | number
  title: string
  subtitle?: string
  icon?: string
  badge?: string | number
  badgeColor?: string
  children?: TreeViewListEntry[]
  searchTerms?: string[]
  contentType?: string
  content?: string
  component?: Component
  props?: Record<string, unknown>
  items?: Array<{ icon?: string; title: string; subtitle?: string }>
  link?: string
  createdAt?: string | number | Date
  updatedAt?: string | number | Date
  tags?: string[]
}

type TreeViewSlotData = {
  item: unknown
  open?: boolean
  isOpen?: boolean
}

const props = withDefaults(defineProps<{
  items?: TreeViewListEntry[]
  initialSelectedId?: string | number | null
  searchable?: boolean
  showStats?: boolean
  height?: string
}>(), {
  items: () => [],
  initialSelectedId: null,
  searchable: true,
  showStats: true,
  height: '500px',
})

const search = ref('')
const openedItems = ref<Array<string | number>>([])
const selectedItems = ref<TreeViewListEntry[]>([])
const filteredItems = ref<TreeViewListEntry[]>([...props.items])

const treeItem = (item: unknown): TreeViewListEntry => item as TreeViewListEntry

// Computed
const selectedItem = computed(() => {
  return selectedItems.value.length > 0 ? selectedItems.value[0] : null
})

const hasMetaInfo = computed(() => {
  return selectedItem.value && (
    selectedItem.value.createdAt ||
    selectedItem.value.updatedAt ||
    (selectedItem.value.tags && selectedItem.value.tags.length > 0)
  )
})

const treeIcon = (slotData: TreeViewSlotData) => {
  const item = treeItem(slotData.item)
  const open = slotData.open ?? slotData.isOpen ?? false
  return item.icon || getIcon(item, open)
}

const getIcon = (item: TreeViewListEntry, open: boolean) => {
  if (item.children && item.children.length > 0) {
    return open ? 'mdi-folder-open' : 'mdi-folder'
  }
  return item.icon || 'mdi-file'
}

const treeFilter = (item: TreeViewListEntry, searchTerm: string, itemText: string) => {
  return itemText.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.searchTerms && item.searchTerms.some((term: string) =>
      term.toLowerCase().includes(searchTerm.toLowerCase())
    ))
}

const filterTree = () => {
  // Если нужно кастомное фильтрование
  if (!search.value) {
    filteredItems.value = [...props.items]
    return
  }

  const searchTerm = search.value.toLowerCase()

  const filterItems = (items: TreeViewListEntry[]): TreeViewListEntry[] => {
    return items.filter(item => {
      const matches = item.title.toLowerCase().includes(searchTerm) ||
        (item.searchTerms && item.searchTerms.some((term: string) =>
          term.toLowerCase().includes(searchTerm)
        ))

      if (item.children) {
        item.children = filterItems(item.children)
        return matches || item.children.length > 0
      }

      return matches
    })
  }

  filteredItems.value = filterItems([...props.items])
}

const formatDate = (date: string | number | Date) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

// Lifecycle hooks
onMounted(() => {
  if (props.initialSelectedId) {
    // Найти элемент по ID и выбрать его
    const findItem = (items: TreeViewListEntry[], id: string | number): TreeViewListEntry | null => {
      for (const item of items) {
        if (item.id === id) {
          return item
        }
        if (item.children) {
          const found = findItem(item.children, id)
          if (found) return found
        }
      }
      return null
    }

    const item = findItem(props.items, props.initialSelectedId)
    if (item) {
      selectedItems.value = [item]
    }
  }
})
</script>

<style scoped>
.treeview-container {
  height: v-bind(height);
}

.treeview-layout {
  display: flex;
  height: 100%;
  overflow: hidden;
}

/* Левая колонка */
.treeview-sidebar {
  display: flex;
  flex-direction: column;
  flex: 0 0 320px; /* Фиксированная ширина */
  min-width: 250px;
  max-width: 400px;
  border-right: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.treeview-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.custom-treeview {
  height: 100%;
  overflow-y: auto;
  padding: 8px;
}

.custom-treeview :deep(.v-treeview-node) {
  border-radius: 6px;
  margin: 2px 0;
}

.custom-treeview :deep(.v-treeview-node--active) {
  background-color: rgba(var(--v-theme-primary), 0.1);
}

.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background-color: rgba(0, 0, 0, 0.02);
}

/* Разделитель */
.resizable-divider {
  cursor: col-resize;
  user-select: none;
}

.resizable-divider:hover {
  background-color: rgba(var(--v-theme-primary), 0.5);
}

/* Правая колонка */
.content-area {
  flex: 1;
  min-width: 0;
  padding: 16px;
  overflow-y: auto;
}

.content-area.no-selection {
  display: flex;
  align-items: center;
  justify-content: center;
}

.no-selection-placeholder {
  text-align: center;
  max-width: 400px;
  padding: 40px;
}

.content-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.header-left {
  display: flex;
  align-items: center;
}

.header-right {
  display: flex;
  gap: 8px;
}

.content-body {
  padding: 8px 0;
}

/* Мета-информация */
.meta-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.meta-item {
  display: flex;
  align-items: flex-start;
}

.meta-label {
  font-weight: 600;
  min-width: 80px;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.meta-value {
  flex: 1;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

/* Адаптивность */
@media (max-width: 768px) {
  .treeview-layout {
    flex-direction: column;
  }

  .treeview-sidebar {
    flex: 0 0 auto;
    max-width: 100%;
    max-height: 300px;
    border-right: none;
    border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  }

  .resizable-divider {
    display: none;
  }
}
</style>