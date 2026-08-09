<template>
  <AppBarButton
    v-if="button"
    :action="openDialog"
    :text="t('appbar.buttons.add_tags')"
    :color="buttonColor"
    :size="buttonSize"
    :variant="buttonVariant"
    icon="plus"
  />

  <v-dialog v-model="dialogNames" scrollable :width="reviewMode ? 720 : 600" @after-leave="resetForm">
    <v-card rounded="lg">
      <DialogHeader
        @close="closeDialog"
        :header="dialogTitle"
        :subheader="dialogSubheader"
        :buttons="buttons"
        closable
      />

      <v-card-text class="pa-sm-4 pa-2">
        <v-form ref="form" v-model="valid" validate-on="submit lazy" @submit.prevent="add">
          <v-autocomplete
            v-if="!fixedMetaId"
            v-model="selectedMetaId"
            v-model:menu="metaMenuOpen"
            :items="metas"
            :rules="[(v) => !!v || t('validation.meta_required')]"
            item-title="name"
            item-value="id"
            :label="t('meta.fields.tags_category')"
            variant="outlined"
            color="primary"
            validate-on="submit lazy"
            class="mb-4"
          >
            <template #selection="{ item }">
              <div class="d-flex align-center">
                <v-icon
                  class="mr-3"
                  :icon="`mdi-${item.raw.icon || 'tag-outline'}`"
                  size="small"
                />
                <span>{{ item.raw.name }}</span>
              </div>
            </template>

            <template #item="{ props: itemProps, item }">
              <v-list-item v-bind="itemProps">
                <template #prepend>
                  <v-icon :icon="`mdi-${item.raw.icon || 'tag-outline'}`"/>
                </template>
              </v-list-item>
            </template>
          </v-autocomplete>

          <template v-if="reviewMode">
            <div class="d-flex flex-wrap align-center ga-2 mb-3">
              <v-btn
                size="small"
                rounded
                variant="tonal"
                color="primary"
                :disabled="!suggestions.length || allSelected"
                @click="selectAllSuggestions"
              >
                <v-icon icon="mdi-checkbox-multiple-marked-outline" start/>
                {{ t('meta.dialogs.select_all_suggestions') }}
              </v-btn>
              <v-btn
                size="small"
                rounded
                variant="tonal"
                :disabled="selectedSuggestions.length === 0"
                @click="clearSuggestionSelection"
              >
                <v-icon icon="mdi-checkbox-blank-outline" start/>
                {{ t('meta.dialogs.clear_suggestions') }}
              </v-btn>
              <span class="text-caption text-medium-emphasis">
                {{ t('meta.dialogs.selected_of', {
                  selected: selectedSuggestions.length,
                  total: suggestions.length,
                }) }}
                ·
                {{ t('meta.dialogs.suggestion_new_existing_counts', {
                  new: suggestionNewCount,
                  existing: suggestionExistingCount,
                }) }}
              </span>
            </div>

            <v-alert
              v-if="assignMediaIds.length"
              type="info"
              variant="tonal"
              density="compact"
              rounded="lg"
              class="mb-3"
            >
              {{ t('meta.dialogs.will_assign_to_media', {count: assignMediaIds.length}) }}
            </v-alert>

            <v-text-field
              v-if="suggestions.length > 12"
              v-model="suggestionFilter"
              :label="t('meta.dialogs.filter_suggestions')"
              prepend-inner-icon="mdi-magnify"
              variant="outlined"
              density="compact"
              hide-details
              clearable
              class="mb-3"
              @click:clear="suggestionFilter = ''"
            />

            <div class="suggestion-chips mb-3">
              <v-chip
                v-for="name in filteredSuggestions"
                :key="name.toLowerCase()"
                :color="suggestionChipColor(name)"
                :variant="isSuggestionSelected(name) ? 'flat' : 'outlined'"
                label
                class="ma-1"
                filter
                :prepend-icon="suggestionChipIcon(name)"
                :title="isExistingTag(name)
                  ? t('meta.dialogs.suggestion_exists')
                  : t('meta.dialogs.suggestion_new')"
                @click="toggleSuggestion(name)"
              >
                {{ name }}
                <span
                  v-if="isExistingTag(name)"
                  class="suggestion-chips__badge text-caption ml-1"
                >
                  {{ t('meta.dialogs.suggestion_exists') }}
                </span>
              </v-chip>
              <div
                v-if="suggestions.length && !filteredSuggestions.length"
                class="text-caption text-medium-emphasis pa-2"
              >
                {{ t('meta.dialogs.filter_suggestions_empty') }}
              </div>
            </div>

            <div class="text-caption text-medium-emphasis mb-2">
              {{ t('meta.fields.suggestion_chips_hint') }}
            </div>

            <v-expansion-panels variant="accordion" class="mb-0 tags-add-extra-names">
              <v-expansion-panel rounded="lg">
                <v-expansion-panel-title class="text-body-2">
                  {{ t('meta.fields.add_more_names') }}
                </v-expansion-panel-title>
                <v-expansion-panel-text class="tags-add-extra-names__body">
                  <v-textarea
                    v-model="extraNames"
                    :hint="t('meta.fields.several_names_hint')"
                    :label="t('meta.fields.tag_names')"
                    :rules="[optionalNameRules]"
                    variant="outlined"
                    color="primary"
                    density="compact"
                    validate-on="submit lazy"
                    no-resize
                    rows="4"
                    class="tags-add-extra-names__textarea"
                  />
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </template>

          <v-textarea
            v-else
            v-model="names"
            :rules="[(v) => !!v || t('validation.name_required'), nameRules]"
            :hint="t('meta.fields.several_names_hint')"
            :label="t('meta.fields.tag_names')"
            variant="outlined"
            color="primary"
            validate-on="submit lazy"
            required
            autofocus
            no-resize
          />
        </v-form>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, nextTick, onMounted, onUnmounted, ref} from 'vue'
