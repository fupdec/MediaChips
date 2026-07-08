<template>
  <div>
    <v-dialog
      :model-value="dialogModel"
      @update:model-value="dialogModel = false"
      :fullscreen="xs"
      scrollable
      width="600"
    >
      <v-card>
        <DialogHeader
          @close="close"
          :header="translate('media.type.media_header', {name: getMediaTypeName(media, translate)})"
          :buttons="buttons"
          closable
        />

        <v-card-text class="px-4 pb-4 pt-5">
          <v-form
            v-model="valid"
            ref="form"
            @submit.prevent
          >
            <v-text-field v-model="name" :rules="[v => validateName(v)]" :label="translate('common.name')"/>
            <v-autocomplete
              v-model="extensions"
              :hide-no-data="!search"
              :items="extensionItems"
              :rules="[
                (v) => v.length > 0 || translate('validation.extension_required'),
              ]"
              :label="translate('media.type.extensions')"
              :hint="translate('media.type.file_extensions_hint')"
              multiple
              chips
              closable-chips
              clearable
              @update:search="search = $event"
            >
              <template v-slot:no-data>
                <v-list-item @click="addExt">
                  <span class="mr-2 text-subtitle-2">{{ translate('common.add') }}</span>
                  <v-chip size="small">
                    {{ search }}
                  </v-chip>
                </v-list-item>
              </template>
            </v-autocomplete>

            <DialogIcons
              :icon="icon"
              @apply="changeIcon"
            />
          </v-form>

          <v-switch
            v-model="hidden"
            :false-value="0"
            :true-value="1"
            :label="translate('media.type.hide_in_navbar')"
            class="mt-4"
            hide-details
            inset
          />
        </v-card-text>
      </v-card>
    </v-dialog>

    <DialogDeleteConfirm
      v-if="dialogDeleteMediaType"
      @close="dialogDeleteMediaType = false"
      @delete="deleteMeta"
      :dialog="dialogDeleteMediaType"
      :text="textDialogDelete"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted, defineAsyncComponent} from 'vue'
import type {PropType} from 'vue'
import type {VFormInstance} from '@/types/vue'
import {useI18n} from 'vue-i18n'
import {useDisplay} from 'vuetify'
import {typedApi} from '@/services/typedApi'
import {validateName} from '@/services/formatUtils'
import DialogHeader from '@/components/elements/DialogHeader.vue'
const DialogIcons = defineAsyncComponent(() => import('@/components/dialogs/DialogIcons.vue'))
import DialogDeleteConfirm from '@/components/dialogs/DialogDeleteConfirm.vue'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import type {MediaType} from '@/types/media'

interface EditableMediaType extends MediaType {
  custom?: boolean
}

interface DialogHeaderButton {
  icon?: string
  text?: string
  color?: string
  variant?: string
  function?: () => void | Promise<void>
}

const props = defineProps({
  dialog: Boolean,
  media: {
    type: Object as PropType<EditableMediaType>,
    default: undefined,
  },
})

const emit = defineEmits(['update', 'close', 'update:dialog'])

const {xs} = useDisplay()
const {t: translate} = useI18n()
const form = ref<VFormInstance>(null)

const dialogModel = computed({
  get: () => props.dialog,
  set: (value) => emit('update:dialog', value)
})

const dialogDeleteMediaType = ref(false)
const valid = ref(false)
const name = ref('')
const icon = ref('shape')
const extensions = ref<string[]>([])
const extensionItems: string[] = []
const search = ref('')
const hidden = ref(0)
const buttons = ref<DialogHeaderButton[]>([])

const textDialogDelete = computed(() => {
  return `${translate('media.type.delete_confirm')}\n${translate('common.are_you_sure')}`
})

onMounted(() => {
  initButtons()
  initMediaType()
})

watch(() => props.media, () => {
  if (props.media) {
    initMediaType()
  }
})

function initButtons() {
  buttons.value = []

  if (props.media?.custom) {
    buttons.value.push({
      icon: 'delete',
      text: translate('common.delete'),
      color: 'error',
      variant: 'flat',
      function: () => {
        dialogDeleteMediaType.value = true
      }
    })
  }

  buttons.value.push({
    icon: 'check',
    text: translate('common.apply'),
    color: 'success',
    variant: 'flat',
    function: apply
  })
}

function initMediaType() {
  const media = props.media
  if (!media) return

  name.value = media.name || ''
  icon.value = media.icon || 'shape'
  extensions.value = media.extensions?.split(',') || []
  hidden.value = media.hidden ? 1 : 0
}

function changeIcon(newIcon: string) {
  icon.value = newIcon
}

async function apply() {
  await form.value?.validate()
  if (!valid.value || !props.media) return

  try {
    await typedApi.updateMediaType(props.media.id, {
      name: name.value,
      icon: icon.value,
      extensions: extensions.value.sort().join(','),
      hidden: hidden.value
    })
    emit('update')
  } catch (e) {
    console.error(e)
  }
}

function addExt() {
  if (search.value && !extensions.value.includes(search.value)) {
    extensions.value.push(search.value)
  }
  search.value = ''
}

function deleteMeta() {
  // Реализуйте удаление медиатипа
  dialogDeleteMediaType.value = false
  emit('update')
  close()
}

function close() {
  emit('close')
  dialogModel.value = false
}
</script>