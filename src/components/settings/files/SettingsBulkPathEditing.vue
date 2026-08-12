<template>
  <div class="mx-4">
    <SettingsCategoryDivider
      :title="t('settings_labels.tools.bulk_edit_paths')"
      icon="find-replace"
    />

    <v-alert
      type="info"
      variant="tonal"
      density="compact"
      rounded="xl"
      class="mb-4"
    >
      <span class="text-caption d-block">
        {{ t('settings_labels.tools.replace_paths_hint') }}
      </span>
      <span class="text-caption d-block mt-1">
        {{ t('settings_labels.tools.replace_paths_hint_use_case') }}
      </span>
    </v-alert>

    <div class="tool-action">
      <v-dialog
        v-model="dialog"
        :fullscreen="xs"
        :width="xl ? 1400 : 1100"
        scrollable
      >
        <template v-slot:activator="{ props }">
          <v-btn
            v-bind="props"
            color="primary"
            rounded
            variant="flat"
            @click="dialog = true"
          >
            <v-icon icon="mdi-find-replace" start/>
            {{ t('settings_labels.tools.bulk_edit_paths_btn') }}
          </v-btn>
        </template>

        <v-card
          rounded="xl"
          class="bulk-paths"
        >
          <DialogHeader
            icon="find-replace"
            :header="t('settings_labels.tools.bulk_edit_paths')"
            :subheader="headerSub"
            :buttons="buttons"
            closable
            @close="closeDialog"
          />

          <v-card-text class="bulk-paths__body">
            <div class="bulk-paths__toolbar">
              <v-text-field
                v-model="query"
                class="bulk-paths__field"
                :placeholder="t('settings_labels.tools.search_for')"
                variant="outlined"
                density="comfortable"
                rounded="lg"
                hide-details
                clearable
                autofocus
                :disabled="searching"
                @keyup.enter="searchMedia"
              >
                <template #prepend-inner>
                  <v-icon
                    icon="mdi-magnify"
                    size="18"
                    class="text-medium-emphasis"
                  />
                </template>
              </v-text-field>

              <div
                class="bulk-paths__arrow"
                aria-hidden="true"
              >
                <v-icon
                  icon="mdi-arrow-right"
                  size="18"
                />
              </div>

              <v-text-field
                v-model="replacement"
                class="bulk-paths__field"
                :placeholder="t('settings_labels.tools.update_with')"
                variant="outlined"
                density="comfortable"
                rounded="lg"
                hide-details
                clearable
                :disabled="searching"
                @keyup.enter="searchMedia"
              >
                <template #prepend-inner>
                  <v-icon
                    icon="mdi-pencil-outline"
                    size="18"
                    class="text-medium-emphasis"
                  />
                </template>
              </v-text-field>

              <v-btn
                class="bulk-paths__search-btn"
                color="primary"
                rounded="pill"
                variant="tonal"
                :loading="searching"
                :disabled="!query.trim() || searching"
                @click="searchMedia"
              >
                <v-icon
                  icon="mdi-magnify"
                  start
                />
                {{ t('common.search') }}
              </v-btn>
            </div>

            <div class="bulk-paths__meta">
              <div
                v-if="hasSearched"
                class="bulk-paths__summary text-caption text-medium-emphasis"
              >
                <span class="bulk-paths__summary-count">{{ files.length }}</span>
                <span>{{ t('settings_labels.tools.files_matched') }}</span>
              </div>

              <v-chip
                size="x-small"
                variant="tonal"
                class="bulk-paths__chip"
              >
                <v-icon
                  icon="mdi-format-letter-case"
                  start
                  size="14"
                />
                {{ t('settings_labels.tools.case_sensitive') }}
              </v-chip>
            </div>

            <div
              class="bulk-paths__panel"
              :class="{'bulk-paths__panel--empty': !files.length}"
            >
              <template v-if="files.length">
                <div class="bulk-paths__head">
                  <span class="bulk-paths__col bulk-paths__col--from">
                    {{ t('settings_labels.tools.path_current') }}
                  </span>
                  <span
                    class="bulk-paths__col-gap"
                    aria-hidden="true"
                  />
                  <span class="bulk-paths__col bulk-paths__col--to">
                    {{ t('settings_labels.tools.path_new') }}
                  </span>
                </div>

                <v-virtual-scroll
                  :items="files"
                  :height="listHeight"
                  :item-height="ROW_HEIGHT"
                  class="bulk-paths__list"
                >
                  <template #default="{ item }">
                    <div class="bulk-paths-row">
                      <div class="bulk-paths-row__path bulk-paths-row__path--from selectable">
                        <template
                          v-for="(part, idx) in highlightParts(item.path || '', 'from')"
                          :key="`from-${item.id}-${idx}`"
                        >
                          <mark
                            v-if="part.hit"
                            class="bulk-paths-row__hit bulk-paths-row__hit--from"
                          >{{ part.text }}</mark>
                          <span v-else>{{ part.text }}</span>
                        </template>
                      </div>

                      <div
                        class="bulk-paths-row__gap"
                        aria-hidden="true"
                      >
                        <v-icon
                          icon="mdi-arrow-right"
                          size="14"
                        />
                      </div>

                      <div class="bulk-paths-row__path bulk-paths-row__path--to selectable">
                        <template
                          v-for="(part, idx) in highlightParts(item.path || '', 'to')"
                          :key="`to-${item.id}-${idx}`"
                        >
                          <mark
                            v-if="part.hit"
                            class="bulk-paths-row__hit bulk-paths-row__hit--to"
                          >{{ part.text }}</mark>
                          <span v-else>{{ part.text }}</span>
                        </template>
                      </div>
                    </div>
                  </template>
                </v-virtual-scroll>
              </template>

              <div
                v-else
                class="bulk-paths__empty"
              >
                <div class="bulk-paths__empty-icon" aria-hidden="true">
                  <v-icon
                    :icon="hasSearched ? 'mdi-file-search-outline' : 'mdi-folder-search-outline'"
                    size="28"
                  />
                </div>
                <div class="bulk-paths__empty-title">
                  {{ hasSearched
                    ? t('settings_labels.tools.no_files_found')
                    : t('settings_labels.tools.search_paths_prompt') }}
                </div>
                <div class="bulk-paths__empty-hint text-caption text-medium-emphasis">
                  {{ hasSearched
                    ? t('settings_labels.tools.search_paths_empty_hint')
                    : t('settings_labels.tools.replace_paths_hint_use_case') }}
                </div>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-dialog>
    </div>
  </div>
