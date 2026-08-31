<template>
  <div>
    <v-dialog
      v-if="dialog"
      :model-value="dialog"
      @update:model-value="close"
      scrollable
      width="520"
    >
      <v-card rounded="xl">
        <DialogHeader
          :header="t('media.type.adding_media_type')"
          :buttons="buttons"
          closable
          @close="close"
        />

        <v-card-text class="pa-4 pa-sm-6">
          <v-form
            v-model="valid"
            ref="form"
            class="flex-grow-1"
            @submit.prevent
          >
            <v-text-field
              v-model="name"
              :rules="[nameRules]"
              :label="t('common.name')"
              variant="outlined"
              density="comfortable"
              rounded="lg"
              class="mb-3"
              hide-details="auto"
            />

            <v-combobox
              v-model="extensions"
              :hide-no-data="!search"
              :items="[]"
              :rules="[v => v.length > 0 || t('common.extension_required')]"
              v-model:search="search"
              hide-selected
              :label="t('media.type.extensions')"
              :hint="t('media.type.file_extensions_hint')"
              multiple
              chips
              closable-chips
              variant="outlined"
              density="comfortable"
              rounded="lg"
              class="mb-3"
              hide-details="auto"
              persistent-hint
            >
              <template #no-data>
                <v-list-item @click="addExt">
                  <span class="mr-2 text-subtitle-2">{{ t('common.add') }}</span>
                  <v-chip size="small">
                    {{ search }}
                  </v-chip>
                </v-list-item>
              </template>
            </v-combobox>

            <DialogIcons
              :icon="icon"
              @apply="changeIcon"
            />
          </v-form>
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, defineAsyncComponent} from 'vue'
import {useI18n} from 'vue-i18n'
import type {VFormInstance} from '@/types/vue'
import {typedApi} from '@/services/typedApi'
import {validateName} from '@/services/formatUtils'
import DialogHeader from '@/components/elements/DialogHeader.vue'

const DialogIcons = defineAsyncComponent(() => import('@/components/dialogs/DialogIcons.vue'))

defineProps({
  dialog: Boolean,
})

const emit = defineEmits(['close', 'added'])

const {t} = useI18n()
const form = ref<VFormInstance>(null)

const valid = ref(false)
const name = ref('')
const extensions = ref<string[]>([])
const search = ref('')
const icon = ref('shape')

const buttons = computed(() => [
  {
    icon: 'plus',
    text: t('common.add'),
    color: 'success',
    function: () => {
      void addMeta()
    },
  },
])

function addExt() {
  if (search.value && !extensions.value.includes(search.value)) {
    extensions.value.push(search.value)
    search.value = ''
  }
}

function changeIcon(selectedIcon: string) {
  icon.value = selectedIcon
}

function nameRules(string: string) {
  const result = validateName(string)
  return result === true ? true : t(result)
}

async function addMeta() {
  if (form.value) {
    const {valid: isValid} = await form.value.validate()
    if (!isValid) return
  }

  try {
    await typedApi.createMediaType({
      name: name.value,
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
  if (form.value) {
    form.value.reset()
  }
  name.value = ''
  extensions.value = []
  search.value = ''
  icon.value = 'shape'

  emit('close')
}
</script>
