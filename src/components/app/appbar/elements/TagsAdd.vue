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
              v-if="suggestions.length"
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

            <div v-if="suggestions.length" class="d-flex align-center ga-2 mb-3">
              <span class="text-caption text-medium-emphasis">{{ t('meta.dialogs.pick_mode') }}:</span>
              <v-btn-toggle
                v-model="pickMode"
                mandatory
                rounded
                variant="tonal"
                color="primary"
                density="compact"
              >
                <v-btn size="small" value="top">
                  <v-icon icon="mdi-star-outline" start/>
                  {{ t('meta.dialogs.pick_top') }}
                </v-btn>
                <v-btn size="small" value="random">
                  <v-icon icon="mdi-shuffle-variant" start/>
                  {{ t('meta.dialogs.pick_random') }}
                </v-btn>
              </v-btn-toggle>
              <span class="text-caption text-medium-emphasis">
                {{ filteredSuggestions.length }} / {{ Math.min(suggestions.length, MAX_VISIBLE) }}
              </span>
              <v-spacer/>
              <v-btn
                v-if="refreshCallback"
                size="small"
                rounded
                variant="tonal"
                color="primary"
                :disabled="isRefreshing"
                :loading="isRefreshing"
                @click="doRefresh"
              >
                <v-icon icon="mdi-refresh" start/>
                {{ t('meta.dialogs.refresh_suggestions') }}
              </v-btn>
            </div>

            <div class="suggestion-list mb-3">
              <v-virtual-scroll
                :items="filteredSuggestions"
                :height="filteredSuggestions.length > 20 ? 420 : Math.max(filteredSuggestions.length * 40, 80)"
                item-height="40"
              >
                <template #default="{ item: itemKey, index }">
                  <div class="suggestion-row" :class="{ 'suggestion-row--alt': index % 2 === 1 }">
                    <v-checkbox
                      :model-value="isSuggestionSelected(itemKey)"
                      :color="isExistingTag(itemKey) ? 'secondary' : 'primary'"
                      density="compact"
                      hide-details
                      class="suggestion-row__check flex-grow-0"
                      @update:model-value="toggleSuggestion(itemKey)"
                    />

                    <v-text-field
                      :model-value="suggestionEdits[itemKey] ?? itemKey"
                      variant="outlined"
                      density="compact"
                      hide-details
                      single-line
                      class="suggestion-row__input flex-grow-1"
                      :class="{ 'suggestion-row__input--exists': isExistingTag(itemKey) }"
                      @update:model-value="(v: string) => onEditSuggestion(itemKey, v)"
                    />

                    <v-btn
                      v-if="!isExistingTag(itemKey)"
                      size="small"
                      rounded
                      variant="tonal"
                      color="primary"
                      class="suggestion-row__add flex-grow-0 ml-1"
                      :disabled="submitting"
                      @click="addSingle(itemKey)"
                    >
                      <v-icon icon="mdi-plus" start/>
                      {{ t('common.add') }}
                    </v-btn>
                    <span
                      v-else
                      class="suggestion-row__exists text-caption text-secondary ml-2 flex-grow-0"
                    >
                      {{ t('meta.dialogs.suggestion_exists') }}
                    </span>

                    <v-btn
                      size="small"
                      rounded
                      variant="tonal"
                      color="warning"
                      class="suggestion-row__ban flex-grow-0 ml-1"
                      :disabled="submitting"
                      @click="banWord(itemKey)"
                    >
                      <v-icon icon="mdi-cancel" start/>
                      {{ t('meta.dialogs.ban_word') }}
                    </v-btn>
                  </div>
                </template>
              </v-virtual-scroll>
              <div
                v-if="suggestions.length && !filteredSuggestions.length"
                class="text-caption text-medium-emphasis pa-2"
              >
                {{ t('meta.dialogs.filter_suggestions_empty') }}
              </div>
            </div>

            <div
              v-if="banList.length"
              class="d-flex justify-start mb-3"
            >
              <v-btn
                size="small"
                rounded
                variant="tonal"
                color="warning"
                @click="showBanList = !showBanList"
              >
                <v-icon :icon="showBanList ? 'mdi-chevron-up' : 'mdi-block-helper'" start size="small"/>
                {{ t('meta.dialogs.ban_list') }} ({{ banList.length }})
              </v-btn>
            </div>

            <!-- Ban list panel -->
            <v-expand-transition>
              <div v-if="showBanList && banList.length" class="suggestion-list mb-3">
                <div class="d-flex align-center pa-2 ban-list-header">
                  <span class="text-caption font-weight-medium text-warning">
                    {{ t('meta.dialogs.banned_phrases') }} ({{ banList.length }})
                  </span>
                </div>
                <v-virtual-scroll
                  :items="banList"
                  :height="Math.min(banList.length * 40, 200)"
                  item-height="40"
                >
                  <template #default="{ item: banned, index }">
                    <div class="suggestion-row" :class="{ 'suggestion-row--alt': index % 2 === 1 }">
                      <span class="text-body-2 flex-grow-1 px-2 text-warning">{{ banned }}</span>
                      <v-btn
                        size="small"
                        rounded
                        variant="tonal"
                        color="primary"
                        class="flex-grow-0 mr-1"
                        @click="unbanWord(banned)"
                      >
                        <v-icon icon="mdi-undo" start/>
                        {{ t('meta.dialogs.unban_word') }}
                      </v-btn>
                    </div>
                  </template>
                </v-virtual-scroll>
              </div>
            </v-expand-transition>
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
import {computed, nextTick, onMounted, onUnmounted, reactive, ref} from 'vue'
import type { PropType } from 'vue'
import {useRoute} from 'vue-router'
import {useI18n} from 'vue-i18n'
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
import {createTagsInteractive} from '@/composable/createTagsInteractive'
import {transformTextToArray, validateName} from '@/services/formatUtils'
import {getDefaultTagCategoryId} from '@/services/ensureStarterMeta'
import {acceptSuggestedTagsAndAssign} from '@/services/importPathAutoTag'
import {setOption} from '@/services/settingsService'

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