</template>

<script setup lang="ts">
import {typedApi} from "@/services/typedApi"
import {ref, computed, watch} from "vue"
import {useI18n} from "vue-i18n"
import {useDialogsStore} from "@/stores/dialogs"
import {useNotificationsStore} from "@/stores/notifications"
import {useDisplay} from "vuetify"
import DialogHeader from "@/components/elements/DialogHeader.vue"
import SettingsCategoryDivider from "@/components/ui/SettingsCategoryDivider.vue"
import type { MediaPathFile } from '@shared/api/responses'

interface PathPart {
  text: string
  hit: boolean
}

const ROW_HEIGHT = 52
const LIST_MAX = 420

const dialogsStore = useDialogsStore()
const notificationsStore = useNotificationsStore()
const {xs, xl} = useDisplay()
const {t} = useI18n()

const dialog = ref(false)
const searching = ref(false)

const query = ref("")
const replacement = ref("")
const found = ref("")
const hasSearched = ref(false)
const files = ref<MediaPathFile[]>([])

const canReplace = computed(() =>
  Boolean(found.value) && files.value.length > 0 && !searching.value,
)

const headerSub = computed(() => {
  if (!hasSearched.value) return undefined
  return t('settings_labels.tools.total_files', {count: files.value.length})
})

const listHeight = computed(() =>
  Math.min(Math.max(files.value.length, 1) * ROW_HEIGHT, LIST_MAX),
)

const buttons = computed(() => [
  {
    icon: "check",
    text: files.value.length
      ? t("settings_labels.tools.replace_paths_count", {count: files.value.length})
      : t("common.replace"),
    color: "success",
    disabled: !canReplace.value,
    function: () => replaceFiles(),
  },
])

watch(query, (value) => {
  if (value !== found.value) {
    files.value = []
    found.value = ""
    hasSearched.value = false
  }
})

function closeDialog() {
  dialog.value = false
}

function highlightParts(filePath: string, side: 'from' | 'to'): PathPart[] {
  const searchStr = found.value
  if (!searchStr || !filePath.includes(searchStr)) {
    return [{text: filePath, hit: false}]
  }

  const idx = filePath.indexOf(searchStr)
  const before = filePath.slice(0, idx)
  const after = filePath.slice(idx + searchStr.length)
  const mid = side === 'from' ? searchStr : replacement.value

  const parts: PathPart[] = []
  if (before) parts.push({text: before, hit: false})
  parts.push({text: mid, hit: true})
  if (after) parts.push({text: after, hit: false})
  return parts
}

