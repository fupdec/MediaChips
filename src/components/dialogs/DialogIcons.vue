<template>
  <v-dialog
    v-model="internalDialog"
    :attach="attach"
    width="640"
    scrollable
    :z-index="zIndex"
    @after-leave="resetDialog"
  >
    <template
      v-if="!hideActivator"
      v-slot:activator="{ props: activatorProps }"
    >
      <div class="text-caption mt-2 mb-1">{{ t('meta.fields.icon') }}</div>
      <div class="d-flex align-center">
        <v-icon v-bind="activatorProps" size="large" start>mdi-{{ icon }}</v-icon>
        <v-btn v-bind="activatorProps" :text="t('meta.fields.select_icon')"
               color="primary" rounded variant="flat">
          {{ t('meta.fields.select_icon') }}
        </v-btn>
      </div>
    </template>

    <template v-slot:default>
      <v-card rounded="xl">
        <DialogHeader
          @close="closeDialog"
          :header="t('meta.fields.icon_selection')"
          :buttons="headerButtons"
          closable
        />

        <v-card-text class="icon-picker__body pt-2 pb-3 px-3">
          <div v-if="!iconsLoaded" class="d-flex justify-center py-6">
            <v-progress-circular indeterminate color="primary" size="28" width="3" />
          </div>

          <v-data-iterator
            v-else
            :items="filteredIcons"
            :items-per-page="itemsPerPage"
            :page="page"
            @update:page="page = $event"
            :search="search"
          >
            <template v-slot:header="{ page, pageCount, prevPage, nextPage }">
              <div class="d-flex justify-space-between align-center pb-2">
                <v-text-field
                  v-model="search"
                  clearable
                  density="compact"
                  rounded
                  variant="outlined"
                  prepend-inner-icon="mdi-magnify"
                  :label="t('meta.fields.search_icons')"
                  max-width="320"
                  color="primary"
                  autofocus
                  hide-details
                />
                <div class="d-flex justify-space-between align-center">
                  <v-btn
                    icon
                    size="small"
                    :disabled="page === 1"
                    @click="prevPage"
                    variant="text"
                  >
                    <v-icon size="20">mdi-chevron-left</v-icon>
                  </v-btn>

                  <span class="mx-1 text-caption">
                {{ t('common.page_of', {page, total: pageCount}) }}
                </span>

                  <v-btn
                    icon
                    size="small"
                    :disabled="page >= pageCount"
                    @click="nextPage"
                    variant="text"
                  >
                    <v-icon size="20">mdi-chevron-right</v-icon>
                  </v-btn>
                </div>
              </div>
            </template>

            <template v-slot:default="slotProps">
              <div class="icon-picker__grid">
                <div
                  v-for="item in slotProps.items"
                  :key="item.raw.id"
                  class="icon-container"
                  :class="{ 'icon-selected': selectedIcon === item.raw.name }"
                  :title="item.raw.name"
                  @click="applyIcon(item.raw.name)"
                >
                  <v-icon size="28">mdi-{{ item.raw.name }}</v-icon>
                </div>
              </div>
            </template>
          </v-data-iterator>
        </v-card-text>
      </v-card>
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import DialogHeader from '@/components/elements/DialogHeader.vue'

interface MaterialIcon {
  id?: string
  name: string
  tags?: string[]
}

const props = defineProps({
  icon: {
    type: String,
    default: 'shape',
  },
  modelValue: {
    type: Boolean,
    default: false,
  },
  /** Hide built-in activator when parent opens the dialog via v-model (nested dialogs). */
  hideActivator: {
    type: Boolean,
    default: false,
  },
  /** Above the common nesting parents (media-edit / meta-manager dialogs, which default to 2400). */
  zIndex: {
    type: [Number, String],
    default: 2900,
  },
  /** Teleport target for the overlay (e.g. '#player' so it stays visible inside native fullscreen). */
  attach: {
    type: [String, Boolean],
    default: false,
  },
})

const emit = defineEmits(['update:modelValue', 'update:model-value', 'apply', 'close'])
const {t} = useI18n()

const internalDialog = ref(false)
const search = ref('')
const page = ref(1)
const itemsPerPage = ref(72)
const selectedIcon = ref('')
const icons = ref<MaterialIcon[]>([])
const iconsLoaded = ref(false)

const loadIcons = async () => {
  if (iconsLoaded.value) return

  const module = await import('@/assets/material-icons.json')
  icons.value = module.default as MaterialIcon[]
  iconsLoaded.value = true
}

const filteredIcons = computed(() => {
  if (!search.value) return icons.value

  const searchTerm = search.value.toLowerCase()
  return icons.value.filter(icon =>
    icon.name.toLowerCase().includes(searchTerm) ||
    (icon.tags && icon.tags.some(tag => tag.toLowerCase().includes(searchTerm)))
  )
})

const headerButtons = computed(() => [{
  icon: 'check',
  text: t('meta.fields.apply_icon'),
  color: 'primary',
  disabled: !selectedIcon.value,
  action: () => applyIcon(selectedIcon.value),
}])

const applyIcon = (iconName: string) => {
  selectedIcon.value = iconName
  emit('apply', iconName)
  closeDialog()
}

const closeDialog = () => {
  internalDialog.value = false
  emit('close')
}

const resetDialog = () => {
  search.value = ''
  page.value = 1
  selectedIcon.value = ''
}

onMounted(() => {
  internalDialog.value = props.modelValue
  if (props.modelValue) void loadIcons()
})

watch(() => props.modelValue, (newVal) => {
  internalDialog.value = newVal

  if (newVal) {
    resetDialog()
    selectedIcon.value = String(props.icon || '').replace(/^mdi-/, '')
    void loadIcons()
  }
})

watch(internalDialog, (newVal) => {
  emit('update:modelValue', newVal)
  emit('update:model-value', newVal)
  if (newVal) void loadIcons()
})

defineExpose({
  applyIcon,
  closeDialog
})
</script>

<style scoped>
.icon-picker__grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}

.icon-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 50px;
  height: 50px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s ease, transform 0.15s ease;
  background-color: transparent;
}

.icon-container:hover {
  background-color: rgba(var(--v-theme-primary), 0.1);
  transform: translateY(-1px);
}

.icon-selected {
  background-color: rgba(var(--v-theme-primary), 0.2);
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -1px;
}

.icon-selected:hover {
  background-color: rgba(var(--v-theme-primary), 0.3);
}
</style>