/* ---------------- STATE ---------------- */

const names = ref('')
const dups = ref<string[]>([])
const added = ref<string[]>([])
const selectedMetaId = ref<number | null>(null)
const metaMenuOpen = ref(false)
const reviewMode = ref(false)
const customTitle = ref<string | null>(null)
const suggestions = ref<string[]>([])
const selectedSuggestions = ref<string[]>([])
const suggestionFilter = ref('')
const pickMode = ref<'top' | 'random'>('top')
const assignMediaIds = ref<number[]>([])
const submitting = ref(false)
const showBanList = ref(false)
const isRefreshing = ref(false)

/** Callback to re-fetch suggestions from the API. */
const refreshCallback = ref<(() => Promise<string[]>) | null>(null)

/** Original name → edited value (omitted when unchanged). */
const suggestionEdits = reactive<Record<string, string>>({})

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
  // Read from the store each time — a snapshot of `app.tags` would keep deleted names.
  for (const tag of app.tags || []) {
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

const banList = computed<string[]>(() => {
  try {
    const raw = settingsStore.tagSuggestionBanList || '[]'
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean).sort() : []
  } catch {
    return []
  }
})

const MAX_VISIBLE = 500

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const filteredSuggestions = computed(() => {
  const query = String(suggestionFilter.value || '').trim().toLowerCase()
  let pool = query
    ? suggestions.value.filter((name) => name.toLowerCase().includes(query))
    : [...suggestions.value]

  if (pickMode.value === 'random') {
    pool = shuffleArray(pool)
  }
  if (pool.length > MAX_VISIBLE) {
    pool = pool.slice(0, MAX_VISIBLE)
  }

  return pool.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
})

const pendingNames = computed(() => {
  if (!reviewMode.value) return transformTextToArray(names.value)
  return selectedSuggestions.value.map((key) => resolveEditedName(key))
})

/* ---------------- HELPERS ---------------- */

function persistBanList(list: string[]) {
  void setOption(JSON.stringify(list.filter(Boolean)), 'tagSuggestionBanList')
}

function banWord(word: string) {
  if (banList.value.some((b) => b.toLowerCase() === word.toLowerCase())) return
  const updated = [...banList.value, word]
  persistBanList(updated)

  suggestions.value = suggestions.value.filter((s) => s.toLowerCase() !== word.toLowerCase())
  selectedSuggestions.value = selectedSuggestions.value.filter(
    (s) => s.toLowerCase() !== word.toLowerCase(),
  )
  delete suggestionEdits[word]
}

function unbanWord(word: string) {
  const updated = banList.value.filter((b) => b.toLowerCase() !== word.toLowerCase())
  persistBanList(updated)
}

async function doRefresh() {
  if (isRefreshing.value || !refreshCallback.value) return
  isRefreshing.value = true
  try {
    const fresh = await refreshCallback.value()
    if (fresh.length > 0) {
      suggestions.value = fresh
      selectedSuggestions.value = [...fresh]
      suggestionFilter.value = ''
    }
  } catch {
    // silently ignore
  } finally {
    isRefreshing.value = false
  }
}

function resolveEditedName(original: string): string {
  const edited = suggestionEdits[original]
  return edited !== undefined && edited.trim() ? edited.trim() : original
}

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

function toggleSuggestion(name: string) {
  if (isSuggestionSelected(name)) {
    selectedSuggestions.value = selectedSuggestions.value.filter(
      (item) => item.toLowerCase() !== name.toLowerCase(),
    )
    return
  }
  selectedSuggestions.value = [...selectedSuggestions.value, name]
}

function onEditSuggestion(original: string, value: string) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed || trimmed.toLowerCase() === original.toLowerCase()) {
    delete suggestionEdits[original]
  } else {
    suggestionEdits[original] = trimmed
  }
}

function selectAllSuggestions() {
  selectedSuggestions.value = [...suggestions.value]
}

function clearSuggestionSelection() {
  selectedSuggestions.value = []
}