import type { PropType } from 'vue'
import {useRoute} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import type { VForm } from 'vuetify/components'
import type { OpenTagsAddWithNamesEvent } from '@shared/api/responses'

/* ---------------- COMPONENTS ---------------- */
import DialogHeader from '@/components/elements/DialogHeader.vue'
import AppBarButton from '@/components/app/appbar/AppBarButton.vue'

/* ---------------- STORES ---------------- */
import {useAppStore} from '@/stores/app'
import {useNotificationsStore} from "@/stores/notifications"
import {useSettingsStore} from '@/stores/settings'

import {useEventBus} from '@/utils/eventBus'
import {useItemsListSync} from '@/composable/itemsListSync'
import {registerAppShellHandler} from '@/composable/appShell'
import {reloadTagsCatalog} from '@/composable/appCatalogs'
import {transformTextToArray, validateName} from '@/services/formatUtils'
import {getDefaultTagCategoryId} from '@/services/ensureStarterMeta'
import {acceptSuggestedTagsAndAssign} from '@/services/importPathAutoTag'

/* ---------------- INIT ---------------- */

const props = defineProps({
  button: {type: Boolean, default: true},
  meta_id: {type: Number, default: null},
  buttonColor: {
    type: String,
    default: undefined,
  },
  buttonSize: {
    type: String,
    default: undefined,
  },
  buttonVariant: {
    type: String as PropType<'text' | 'flat' | 'elevated' | 'outlined' | 'plain' | 'tonal'>,
    default: 'text',
  },
})

const {t} = useI18n()
const route = useRoute()

const app = useAppStore()
const settingsStore = useSettingsStore()
const notificationsStore = useNotificationsStore()
const eventBus = useEventBus()
const listSync = useItemsListSync()
const tagsStore = app.tags

/* ---------------- STATE ---------------- */

const names = ref('')
const extraNames = ref('')
const dups = ref<string[]>([])
const added = ref<string[]>([])
const selectedMetaId = ref<number | null>(null)
const metaMenuOpen = ref(false)
const reviewMode = ref(false)
const customTitle = ref<string | null>(null)
const suggestions = ref<string[]>([])
const selectedSuggestions = ref<string[]>([])
const suggestionFilter = ref('')
const assignMediaIds = ref<number[]>([])
const submitting = ref(false)

const valid = ref(false)
const dialogNames = ref(false)

const form = ref<VForm | null>(null)

const buttons = computed(() => [
  {
    icon: assignMediaIds.value.length ? 'tag-check-outline' : 'plus',
    text: assignMediaIds.value.length
      ? t('meta.dialogs.add_and_assign_tags')
      : (reviewMode.value ? t('meta.dialogs.add_selected_tags') : t('common.add')),
    color: 'success',
    outlined: false,
    disabled: submitting.value || (reviewMode.value && !pendingNames.value.length),
    action: add,
  },
])

/* ---------------- COMPUTED ---------------- */

const metas = computed(() => app.meta?.filter(i => i.type === 'array') || [])
const fixedMetaId = computed(() => props.meta_id || (route.query.metaId ? Number(route.query.metaId) : null))

const dialogTitle = computed(() => (
  customTitle.value || t('meta.dialogs.adding_tags')
))

const dialogSubheader = computed(() => {
  if (!reviewMode.value) return undefined
  return t('meta.dialogs.review_tags_subheader')
})

const existingTagNames = computed(() => {
  const set = new Set<string>()
  for (const tag of tagsStore || []) {
    const name = String(tag?.name || '').trim().toLowerCase()
    if (name) set.add(name)
  }
  return set
})

