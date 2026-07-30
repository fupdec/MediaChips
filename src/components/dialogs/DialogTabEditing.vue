<template>
  <v-dialog v-model="dialog.show" scrollable width="600">
    <v-card>
      <DialogHeader
        @close="closeDialog"
        header="Editing tab"
        :buttons="buttons"
        icon="tab"
        closable
      />

      <v-card-text class="pa-sm-4 pa-2">
        <v-form ref="form" v-model="valid" @submit.prevent="save">
          <v-text-field
            v-model="tabName"
            :rules="nameRules"
            label="Name"
            required
            autofocus
          />
        </v-form>

        <DialogIcons
          :icon="icon"
          @apply="changeIcon"
        />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {ref, computed, watch, defineAsyncComponent} from 'vue'
import {useI18n} from 'vue-i18n'
import type {VFormInstance} from '@/types/vue'
import {typedApi} from '@/services/typedApi'
import {useDialogsStore} from '@/stores/dialogs'
import {reloadTabsCatalog} from '@/composable/appCatalogs'
import {validateName as validateNameFormat} from '@/services/formatUtils'

import DialogHeader from "@/components/elements/DialogHeader.vue"

const DialogIcons = defineAsyncComponent(() => import("@/components/dialogs/DialogIcons.vue"))

interface EditingTab {
  id?: number
  name?: string
  icon?: string
}

const dialogsStore = useDialogsStore()
const {t} = useI18n()

const valid = ref(false)
const dialogIcons = ref(false)
const tabName = ref('')
const icon = ref('')
const form = ref<VFormInstance>(null)

const buttons = ref([{
  icon: "content-save",
  text: "Save",
  color: "success",
  variant: "flat",
  action: () => {
    save()
  },
}])

// Computed properties
const dialog = computed({
  get() {
    return dialogsStore.tabEditing
  },
  set(value) {
    dialogsStore.tabEditing = value
  }
})

const nameRules = [
  (v: string) => {
    const result = validateNameFormat(v || '')
    return result === true ? true : t(result)
  },
]

// Methods
const changeIcon = (newIcon: string) => {
  dialogIcons.value = false
  icon.value = newIcon
}

const save = async () => {
  if (!form.value) return

  const {valid: formValid} = await form.value.validate()
  if (!formValid) return

  if (!dialog.value.tab?.id) {
    console.error('No tab ID found')
    return
  }

  try {
    await typedApi.updateTab(Number(dialog.value.tab.id), {
      name: tabName.value,
      icon: icon.value,
    })

    void reloadTabsCatalog()
  } catch (error) {
    console.error('Error saving tab:', error)
  }

  closeDialog()
}

const closeDialog = () => {
  dialogsStore.tabEditing.show = false
  dialogsStore.tabEditing.tab = null
  tabName.value = ''
  icon.value = ''
}

// Watchers
watch(() => dialog.value.tab, (val) => {
  if (!val) return

  const tab = val as EditingTab
  console.log('Editing tab:', tab)
  icon.value = tab.icon || ''
  tabName.value = tab.name || ''
}, {immediate: true})

// Для очистки при закрытии диалога
watch(() => dialog.value.show, (show) => {
  if (!show) {
    tabName.value = ''
    icon.value = ''
  }
})
</script>