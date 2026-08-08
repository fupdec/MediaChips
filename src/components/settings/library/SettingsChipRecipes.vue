<template>
  <div class="mx-4 pb-4">
    <SettingsCategoryDivider
      :title="t('settings_labels.library.chip_recipes')"
      icon="puzzle-outline"
      compact
    />

    <p class="text-body-2 text-medium-emphasis mb-4 chip-recipes__hint">
      {{ t('settings_labels.library.chip_recipes_hint') }}
    </p>

    <div class="chip-recipes__actions d-flex flex-wrap ga-2 mb-6">
      <v-btn
        color="primary"
        rounded="xl"
        variant="flat"
        prepend-icon="mdi-export-variant"
        :text="t('settings_labels.library.chip_recipes_export')"
        @click="openExportDialog"
      />
      <v-btn
        variant="tonal"
        rounded="xl"
        color="primary"
        prepend-icon="mdi-import"
        :text="t('settings_labels.library.chip_recipes_import_file')"
        @click="pickImportFile"
      />
      <v-btn
        variant="tonal"
        rounded="xl"
        color="primary"
        prepend-icon="mdi-discord"
        :text="t('settings_labels.library.chip_recipes_share_discord')"
        @click="openDiscord"
      />
    </div>

    <div class="chip-recipes__catalog-head d-flex align-center justify-space-between ga-2 mb-2">
      <div class="text-subtitle-1 font-weight-medium">
        {{ t('settings_labels.library.chip_recipes_catalog') }}
      </div>
      <v-btn
        variant="text"
        size="small"
        color="primary"
        class="text-none"
        prepend-icon="mdi-refresh"
        :loading="catalogLoading"
        :text="t('settings_labels.library.chip_recipes_refresh_catalog')"
        @click="loadCatalog"
      />
    </div>
    <div class="text-caption text-medium-emphasis mb-3">
      {{ t('settings_labels.library.chip_recipes_catalog_hint') }}
    </div>

    <v-alert
      v-if="catalogError"
      type="warning"
      variant="tonal"
      density="compact"
      rounded="lg"
      class="mb-2"
    >
      <span class="text-caption">{{ catalogError }}</span>
    </v-alert>

    <div
      v-else-if="catalogLoading && !catalogEntries.length"
      class="text-medium-emphasis text-body-2 py-6 text-center"
    >
      {{ t('common.loading') }}
    </div>

    <div
      v-else-if="!catalogEntries.length"
      class="chip-recipes__empty text-medium-emphasis text-body-2"
    >
      {{ t('settings_labels.library.chip_recipes_catalog_empty') }}
    </div>

    <div
      v-else
      class="chip-recipes__list"
    >
      <v-card
        v-for="entry in catalogEntries"
        :key="entry.id"
        class="chip-recipes__card"
        rounded="xl"
        variant="outlined"
      >
        <v-card-item class="py-3">
          <template #prepend>
            <v-avatar
              color="primary"
              variant="tonal"
              rounded="lg"
              size="40"
            >
              <v-icon :icon="catalogIcon(entry.category)" />
            </v-avatar>
          </template>

          <v-card-title class="text-body-1 font-weight-medium text-wrap">
            {{ catalogTitle(entry) }}
          </v-card-title>
          <v-card-subtitle class="text-wrap opacity-90">
            {{ catalogDescription(entry) }}
          </v-card-subtitle>

          <template #append>
            <v-btn
              color="primary"
              variant="flat"
              size="small"
              rounded="lg"
              class="text-none"
              :loading="installingId === entry.id"
              :text="t('settings_labels.library.chip_recipes_install')"
              @click="installFromCatalog(entry)"
            />
          </template>
        </v-card-item>

        <v-card-text class="pt-0 pb-3">
          <div class="d-flex flex-wrap ga-1">
            <v-chip
              v-if="entry.category"
              size="x-small"
              label
              variant="tonal"
            >
              {{ entry.category }}
            </v-chip>
            <v-chip
              v-if="entry.author"
              size="x-small"
              label
              variant="tonal"
            >
              {{ entry.author }}
            </v-chip>
            <v-chip
              v-if="entry.sfw === false"
              size="x-small"
              label
              color="warning"
              variant="tonal"
            >
              NSFW
            </v-chip>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept=".json,.chiprecipe.json,application/json"
      class="d-none"
      @change="onImportFilePicked"
    >

    <v-dialog
      v-model="exportDialog"
      width="580"
      scrollable
      persistent
    >
      <v-card>
        <DialogHeader
          :header="t('settings_labels.library.chip_recipes_export')"
          :subheader="exportFilenamePreview"
          icon="export-variant"
          closable
          :buttons="exportHeaderButtons"
          @close="closeExportDialog"
        />

        <v-card-text class="pa-4">
          <div class="text-body-2 text-medium-emphasis mb-4">
            {{ t('settings_labels.library.chip_recipes_export_dialog_hint') }}
          </div>

          <v-text-field
            v-model="exportForm.name"
            :label="t('settings_labels.library.chip_recipes_name')"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            class="mb-3"
            autofocus
          />
          <v-textarea
            v-model="exportForm.description"
            :label="t('settings_labels.library.chip_recipes_description')"
            variant="outlined"
            density="comfortable"
            rows="2"
            auto-grow
            hide-details="auto"
            class="mb-3"
          />

          <div class="chip-recipes-export__row mb-3">
            <v-text-field
              v-model="exportForm.author"
              :label="t('settings_labels.library.chip_recipes_author')"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
            />
            <v-select
              v-model="exportForm.category"
              :items="categoryItems"
              :label="t('settings_labels.library.chip_recipes_category')"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
            />
          </div>

          <div class="chip-recipes-export__switches mb-3">
            <v-switch
              v-model="exportForm.sfw"
              :label="t('settings_labels.library.chip_recipes_sfw')"
              color="primary"
              inset
              density="compact"
              hide-details
              class="chip-recipes-export__sfw"
            />
            <v-switch
              v-model="exportForm.includeTags"
              :label="t('settings_labels.library.chip_recipes_include_tags')"
              color="primary"
              inset
              density="compact"
              hide-details
              class="chip-recipes-export__sfw"
            />
          </div>
          <div
            v-if="exportForm.includeTags"
            class="text-caption text-medium-emphasis mb-3"
          >
            {{ t('settings_labels.library.chip_recipes_include_tags_hint') }}
          </div>

          <div class="d-flex align-center justify-space-between ga-2 mb-2">
            <div class="text-body-2 font-weight-medium">
              {{ t('settings_labels.library.chip_recipes_fields') }}
            </div>
            <div class="text-caption text-medium-emphasis">
              {{ t('settings_labels.library.chip_recipes_selected_count', {
                selected: exportForm.metaIds.length,
                total: metaOptions.length,
              }) }}
            </div>
          </div>

          <div class="chip-recipes-export__fields">
            <div class="chip-recipes-export__fields-toolbar">
              <v-checkbox
                v-model="exportSelectAll"
                :label="t('settings_labels.library.chip_recipes_select_all')"
                density="compact"
                hide-details
                color="primary"
                class="chip-recipes-export__select-all"
                @update:model-value="toggleSelectAll"
              />
            </div>

            <v-list
              class="chip-recipes-export__fields-list pa-1"
              bg-color="transparent"
              density="compact"
            >
              <v-list-item
                v-for="meta in metaOptions"
                :key="meta.id"
                rounded="lg"
                class="chip-recipes-export__item mb-1"
                :class="{'chip-recipes-export__item--selected': isMetaSelected(meta.id)}"
                @click="toggleMeta(meta.id)"
              >
                <template #prepend>
                  <v-icon
                    :icon="meta.icon"
                    :color="isMetaSelected(meta.id) ? 'primary' : undefined"
                    size="20"
                    class="mr-2"
                  />
                </template>

                <v-list-item-title class="text-body-2 font-weight-medium">
                  {{ meta.name }}
                </v-list-item-title>
                <v-list-item-subtitle class="text-caption">
                  {{ meta.typeLabel }}
                </v-list-item-subtitle>

                <template #append>
                  <v-checkbox-btn
                    :model-value="isMetaSelected(meta.id)"
                    color="primary"
                    @click.stop="toggleMeta(meta.id)"
                  />
                </template>
              </v-list-item>

              <div
                v-if="!metaOptions.length"
                class="text-caption text-medium-emphasis px-3 py-4"
              >
                {{ t('settings_labels.library.chip_recipes_fields_empty') }}
              </div>
            </v-list>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="previewDialog"
      width="520"
      scrollable
      persistent
    >
      <v-card>
        <DialogHeader
          :header="previewRecipe?.name || t('settings_labels.library.chip_recipes_preview')"
          :subheader="previewRecipeSubheader"
          icon="puzzle-outline"
          closable
          :buttons="previewHeaderButtons"
          @close="closePreview"
        />

        <v-card-text class="pa-4">
          <div
            v-if="previewRecipe?.description"
            class="text-body-2 text-medium-emphasis mb-4"
          >
            {{ previewRecipe.description }}
          </div>

          <v-list
            v-if="previewResult"
            class="chip-recipes-preview__stats pa-0"
            bg-color="transparent"
          >
            <v-list-item class="px-0">
              <template #prepend>
                <v-avatar
                  color="primary"
                  variant="tonal"
                  size="36"
                >
                  <v-icon
                    icon="mdi-shape-outline"
                    size="18"
                  />
                </v-avatar>
              </template>
              <v-list-item-title class="text-body-2">
                {{ t('settings_labels.library.chip_recipes_preview_fields', {
                  created: previewResult.fieldsCreated,
                  skipped: previewResult.fieldsSkipped,
                }) }}
              </v-list-item-title>
            </v-list-item>
            <v-list-item class="px-0">
              <template #prepend>
                <v-avatar
                  color="primary"
                  variant="tonal"
                  size="36"
                >
                  <v-icon
                    icon="mdi-tag-multiple-outline"
                    size="18"
                  />
                </v-avatar>
              </template>
              <v-list-item-title class="text-body-2">
                {{ t('settings_labels.library.chip_recipes_preview_tags', {
                  created: previewResult.tagsCreated,
                  skipped: previewResult.tagsSkipped,
                  conflicted: previewResult.tagsConflicted,
                }) }}
              </v-list-item-title>
            </v-list-item>
            <v-list-item class="px-0">
              <template #prepend>
                <v-avatar
                  color="primary"
                  variant="tonal"
                  size="36"
                >
                  <v-icon
                    icon="mdi-pin-outline"
                    size="18"
                  />
                </v-avatar>
              </template>
              <v-list-item-title class="text-body-2">
                {{ t('settings_labels.library.chip_recipes_preview_pins', {
                  created: previewResult.pinsCreated,
                  skipped: previewResult.pinsSkipped,
                }) }}
              </v-list-item-title>
            </v-list-item>
          </v-list>

          <v-alert
            v-if="previewResult?.mediaTypesMissing?.length"
            type="warning"
            variant="tonal"
            density="compact"
            rounded="lg"
            class="mt-4 text-caption"
          >
            {{ t('settings_labels.library.chip_recipes_missing_media_types', {
              names: previewResult.mediaTypesMissing.join(', '),
            }) }}
          </v-alert>
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import {computed, onMounted, reactive, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import {useAppStore} from '@/stores/app'
import {typedApi} from '@/services/typedApi'
import {setNotification} from '@/services/notificationService'
import {openExternal} from '@/services/shellService'
import {reloadMetaCatalog} from '@/composable/metaCatalog'
import {reloadTagsCatalog} from '@/composable/appCatalogs'
import {getIconDataType, getTextDataType} from '@/services/metaTypeUtils'
import {
  CHIP_RECIPE_CATEGORIES,
  chipRecipeFilename,
  slugifyRecipeId,
  type ChipRecipe,
} from '@shared/chipRecipe'
import {downloadTextFile} from '@/utils/playlistExport'

const {t, te} = useI18n()
const appStore = useAppStore()

const exportDialog = ref(false)
const previewDialog = ref(false)
const exporting = ref(false)
const importing = ref(false)
const catalogLoading = ref(false)
const catalogError = ref('')
const installingId = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const discordUrl = ref('https://discord.gg/dEQPper2yu')

const catalogEntries = ref<Array<{
  id: string
  name: string
  description?: string
  author?: string
  category?: string
  sfw?: boolean
  path: string
}>>([])

const previewRecipe = ref<ChipRecipe | null>(null)
const previewResult = ref<{
  fieldsCreated: number
  fieldsSkipped: number
  tagsCreated: number
  tagsSkipped: number
  tagsConflicted: number
  pinsCreated: number
  pinsSkipped: number
  mediaTypesMissing?: string[]
} | null>(null)

const exportForm = reactive({
  name: '',
  description: '',
  author: '',
  category: 'general',
  sfw: true,
  includeTags: false,
  metaIds: [] as number[],
})

const exportSelectAll = ref(false)

const metaOptions = computed(() =>
  (appStore.meta || [])
    .filter((meta) => meta?.id != null)
    .map((meta) => {
      const type = String(meta.type || 'string')
      const customIcon = String(meta.icon || '').trim()
      return {
        id: Number(meta.id),
        name: String(meta.name || `Field ${meta.id}`),
        type,
        typeLabel: getTextDataType(type, {t, te}),
        icon: customIcon
          ? (customIcon.startsWith('mdi-') ? customIcon : `mdi-${customIcon}`)
          : (getIconDataType(type) || 'mdi-shape-outline'),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name)),
)

const categoryItems = CHIP_RECIPE_CATEGORIES.map((value) => ({
  title: value,
  value,
}))

const exportFilenamePreview = computed(() =>
  chipRecipeFilename(slugifyRecipeId(exportForm.name || 'recipe')),
)

const canExport = computed(() =>
  Boolean(exportForm.name.trim()) && exportForm.metaIds.length > 0 && !exporting.value,
)

const exportHeaderButtons = computed(() => [
  {
    icon: 'export-variant',
    text: t('settings_labels.library.chip_recipes_export'),
    color: 'primary',
    disabled: !canExport.value,
    order: 1,
    function: () => { void runExport() },
  },
])

const previewHeaderButtons = computed(() => [
  {
    icon: 'check',
    text: t('settings_labels.library.chip_recipes_apply'),
    color: 'primary',
    disabled: importing.value,
    order: 1,
    function: () => { void applyPreview() },
  },
])

const previewRecipeSubheader = computed(() => {
  const parts: string[] = []
  if (previewRecipe.value?.category) parts.push(String(previewRecipe.value.category))
  if (previewRecipe.value?.author) parts.push(String(previewRecipe.value.author))
  if (previewRecipe.value?.sfw === false) parts.push('NSFW')
  return parts.join(' · ') || undefined
})

watch(
  () => exportForm.metaIds.length,
  (selected) => {
    exportSelectAll.value = selected > 0 && selected === metaOptions.value.length
  },
)

function isMetaSelected(id: number): boolean {
  return exportForm.metaIds.includes(id)
}

function toggleMeta(id: number) {
  const index = exportForm.metaIds.indexOf(id)
  if (index >= 0) {
    exportForm.metaIds.splice(index, 1)
  } else {
    exportForm.metaIds.push(id)
  }
}

function toggleSelectAll(value: boolean | null) {
  if (value) {
    exportForm.metaIds = metaOptions.value.map((meta) => meta.id)
  } else {
    exportForm.metaIds = []
  }
}

function openExportDialog() {
  if (!exportForm.name.trim()) {
    exportForm.name = 'My recipe'
  }
  if (!exportForm.metaIds.length && metaOptions.value.length) {
    exportForm.metaIds = metaOptions.value.map((meta) => meta.id)
    exportSelectAll.value = true
  }
  exportDialog.value = true
}

function closeExportDialog() {
  if (exporting.value) return
  exportDialog.value = false
}

function openDiscord() {
  void openExternal(discordUrl.value)
}

function catalogIcon(category?: string): string {
  switch (String(category || '').toLowerCase()) {
    case 'movies':
      return 'mdi-movie-open-outline'
    case 'photos':
      return 'mdi-image-multiple-outline'
    case 'adult':
      return 'mdi-eye-outline'
    default:
      return 'mdi-puzzle-outline'
  }
}

function catalogTitle(entry: {id: string; name: string}): string {
  const key = `settings_labels.library.chip_recipes_starter.${entry.id}.name`
  return te(key) ? t(key) : entry.name
}

function catalogDescription(entry: {id: string; description?: string}): string {
  const key = `settings_labels.library.chip_recipes_starter.${entry.id}.description`
  if (te(key)) return t(key)
  return entry.description || ''
}

function pickImportFile() {
  fileInput.value?.click()
}

async function saveRecipeFile(recipe: ChipRecipe) {
  const content = `${JSON.stringify(recipe, null, 2)}\n`
  const defaultPath = chipRecipeFilename(recipe.id)
  const filters = [{name: 'Chip recipe', extensions: ['chiprecipe.json', 'json']}]

  if (window.electronAPI?.invoke) {
    const result = await window.electronAPI.invoke('dialog:saveFile', {
      defaultPath,
      content,
      filters,
    }) as {canceled?: boolean; filePath?: string}
    if (result?.canceled) return false
    setNotification({
      type: 'success',
      title: t('settings_labels.library.chip_recipes_export'),
      text: t('settings_labels.library.chip_recipes_export_success', {
        path: result.filePath || defaultPath,
      }),
    })
    return true
  }

  downloadTextFile(content, defaultPath)
  setNotification({
    type: 'success',
    title: t('settings_labels.library.chip_recipes_export'),
    text: t('settings_labels.library.chip_recipes_export_success', {path: defaultPath}),
  })
  return true
}

async function runExport() {
  exporting.value = true
  try {
    const response = await typedApi.exportChipRecipe({
      name: exportForm.name.trim(),
      description: exportForm.description.trim() || undefined,
      author: exportForm.author.trim() || undefined,
      category: exportForm.category,
      sfw: exportForm.sfw,
      includeTags: exportForm.includeTags,
      metaIds: [...exportForm.metaIds],
    })
    const saved = await saveRecipeFile(response.data)
    if (saved) exportDialog.value = false
  } catch (err) {
    setNotification({
      type: 'error',
      title: t('settings_labels.library.chip_recipes_export'),
      text: err instanceof Error ? err.message : String(err),
    })
  } finally {
    exporting.value = false
  }
}

async function openPreview(recipe: ChipRecipe) {
  const response = await typedApi.previewChipRecipe(recipe)
  previewRecipe.value = recipe
  previewResult.value = response.data as typeof previewResult.value
  previewDialog.value = true
}

function closePreview() {
  if (importing.value) return
  previewDialog.value = false
  previewRecipe.value = null
  previewResult.value = null
}

async function applyPreview() {
  if (!previewRecipe.value) return
  importing.value = true
  try {
    const response = await typedApi.importChipRecipe(previewRecipe.value)
    const result = response.data as {
      fieldsCreated?: number
      tagsCreated?: number
      pinsCreated?: number
    }
    await reloadMetaCatalog()
    await reloadTagsCatalog()
    setNotification({
      type: 'success',
      title: t('settings_labels.library.chip_recipes_apply'),
      text: t('settings_labels.library.chip_recipes_apply_success', {
        fields: result.fieldsCreated ?? 0,
        tags: result.tagsCreated ?? 0,
        pins: result.pinsCreated ?? 0,
      }),
    })
    closePreview()
  } catch (err) {
    setNotification({
      type: 'error',
      title: t('settings_labels.library.chip_recipes_apply'),
      text: err instanceof Error ? err.message : String(err),
    })
  } finally {
    importing.value = false
  }
}

async function onImportFilePicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  try {
    const text = await file.text()
    const recipe = JSON.parse(text) as ChipRecipe
    await openPreview(recipe)
  } catch (err) {
    setNotification({
      type: 'error',
      title: t('settings_labels.library.chip_recipes_import_file'),
      text: err instanceof Error ? err.message : String(err),
    })
  }
}

async function loadCatalog() {
  catalogLoading.value = true
  catalogError.value = ''
  try {
    const response = await typedApi.getChipRecipeCatalog()
    catalogEntries.value = response.data.recipes || []
    if (response.data.discord?.discordUrl) {
      discordUrl.value = response.data.discord.discordUrl
    }
  } catch (err) {
    catalogEntries.value = []
    catalogError.value = err instanceof Error
      ? err.message
      : t('settings_labels.library.chip_recipes_catalog_error')
  } finally {
    catalogLoading.value = false
  }
}

async function installFromCatalog(entry: {id: string; path: string}) {
  installingId.value = entry.id
  try {
    const response = await typedApi.getChipRecipeCatalogFile(entry.path)
    await openPreview(response.data)
  } catch (err) {
    setNotification({
      type: 'error',
      title: t('settings_labels.library.chip_recipes_install'),
      text: err instanceof Error ? err.message : String(err),
    })
  } finally {
    installingId.value = null
  }
}

onMounted(() => {
  exportForm.metaIds = metaOptions.value.map((meta) => meta.id)
  exportSelectAll.value = true
  void loadCatalog()
})
</script>

<style scoped lang="scss">
.chip-recipes__hint {
  max-width: 52rem;
  line-height: 1.45;
}

.chip-recipes__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chip-recipes__card {
  border-color: rgba(var(--v-border-color), var(--v-border-opacity));
}

.chip-recipes__empty {
  padding: 20px 16px;
  border: 1px dashed rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 16px;
}

.chip-recipes-export__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
}