const searchMedia = async () => {
  const q = query.value
  if (!q.trim() || searching.value) return

  searching.value = true
  try {
    const res = await typedApi.searchMediaByPath({
      query: q,
    })

    found.value = q
    hasSearched.value = true
    files.value = (res.data || []).filter((i) =>
      (i.path || '').includes(q)
    )
  } catch (e) {
    console.error(e)
    notificationsStore.setNotification({
      type: "error",
      text: t("settings_labels.tools.search_paths_failed"),
    })
  } finally {
    searching.value = false
  }
}

const replaceFiles = async () => {
  if (!canReplace.value) return

  const str = found.value
  const repl = replacement.value

  // Only send id + path; the API derives basename/name/ext with
  // cross-platform path parsing so Windows `\` paths don't become names.
  const replaced = files.value.map((i) => {
    const currentPath = i.path || ''
    return {
      id: i.id,
      path: currentPath.replace(str, repl),
    }
  })

  dialogsStore.process.show = true

  try {
    await typedApi.updateMediaMultiple({
      mediaFiles: replaced,
    })

    if (str) {
      await typedApi.remapFolderPaths({find: str, replace: repl})
    }

    notificationsStore.setNotification({
      type: "success",
      text: t("settings_labels.tools.replace_paths_done", {count: replaced.length}),
    })

    query.value = ""
    replacement.value = ""
    found.value = ""
    hasSearched.value = false
    files.value = []

    dialog.value = false
  } finally {
    dialogsStore.process.show = false
  }
}
</script>

<style scoped>
.tool-action {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.bulk-paths__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 16px !important;
}

.bulk-paths__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
}

.bulk-paths__field {
  flex: 1 1 240px;
  min-width: 0;
}

.bulk-paths__arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 28px;
  color: rgba(var(--v-theme-on-surface), 0.45);
}

.bulk-paths__search-btn {
  flex: 0 0 auto;
}

.bulk-paths__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  min-height: 28px;
}

.bulk-paths__summary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-right: auto;
  font-variant-numeric: tabular-nums;
}

.bulk-paths__summary-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 700;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
}

.bulk-paths__chip {
  margin-left: auto;
}

.bulk-paths__panel {
  border-radius: 18px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(var(--v-theme-surface), 0.72);
  box-shadow: 0 1px 0 rgba(var(--v-theme-on-surface), 0.03);
  overflow: hidden;
  min-height: 220px;
}

.bulk-paths__panel--empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.bulk-paths__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px minmax(0, 1fr);
  gap: 0;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(var(--v-theme-on-surface), 0.03);
}

.bulk-paths__col {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.55);
}

.bulk-paths__list {
  background: transparent;
}

.bulk-paths-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px minmax(0, 1fr);
  align-items: start;
  gap: 0;
  min-height: 52px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  transition: background-color 0.15s ease;
}

.bulk-paths-row:hover {
  background: rgba(var(--v-theme-primary), 0.04);
}

.bulk-paths-row__path {
  min-width: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75rem;
  line-height: 1.45;
  word-break: break-all;
}

.bulk-paths-row__path--from {
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.bulk-paths-row__path--to {
  color: rgba(var(--v-theme-on-surface), 0.88);
}

.bulk-paths-row__gap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 1.45em;
  color: rgba(var(--v-theme-on-surface), 0.35);
}

.bulk-paths-row__hit {
  padding: 0 2px;
  border-radius: 4px;
  font-weight: 700;
  font-style: normal;
}

.bulk-paths-row__hit--from {
  color: rgb(var(--v-theme-error));
  background: rgba(var(--v-theme-error), 0.12);
}

.bulk-paths-row__hit--to {
  color: rgb(var(--v-theme-success));
  background: rgba(var(--v-theme-success), 0.14);
}

.bulk-paths__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 24px;
  text-align: center;
  max-width: 28rem;
}

.bulk-paths__empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
  margin-bottom: 4px;
}

.bulk-paths__empty-title {
  font-size: 0.975rem;
  font-weight: 650;
  letter-spacing: -0.01em;
  line-height: 1.3;
}

.bulk-paths__empty-hint {
  line-height: 1.45;
}

.selectable {
  user-select: text;
}

@media (max-width: 700px) {
  .bulk-paths__arrow {
    display: none;
  }

  .bulk-paths__search-btn {
    width: 100%;
  }

  .bulk-paths__chip {
    margin-left: 0;
  }

  .bulk-paths__head,
  .bulk-paths-row {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .bulk-paths-row__gap {
    display: none;
  }

  .bulk-paths__col--to {
    margin-top: 2px;
  }
}
</style>