const allSelected = computed(() => (
  suggestions.value.length > 0
  && selectedSuggestions.value.length === suggestions.value.length
))

const suggestionNewCount = computed(() => (
  suggestions.value.filter((name) => !isExistingTag(name)).length
))

const suggestionExistingCount = computed(() => (
  suggestions.value.length - suggestionNewCount.value
))

const filteredSuggestions = computed(() => {
  const query = String(suggestionFilter.value || '').trim().toLowerCase()
  if (!query) return suggestions.value
  return suggestions.value.filter((name) => name.toLowerCase().includes(query))
})

const pendingNames = computed(() => {
  if (!reviewMode.value) return transformTextToArray(names.value)
  const fromChips = selectedSuggestions.value
  const fromExtra = transformTextToArray(extraNames.value)
  return uniqueNames([...fromChips, ...fromExtra])
})

/* ---------------- METHODS ---------------- */

function uniqueNames(list: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const name = String(raw || '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

function isExistingTag(name: string): boolean {
  return existingTagNames.value.has(String(name || '').trim().toLowerCase())
}

function isSuggestionSelected(name: string): boolean {
  const key = name.toLowerCase()
  return selectedSuggestions.value.some((item) => item.toLowerCase() === key)
}

function suggestionChipIcon(name: string): string {
  if (isExistingTag(name)) {
    return isSuggestionSelected(name) ? 'mdi-tag-check' : 'mdi-tag-check-outline'
  }
  return isSuggestionSelected(name) ? 'mdi-check' : 'mdi-tag-plus-outline'
}

function suggestionChipColor(name: string): string | undefined {
  if (!isSuggestionSelected(name)) return undefined
  return isExistingTag(name) ? 'secondary' : 'primary'
}

function toggleSuggestion(name: string) {
  if (isSuggestionSelected(name)) {
    selectedSuggestions.value = selectedSuggestions.value.filter(
      (item) => item.toLowerCase() !== name.toLowerCase(),
    )
    return
  }
  selectedSuggestions.value = [...selectedSuggestions.value, name]
}

function selectAllSuggestions() {
  selectedSuggestions.value = [...suggestions.value]
}

function clearSuggestionSelection() {
  selectedSuggestions.value = []
}

async function add() {
  const arr = pendingNames.value
  if (!arr.length) return

  if (!reviewMode.value) {
    await form.value?.validate()
    if (!valid.value) return
  } else {
    const metaIdCheck = fixedMetaId.value
      || selectedMetaId.value
      || getDefaultTagCategoryId(app.meta, settingsStore.defaultTagCategoryId)
    if (!metaIdCheck) {
      await form.value?.validate()
      return
    }
    if (extraNames.value.trim()) {
      const extraOk = optionalNameRules(extraNames.value)
      if (extraOk !== true) {
        notificationsStore.setNotification({
          type: 'warning',
          title: t('meta.dialogs.adding_tags'),
          text: String(extraOk),
        })
        return
      }
    }
  }

  dups.value = []
  added.value = []

  arr.forEach(n => {
    const exists = tagsStore.find(
      i => i.name?.toLowerCase() === n.toLowerCase(),
    )
    if (exists) dups.value.push(n)
    else added.value.push(n)
  })

  if (dups.value.length > 0 && !assignMediaIds.value.length) {
    notificationsStore.setNotification({
      type: 'warning',
      title: t('meta.dialogs.adding_tags_complete'),
      text: t('notifications_text.duplicates_list', {items: dups.value.join(', ')})
    })
  }

  const metaId = fixedMetaId.value
    || selectedMetaId.value
    || getDefaultTagCategoryId(app.meta, settingsStore.defaultTagCategoryId)
  if (!metaId) return
  selectedMetaId.value = metaId

  submitting.value = true
  try {
    if (assignMediaIds.value.length > 0) {
      const result = await acceptSuggestedTagsAndAssign(arr, assignMediaIds.value)
      notificationsStore.setNotification({
        type: 'success',
        title: customTitle.value || t('meta.dialogs.adding_tags_complete'),
        text: t('media.adding.accept_all_suggested_tags_done', {
          created: result.createdTags,
          applied: result.applied,
        }),
      })
      listSync.getItemsFromDb({
        ids: assignMediaIds.value,
        type: 'media',
      })
      eventBus.emit('tagsAdd:completed', {
        names: arr,
        createdNames: result.createdNames,
        mediaIds: assignMediaIds.value,
        assigned: true,
        applied: result.applied,
      })
    } else if (added.value.length > 0) {
      await typedApi.createTags(
        added.value.map(i => ({
          name: i,
          metaId,
        })),
      )

      notificationsStore.setNotification({
        type: 'success',
        title: t('meta.dialogs.adding_tags_complete'),
        text: t('notifications_text.added_list', {items: added.value.join(', ')})
      })

      void reloadTagsCatalog()

      listSync.getItemsFromDb({
        ids: [],
        type: 'tag',
      })

      eventBus.emit('tagsAdd:completed', {
        names: arr,
        createdNames: added.value,
        mediaIds: [],
        assigned: false,
        applied: 0,
      })
    } else if (dups.value.length > 0) {
      eventBus.emit('tagsAdd:completed', {
        names: arr,
        createdNames: [],
        mediaIds: [],
        assigned: false,
        applied: 0,
      })
    }

    closeDialog()
  } catch (e) {
    console.error(e)
    notificationsStore.setNotification({
      type: 'error',
      title: t('meta.dialogs.adding_tags'),
      text: String(e),
    })
  } finally {
    submitting.value = false
  }
}

function resolveDefaultMetaId(): number | null {
  return fixedMetaId.value
    || getDefaultTagCategoryId(app.meta, settingsStore.defaultTagCategoryId)
}

function openDialog() {
  reviewMode.value = false
  customTitle.value = null
  suggestions.value = []
  selectedSuggestions.value = []
  suggestionFilter.value = ''
  assignMediaIds.value = []
  selectedMetaId.value = resolveDefaultMetaId()
  dialogNames.value = true
}

function openWithNames(payload: OpenTagsAddWithNamesEvent | string[] | undefined = {}) {
  const normalized = Array.isArray(payload)
    ? {names: payload}
    : (payload || {})

  const incomingNames = Array.isArray(normalized.names)
    ? normalized.names
    : String(normalized.names || '').split('\n')
  const unique = uniqueNames(incomingNames.filter(Boolean).map(String))

  customTitle.value = typeof normalized.title === 'string' && normalized.title
    ? normalized.title
    : null
  assignMediaIds.value = Array.isArray(normalized.mediaIds)
    ? normalized.mediaIds.map(Number).filter((id) => Number.isFinite(id) && id > 0)
    : []

  selectedMetaId.value = (
    normalized.metaId != null
      ? Number(normalized.metaId)
      : null
  ) || resolveDefaultMetaId() || null

  suggestionFilter.value = ''

  if (unique.length > 0) {
    reviewMode.value = true
    suggestions.value = unique
    selectedSuggestions.value = [...unique]
    names.value = ''
    // Keep manual textarea prefilled with the same list (edit/bulk paste), as before.
    extraNames.value = unique.join('\n')
  } else {
    reviewMode.value = false
    suggestions.value = []
    selectedSuggestions.value = []
    names.value = ''
    extraNames.value = ''
  }

  dialogNames.value = true
}

function closeDialog() {
  metaMenuOpen.value = false
  dialogNames.value = false
}

function resetForm() {
  names.value = ''
  extraNames.value = ''
  dups.value = []
  added.value = []
  suggestions.value = []
  selectedSuggestions.value = []
  suggestionFilter.value = ''
  assignMediaIds.value = []
  reviewMode.value = false
  customTitle.value = null
  selectedMetaId.value = resolveDefaultMetaId()
  valid.value = false
  submitting.value = false

  nextTick(() => {
    form.value?.resetValidation()
  })
}

function nameRules(string: string) {
  const arr = transformTextToArray(string)

  for (const name of arr) {
    const validName = validateName(name)
    if (validName !== true) return t(validName)
  }

  return true
}

function optionalNameRules(string: string) {
  if (!String(string || '').trim()) return true
  return nameRules(string)
}

const openTagsAddHandler = (payload: unknown) => (
  openWithNames(payload as OpenTagsAddWithNamesEvent | string[] | undefined)
)

let unregisterOpenTagsAddWithNames: (() => void) | null = null

onMounted(() => {
  unregisterOpenTagsAddWithNames = registerAppShellHandler('openTagsAddWithNames', openTagsAddHandler)
})

onUnmounted(() => {
  unregisterOpenTagsAddWithNames?.()
  unregisterOpenTagsAddWithNames = null
})
</script>

<style scoped>
.suggestion-chips {
  max-height: 320px;
  overflow: auto;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;
  padding: 8px;
}

.suggestion-chips__badge {
  opacity: 0.8;
  font-weight: 500;
  text-transform: lowercase;
}

.tags-add-extra-names__body {
  padding: 0 !important;
}

.tags-add-extra-names__body :deep(.v-expansion-panel-text__wrapper) {
  padding: 0 12px 12px !important;
}

.tags-add-extra-names__textarea {
  margin: 0 !important;
}

.tags-add-extra-names__textarea :deep(.v-input__details) {
  padding-inline: 0;
  min-height: 0;
  padding-top: 4px;
}
</style>
