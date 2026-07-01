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
        :width="xl ? 1800 : 1200"
      >
        <template v-slot:activator="{ props }">
          <v-btn
            v-bind="props"
            @click="dialog = true"
            color="primary"
            rounded
            variant="flat"
          >
            <v-icon icon="mdi-find-replace" start/>
            {{ t('settings_labels.tools.bulk_edit_paths_btn') }}
          </v-btn>
        </template>

        <v-card rounded="lg">
          <DialogHeader
            :header="t('settings_labels.tools.bulk_edit_paths')"
            :buttons="buttons"
            closable
            @close="dialog = false"
          />

          <v-card-text>
            <v-row>
              <v-col cols="6">
                <v-text-field
                  v-model="query"
                  @keyup.enter="searchMedia"
                  @click:append="searchMedia"
                  append-inner-icon="mdi-magnify"
                  :placeholder="t('settings_labels.tools.search_for')"
                  :hint="t('settings_labels.tools.case_sensitive')"
                  variant="filled"
                />
              </v-col>

              <v-col cols="6">
                <v-text-field
                  v-model="replacement"
                  :placeholder="t('settings_labels.tools.update_with')"
                  :hint="t('settings_labels.tools.replacement_string')"
                  variant="filled"
                />
              </v-col>

              <v-col cols="12"
                v-if="files.length">
                <div class="text-center mb-2">
                  {{ t('settings_labels.tools.total_files', {count: files.length}) }}
                </div>

                <v-card variant="outlined">
                  <v-virtual-scroll
                    :items="files"
                    height="200"
                    item-height="22"
                  >
                    <template #default="{ item }">
                      <div class="path-string"
                        v-html="highlightPath(item.path || '')"/>
                      <v-divider/>
                    </template>
                  </v-virtual-scroll>
                </v-card>
              </v-col>

              <v-col cols="12"
                v-else
                class="text-center py-10">
                {{ t('settings_labels.tools.no_files_found') }}
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-dialog>
    </div>
  </div>
</template>

<script setup lang="ts">
import {typedApi} from "@/services/typedApi"
import path from "path-browserify"
import {ref, computed} from "vue"
import {useI18n} from "vue-i18n"
import {useDialogsStore} from "@/stores/dialogs"
import {useNotificationsStore} from "@/stores/notifications"
import {useDisplay} from "vuetify"
import DialogHeader from "@/components/elements/DialogHeader.vue"
import SettingsCategoryDivider from "@/components/ui/SettingsCategoryDivider.vue"
import type { MediaPathFile } from '@shared/api/responses'

const dialogsStore = useDialogsStore()
const notificationsStore = useNotificationsStore()
const {xs, xl} = useDisplay()
const {t} = useI18n()

const dialog = ref(false)

const query = ref("")
const replacement = ref("")
const found = ref("")
const files = ref<MediaPathFile[]>([])

const buttons = computed(() => [
  {
    icon: "check",
    text: t("common.replace"),
    color: "success",
    function: () => replaceFiles(),
  },
])

const searchMedia = async () => {
  try {
    const res = await typedApi.searchMediaByPath({
      query: query.value,
    })

    found.value = query.value
    files.value = (res.data || []).filter((i) =>
      (i.path || '').includes(query.value)
    )
  } catch (e) {
    console.error(e)
    notificationsStore.setNotification({
      type: "error",
      text: t("settings_labels.tools.search_paths_failed"),
    })
  }
}

const highlightPath = (filePath: string) => {
  if (!found.value) return filePath

  const searchStr = found.value
  const repl = replacement.value

  const foundStr = filePath.replace(searchStr, `<b style="color:red">${searchStr}</b>`)
  const replacedStr = filePath.replace(searchStr, `<b style="color:blue">${repl}</b>`)

  return `${foundStr} <b>→</b> ${replacedStr}`
}

const replaceFiles = async () => {
  const str = found.value
  const repl = replacement.value

  const replaced = files.value.map((i) => {
    const currentPath = i.path || ''
    const newPath = currentPath.replace(str, repl)
    return {
      id: i.id,
      path: newPath,
      ext: path.extname(newPath),
      basename: path.basename(newPath),
      name: path.basename(newPath).replace(/\.[^/.]+$/, ""),
    }
  })

  dialogsStore.process.show = true

  try {
    await typedApi.updateMediaMultiple({
      mediaFiles: replaced,
    })

    query.value = ""
    replacement.value = ""
    found.value = ""
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

.path-string {
  white-space: nowrap;
  font-size: 14px;
}
</style>
