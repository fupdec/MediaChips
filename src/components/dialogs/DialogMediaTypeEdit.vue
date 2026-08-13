<template>
  <div>
    <v-dialog
      :model-value="dialogModel"
      @update:model-value="dialogModel = false"
      :fullscreen="xs"
      scrollable
      width="830"
      content-class="dialog-position-start meta-manager-dialog"
    >
      <v-card rounded="xl">
        <DialogHeader
          @close="close"
          :header="translate('media.type.media_header', {name: getMediaTypeName(media, translate)})"
          :buttons="buttons"
          closable
        />

        <v-card-text class="px-4 pb-6 pt-4 meta-manager-dialog-content">
          <div
            class="meta-manager-tabs-layout"
            :class="{'meta-manager-tabs-layout--vertical': mdAndUp}"
          >
            <v-tabs
              v-model="editTab"
              :direction="mdAndUp ? 'vertical' : undefined"
              density="compact"
              class="meta-manager-tabs"
              :class="mdAndUp ? '' : 'mb-4'"
              color="primary"
              :grow="!mdAndUp"
            >
              <v-tab value="basics" prepend-icon="mdi-cog-outline">
                {{ translate('meta.dialogs.tab_basics') }}
              </v-tab>
              <v-tab value="where" prepend-icon="mdi-pin-outline">
                {{ translate('meta.dialogs.tab_where') }}
              </v-tab>
            </v-tabs>

            <div class="dialog-settings-stack">
              <template v-if="editTab === 'basics'">
                <SettingsSection padded>
                  <v-form
                    v-model="valid"
                    ref="form"
                    @submit.prevent
                  >
                    <v-text-field
                      v-model="name"
                      :rules="[v => validateName(v)]"
                      :label="translate('common.name')"
                      class="mb-3"
                      density="comfortable"
                    />
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
                      class="mb-3"
                      density="comfortable"
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
                </SettingsSection>

                <SettingsSection padded>
                  <v-switch
                    v-model="hidden"
                    :false-value="0"
                    :true-value="1"
                    :label="translate('media.type.hide_in_navbar')"
                    hide-details
                    inset
                  />
                </SettingsSection>
              </template>

              <SettingsSection v-if="editTab === 'where' && previewMediaType?.id" padded>
                <settings-category-divider
                  icon="pin-outline"
                  compact
                  :title="translate('meta.settings.assigned_fields')"
                />
                <div class="text-caption text-medium-emphasis mb-3">
                  {{ translate('meta.settings.media_card_pinned_fields_layout') }}
                </div>

                <MetaAssignmentPanel
                  :key="`media-type-pins_${previewMediaType.id}`"
                  mode="from-media-type"
                  :media-type="previewMediaType"
                  :show-warning="false"
                  :show-anchor="false"
                />
              </SettingsSection>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <DialogConfirm
      v-if="dialogDeleteMediaType"
      variant="delete"
      :dialog="dialogDeleteMediaType"
      :text="textDialogDelete"
      @close="dialogDeleteMediaType = false"
      @delete="deleteMeta"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted, nextTick, defineAsyncComponent} from 'vue'
import type {PropType} from 'vue'
import type {VFormInstance} from '@/types/vue'
import {useI18n} from 'vue-i18n'
import {useDisplay} from 'vuetify'
import {typedApi} from '@/services/typedApi'
import {validateName} from '@/services/formatUtils'
import DialogHeader from '@/components/elements/DialogHeader.vue'
const DialogIcons = defineAsyncComponent(() => import('@/components/dialogs/DialogIcons.vue'))
import DialogConfirm from '@/components/dialogs/DialogConfirm.vue'
import SettingsSection from '@/components/ui/SettingsSection.vue'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import MetaAssignmentPanel from '@/components/meta/assignment/MetaAssignmentPanel.vue'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import type {MediaType} from '@/types/media'

type EditTab = 'basics' | 'where'

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
  initialTab: {
    type: String as PropType<EditTab>,
    default: 'basics',
  },
})

const emit = defineEmits(['update', 'close', 'update:dialog'])

const {xs, mdAndUp} = useDisplay()
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
const editTab = ref<EditTab>('basics')

const textDialogDelete = computed(() => {
  return `${translate('media.type.delete_confirm')}\n${translate('common.are_you_sure')}`
})

const previewMediaType = computed(() => {
  if (!props.media) return null
  return {
    ...props.media,
    name: name.value || props.media.name,
    icon: icon.value || props.media.icon,
    hidden: Boolean(hidden.value),
  }
})

onMounted(() => {
  initButtons()
  initMediaType()
  editTab.value = props.initialTab === 'where' ? 'where' : 'basics'
})

watch(() => props.media, () => {
  if (props.media) {
    initMediaType()
  }
})

watch(() => props.initialTab, (tab) => {
  editTab.value = tab === 'where' ? 'where' : 'basics'
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
  if (editTab.value !== 'basics') {
    const nameOk = validateName(name.value) === true
    const extensionsOk = extensions.value.length > 0
    if (!nameOk || !extensionsOk) {
      editTab.value = 'basics'
      await nextTick()
      await form.value?.validate()
      return
    }
  } else {
    await form.value?.validate()
    if (!valid.value) return
  }

  if (!props.media) return

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
  dialogDeleteMediaType.value = false
  emit('update')
  close()
}

function close() {
  emit('close')
  dialogModel.value = false
}
</script>
