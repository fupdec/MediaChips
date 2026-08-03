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

  <v-dialog v-model="dialogNames" scrollable width="600" @after-leave="resetForm">
    <v-card rounded="lg">
      <DialogHeader
        @close="closeDialog"
        :header="t('meta.dialogs.adding_tags')"
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

            <template #item="{ props, item }">
              <v-list-item v-bind="props">
                <template #prepend>
                  <v-icon :icon="`mdi-${item.raw.icon || 'tag-outline'}`"/>
                </template>
              </v-list-item>
            </template>
          </v-autocomplete>

          <v-textarea
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
const dups = ref<string[]>([])
const added = ref<string[]>([])
const selectedMetaId = ref<number | null>(null)
const metaMenuOpen = ref(false)

const valid = ref(false)
const dialogNames = ref(false)

const form = ref<VForm | null>(null)

const buttons = computed(() => [
  {
    icon: 'plus',
    text: t('common.add'),
    color: 'success',
    outlined: false,
    action: add
  }
])

/* ---------------- COMPUTED ---------------- */

const metas = computed(() => app.meta?.filter(i => i.type === 'array') || [])
const fixedMetaId = computed(() => props.meta_id || (route.query.metaId ? Number(route.query.metaId) : null))

/* ---------------- METHODS ---------------- */

async function add() {
  await form.value?.validate()
  if (!valid.value) return

  const arr = transformTextToArray(names.value)
  dups.value = []
  added.value = []

  // проверяем дубли
  arr.forEach(n => {
    const exists = tagsStore.find(
      i => i.name?.toLowerCase() === n.toLowerCase()
    )
    if (exists) dups.value.push(n)
    else added.value.push(n)
  })

  // уведомление о дубликатах
  if (dups.value.length > 0) {
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

  // отправляем на сервер только уникальные
  if (added.value.length > 0) {
    try {
      await typedApi.createTags(
        added.value.map(i => ({
          name: i,
          metaId
        }))
      )

      notificationsStore.setNotification({
        type: 'success',
        title: t('meta.dialogs.adding_tags_complete'),
        text: t('notifications_text.added_list', {items: added.value.join(', ')})
      })

      // 🔥 заменяет $root.$emit("getTags")
      void reloadTagsCatalog()

      // 🔥 заменяет $root.$emit("getItemsFromDb")
      listSync.getItemsFromDb({
        ids: [],
        type: 'tag'
      })

    } catch (e) {
      console.error(e)
    }
  }

  closeDialog()
}

function resolveDefaultMetaId(): number | null {
  return fixedMetaId.value
    || getDefaultTagCategoryId(app.meta, settingsStore.defaultTagCategoryId)
}

function openDialog() {
  selectedMetaId.value = resolveDefaultMetaId()
  dialogNames.value = true
}

function openWithNames(payload: { names?: string | string[]; metaId?: number } = {}) {
  const incomingNames = Array.isArray(payload.names) ? payload.names : String(payload.names || '').split('\n')
  names.value = incomingNames.filter(Boolean).join('\n')
  selectedMetaId.value = payload.metaId
    || resolveDefaultMetaId()
    || null
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
  selectedMetaId.value = resolveDefaultMetaId()
  valid.value = false

  nextTick(() => {
    form.value?.resetValidation()
  })
}

function nameRules(string: string) {
  const arr = transformTextToArray(string)

  for (const name of arr) {
    const valid = validateName(name)
    if (valid !== true) return t(valid)
  }

  return true
}

const openTagsAddHandler = (payload: unknown) => openWithNames(payload as { names?: string | string[]; metaId?: number })

let unregisterOpenTagsAddWithNames: (() => void) | null = null

onMounted(() => {
  unregisterOpenTagsAddWithNames = registerAppShellHandler('openTagsAddWithNames', openTagsAddHandler)
})

onUnmounted(() => {
  unregisterOpenTagsAddWithNames?.()
  unregisterOpenTagsAddWithNames = null
})
</script>