.chip-recipes-export__switches {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chip-recipes-export__sfw {
  margin-inline: 0;

  :deep(.v-selection-control) {
    min-height: 32px;
  }

  :deep(.v-label) {
    font-size: 0.8125rem;
  }

  :deep(.v-switch__track) {
    min-width: 36px;
    height: 18px;
  }

  :deep(.v-switch__thumb) {
    width: 14px;
    height: 14px;
  }
}

.chip-recipes-export__fields {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;
  overflow: hidden;
}

.chip-recipes-export__fields-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: 36px;
  padding: 2px 10px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: transparent;
}

.chip-recipes-export__select-all {
  margin: 0;
  min-height: 0;

  :deep(.v-selection-control) {
    min-height: 32px;
  }

  :deep(.v-label) {
    font-size: 0.8125rem;
    line-height: 1.2;
  }
}

.chip-recipes-export__fields-list {
  max-height: 260px;
  overflow: auto;
}

.chip-recipes-export__item {
  min-height: 48px;
  background: transparent !important;
}

.chip-recipes-export__item--selected {
  background: rgba(var(--v-theme-primary), 0.08) !important;
}

.chip-recipes-export__item :deep(.v-list-item__overlay) {
  opacity: 0 !important;
}

.chip-recipes-preview__stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
