<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="840"
    scrollable
  >
    <v-card>
      <DialogHeader
        :header="t('media.adding.folder_tags_manager_title')"
        closable
        @close="close"
      />
      <v-card-text>
        <v-text-field
          v-model="search"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          rounded="pill"
          prepend-inner-icon="mdi-magnify"
          :placeholder="t('media.adding.folder_tags_manager_search')"
          class="mb-4 folder-tags-manager__search"
        />

        <div
          v-if="loading"
          class="text-medium-emphasis py-6 text-center"
        >
          {{ t('common.loading') }}
        </div>

        <div
          v-else-if="!folders.length"
          class="text-medium-emphasis py-6"
        >
          {{ t('media.adding.folder_tags_manager_empty') }}
        </div>

        <div
          v-else-if="!filteredFolders.length"
          class="text-medium-emphasis py-6"
        >
          {{ t('media.adding.folder_tags_manager_no_matches') }}
        </div>

        <v-list
          v-else
          class="px-0 settings-outlined-list folder-tags-manager__list"
          density="compact"
          rounded="xl"
          bg-color="transparent"
        >
          <v-list-item
            v-for="(folder, index) in filteredFolders"
            :key="folder.id"
            class="folder-tags-manager__row py-3"
            :class="{'folder-tags-manager__row--zebra': index % 2 === 1}"
            rounded="pill"
            variant="outlined"
          >
            <template #prepend>
              <v-avatar
                color="primary"
                variant="tonal"
                size="40"
                class="mr-1"
              >
                <v-icon icon="mdi-folder-outline" />
              </v-avatar>
            </template>

            <v-list-item-title
              class="folder-tags-manager__path text-body-2"
              :title="folder.path"
            >
              {{ folder.path }}
            </v-list-item-title>

            <div class="d-flex flex-wrap ga-1 mt-2">
              <v-chip
                v-for="tag in folder.tags"
                :key="`${folder.id}:${tag.tagId}:${tag.metaId}`"
                size="x-small"
                label
                variant="tonal"
                rounded="pill"
                :color="tag.tag?.color || undefined"
                prepend-icon="mdi-tag-outline"
              >
                {{ tag.tag?.name || tag.tagId }}
              </v-chip>
            </div>

            <template #append>
              <div class="folder-tags-manager__actions d-flex">
                <FolderTagsMenu
                  :folder-path="folder.path"
                  @saved="reload"
                >
                  <template #activator="{props: menuProps}">
                    <v-btn
                      v-bind="menuProps"
                      icon
                      variant="text"
                      size="small"
                      rounded="pill"
                      :aria-label="t('common.edit')"
                    >
                      <v-icon icon="mdi-pencil" />
                    </v-btn>
                  </template>
                </FolderTagsMenu>
                <v-btn
                  icon
                  variant="text"
                  size="small"
                  rounded="pill"
                  color="error"
                  :aria-label="t('common.remove')"
                  :loading="clearingPath === folder.path"
                  @click="confirmClear(folder.path)"
                >
                  <v-icon icon="mdi-delete-outline" />
                </v-btn>
              </div>
            </template>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import FolderTagsMenu from '@/components/dialogs/FolderTagsMenu.vue'
import {typedApi} from '@/services/typedApi'
import {useNotificationsStore} from '@/stores/notifications'
import {useDialogsStore} from '@/stores/dialogs'

type FolderTagRow = {
  id: number
  path: string
  tags: Array<{
    tagId: number
    metaId: number
    tag?: {name?: string; color?: string | null} | null
  }>
}

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const {t} = useI18n()
const notificationsStore = useNotificationsStore()
const dialogsStore = useDialogsStore()

const loading = ref(false)
const search = ref('')
const folders = ref<FolderTagRow[]>([])
const clearingPath = ref('')

const filteredFolders = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return folders.value

  return folders.value.filter((folder) => {
    if (folder.path.toLowerCase().includes(query)) return true
    return folder.tags.some((tag) =>
      String(tag.tag?.name || tag.tagId).toLowerCase().includes(query),
    )
  })
})

function close() {
  emit('update:modelValue', false)
}

async function reload() {
  loading.value = true
  try {
    const res = await typedApi.listFolderTags()
    folders.value = res.data || []
  } catch (error) {
    console.error(error)
    notificationsStore.setNotification({
      type: 'error',
      text: t('media.adding.folder_tags_manager_load_error'),
    })
  } finally {
    loading.value = false
  }
}

function confirmClear(path: string) {
  dialogsStore.confirm.text = t('media.adding.folder_tags_manager_clear_confirm', {path})
  dialogsStore.confirm.checkBoxText = ''
  dialogsStore.confirm.checkBox = false
  dialogsStore.confirm.action = () => {
    void clearFolder(path)
  }
  dialogsStore.confirm.show = true
}

async function clearFolder(path: string) {
  clearingPath.value = path
  try {
    await typedApi.clearFolderTags(path)
    folders.value = folders.value.filter((folder) => folder.path !== path)
  } catch (error) {
    console.error(error)
    notificationsStore.setNotification({
      type: 'error',
      text: t('media.adding.folder_tags_manager_clear_error'),
    })
  } finally {
    clearingPath.value = ''
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      search.value = ''
      void reload()
    }
  },
)
</script>

<style scoped>
.folder-tags-manager__search :deep(.v-field) {
  border-radius: 999px;
}

.folder-tags-manager__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.folder-tags-manager__row {
  align-items: center;
  border-color: rgba(var(--v-border-color), 0.14) !important;
  background: rgba(var(--v-theme-on-surface), 0.02);
}

.folder-tags-manager__row--zebra {
  background: rgba(var(--v-theme-on-surface), 0.035);
}

.folder-tags-manager__row:hover {
  background: rgba(var(--v-theme-primary), 0.04);
  border-color: rgba(var(--v-theme-primary), 0.22) !important;
}

.folder-tags-manager__path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.folder-tags-manager__actions {
  border: 1px solid rgba(var(--v-border-color), 0.2);
  border-radius: 999px;
  overflow: hidden;
  background: rgba(var(--v-theme-surface), 0.7);
}
</style>