async function addSingle(original: string) {
  const name = resolveEditedName(original)
  if (!name) return

  const metaId = fixedMetaId.value
    || selectedMetaId.value
    || getDefaultTagCategoryId(app.meta, settingsStore.defaultTagCategoryId)
  if (!metaId) {
    await form.value?.validate()
    return
  }
  selectedMetaId.value = metaId

  const exists = app.tags.find(
    (i) => i.name?.toLowerCase() === name.toLowerCase(),
  )
  if (exists) {
    notificationsStore.setNotification({
      type: 'warning',
      title: t('meta.dialogs.adding_tags'),
      text: t('notifications_text.duplicates_list', {items: name}),
    })
    return
  }

  submitting.value = true
  try {
    if (assignMediaIds.value.length > 0) {
      const result = await acceptSuggestedTagsAndAssign([name], assignMediaIds.value)
      notificationsStore.setNotification({
        type: 'success',
        title: customTitle.value || t('meta.dialogs.adding_tags_complete'),
        text: t('media.adding.accept_all_suggested_tags_done', {
          created: result.createdTags,
          applied: result.applied,
        }),
      })
      listSync.getItemsFromDb({ids: assignMediaIds.value, type: 'media'})
      eventBus.emit('tagsAdd:completed', {
        names: [name],
        createdNames: result.createdNames,
        mediaIds: assignMediaIds.value,
        assigned: true,
        applied: result.applied,
      })
    } else {
      const created = await createTagsInteractive([{name, metaId}])
      if (!created) return
      notificationsStore.setNotification({
        type: 'success',
        title: t('meta.dialogs.adding_tags_complete'),
        text: t('notifications_text.added_list', {items: name}),
      })
      void reloadTagsCatalog()
      listSync.getItemsFromDb({ids: [], type: 'tag'})
      eventBus.emit('tagsAdd:completed', {
        names: [name],
        createdNames: [name],
        mediaIds: [],
        assigned: false,
        applied: 0,
      })
    }

    suggestions.value = suggestions.value.filter((s) => s.toLowerCase() !== original.toLowerCase())
    selectedSuggestions.value = selectedSuggestions.value.filter(
      (s) => s.toLowerCase() !== original.toLowerCase(),
    )
    delete suggestionEdits[original]

    if (!suggestions.value.length) closeDialog()
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
  }

  dups.value = []
  added.value = []

  arr.forEach(n => {
    const exists = app.tags.find(
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
      const created = await createTagsInteractive(
        added.value.map(i => ({
          name: i,
          metaId,
        })),
      )
      if (!created) return

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
  pickMode.value = 'top'
  showBanList.value = false
  refreshCallback.value = null
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

  refreshCallback.value = (
    typeof normalized.refreshCallback === 'function'
      ? normalized.refreshCallback as () => Promise<string[]>
      : null
  )

  suggestionFilter.value = ''
  pickMode.value = 'top'
  showBanList.value = false
  for (const key of Object.keys(suggestionEdits)) {
    delete suggestionEdits[key]
  }

  if (unique.length > 0) {
    reviewMode.value = true
    suggestions.value = unique
    selectedSuggestions.value = [...unique]
    names.value = ''
  } else {
    reviewMode.value = false
    suggestions.value = []
    selectedSuggestions.value = []
    names.value = ''
  }

  dialogNames.value = true
}

function closeDialog() {
  metaMenuOpen.value = false
  dialogNames.value = false
}

function resetForm() {
  names.value = ''
  dups.value = []
  added.value = []
  suggestions.value = []
  selectedSuggestions.value = []
  suggestionFilter.value = ''
  pickMode.value = 'top'
  showBanList.value = false
  refreshCallback.value = null
  assignMediaIds.value = []
  reviewMode.value = false
  customTitle.value = null
  selectedMetaId.value = resolveDefaultMetaId()
  valid.value = false
  submitting.value = false
  for (const key of Object.keys(suggestionEdits)) {
    delete suggestionEdits[key]
  }

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
.suggestion-list {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;
  overflow: hidden;
}

.ban-list-header {
  border-bottom: 1px solid rgba(var(--v-border-color), 0.4);
}

.suggestion-row {
  display: flex;
  align-items: center;
  gap: 0;
  min-height: 40px;
  padding: 0 8px;
}

.suggestion-row + .suggestion-row {
  border-top: 1px solid rgba(var(--v-border-color), 0.4);
}

.suggestion-row--alt {
  background: rgba(var(--v-theme-on-surface), 0.03);
}

.suggestion-row__check {
  margin-right: 4px;
}

.suggestion-row__input :deep(.v-field) {
  font-size: 13px;
}

.suggestion-row__input :deep(.v-field__outline) {
  --v-field-border-opacity: 0;
}

.suggestion-row__input--exists :deep(.v-field__input) {
  color: rgba(var(--v-theme-secondary), 0.8);
}

.suggestion-row__exists {
  white-space: nowrap;
  opacity: 0.7;
}

.suggestion-row__add,
.suggestion-row__ban {
  flex-shrink: 0;
}
</style>