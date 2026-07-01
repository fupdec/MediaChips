<template>
  <div>
    <v-dialog
      v-if="dialog"
      :model-value="dialog"
      @update:model-value="close"
      scrollable
      width="500"
    >
      <v-card>
        <!-- Inline DialogHeader -->
        <v-toolbar color="primary">
          <v-toolbar-title>Adding media type</v-toolbar-title>
          <v-spacer></v-spacer>
          <v-toolbar-items>
            <v-btn
              color="success"
              variant="flat"
              @click="addMeta"
              class="ml-2"
            >
              <v-icon icon="mdi-plus" start></v-icon>
              Add
            </v-btn>
            <v-btn icon @click="close">
              <v-icon>mdi-close</v-icon>
            </v-btn>
          </v-toolbar-items>
        </v-toolbar>

        <v-card-text class="pa-4">
          <v-form
            v-model="valid"
            ref="form"
            class="flex-grow-1"
            @submit.prevent
          >
            <v-text-field v-model="name" :rules="[nameRules]" label="Name" />
            <!-- <v-text-field v-model="singular" :rules="[nameRules]" label="Singular name" /> -->
            <v-combobox
              v-model="extensions"
              :hide-no-data="!search"
              :items="[]"
              :rules="[v => v.length > 0 || `At least one extension required`]"
              v-model:search-input="search"
              hide-selected
              label="Extensions"
              hint="File extension without dot, e.g. doc"
              multiple
              chips
              closable-chips
              append-icon=""
            >
              <template v-slot:no-data>
                <v-list-item @click="addExt">
                  <span class="mr-2 text-subtitle-1">Add</span>
                  <v-chip size="small">
                    {{ search }}
                  </v-chip>
                </v-list-item>
              </template>
            </v-combobox>

            <div class="text-medium-emphasis text-caption mt-2 mb-1">Icon</div>
            <div class="d-flex align-center">
              <v-icon @click="dialogIcons = true" size="large" start>mdi-{{ icon }}</v-icon>
              <v-btn @click="dialogIcons = true" color="primary" rounded variant="flat">
                Select icon
              </v-btn>
            </div>
          </v-form>
        </v-card-text>
      </v-card>
    </v-dialog>

    <DialogIcons
      :icon="icon"
      @apply="changeIcon"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, defineAsyncComponent } from 'vue'
import type { PropType } from 'vue'
import type { VFormInstance } from '@/types/vue'
import { typedApi } from '@/services/typedApi'
import {validateName} from '@/services/formatUtils'
const DialogIcons = defineAsyncComponent(() => import('@/components/dialogs/DialogIcons.vue'))

const props = defineProps({
  dialog: Boolean
})

const emit = defineEmits(['close', 'added'])

const form = ref<VFormInstance>(null)

const dialogIcons = ref(false)
const valid = ref(false)
const name = ref('')
const singular = ref('')
const extensions = ref<string[]>([])
const search = ref('')
const icon = ref('shape')

function addExt() {
  if (search.value && !extensions.value.includes(search.value)) {
    extensions.value.push(search.value)
    search.value = ''
  }
}

function changeIcon(selectedIcon: string) {
  dialogIcons.value = false
  icon.value = selectedIcon
}

function nameRules(string: string) {
  return validateName(string)
}

async function addMeta() {
  if (form.value) {
    const { valid: isValid } = await form.value.validate()
    if (!isValid) return
  }

  try {
    await typedApi.createMediaType({
      name: name.value,
      nameSingular: singular.value,
      extensions: [...extensions.value].sort().join(','),
      icon: icon.value,
    })

    emit('added')
    close()
  } catch (error) {
    console.error('Error adding media type:', error)
  }
}

function close() {
  // Сброс формы
  if (form.value) {
    form.value.reset()
  }
  name.value = ''
  singular.value = ''
  extensions.value = []
  search.value = ''
  icon.value = 'shape'

  emit('close')
}
</script>