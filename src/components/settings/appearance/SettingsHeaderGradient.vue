<template>
  <div>
    <!-- Main Dialog for Gradient Editor -->
    <v-dialog v-model="dialogHeaderGradient" width="420" scrollable persistent>
      <v-card rounded="xl" class="pa-0">

        <!-- Gradient preview strip (full-width) -->
        <div
          class="gradient-preview-strip"
          :style="{ background: gradient }"
          :class="themeDark ? 'theme-dark' : 'theme-light'"
        >
          <span class="gradient-preview-label">
            {{ t('settings_labels.appearance.gradient_for_theme', {theme: themeDark ? t('settings_labels.appearance.dark_theme').toLowerCase() : t('settings_labels.appearance.light_theme').toLowerCase()}) }}
          </span>
        </div>

        <!-- Color list -->
        <div class="gradient-color-wrap">
          <draggable
            v-model="colors"
            v-bind="dragOptions"
            item-key="id"
            tag="div"
          >
            <template #item="{ element: color, index }">
              <div class="gradient-color-row">
                <div
                  class="color-swatch"
                  :style="{ background: color.hex }"
                  @click="openDialogPalette(index)"
                />

                <span class="color-hex text-caption text-medium-emphasis ml-3">
                  {{ color.hex }}
                </span>

                <v-spacer/>

                <v-btn
                  @click="lockColor(index)"
                  size="x-small"
                  icon
                  :color="color.disabled ? 'warning' : undefined"
                  variant="text"
                  class="lock-btn"
                >
                  <v-icon v-if="color.disabled" size="16">mdi-lock</v-icon>
                  <v-icon v-else size="16">mdi-lock-open-variant</v-icon>
                </v-btn>

                <v-icon size="16" class="drag-handle ml-1" color="text-disabled">mdi-drag-horizontal-variant</v-icon>
              </div>
            </template>
          </draggable>
        </div>

        <!-- Gradient tools -->
        <div class="d-flex align-center ga-2 pa-3 pt-1">
          <v-btn
            @click="addColor"
            icon
            size="small"
            variant="tonal"
            color="primary"
            rounded="xl"
          >
            <v-icon>mdi-plus</v-icon>
          </v-btn>

          <v-btn
            @click="generateGradient"
            variant="tonal"
            rounded="xl"
            size="small"
            color="primary"
          >
            <v-icon start size="small">mdi-dice-5</v-icon>
            {{ t('settings_labels.appearance.launch_randomizer') }}
          </v-btn>
        </div>

        <v-divider class="gradient-divider"/>

        <!-- Bottom actions -->
        <div class="d-flex ga-2 pa-4">
          <v-btn
            @click="apply"
            rounded="xl"
            color="primary"
            variant="flat"
            class="flex-1"
          >
            <v-icon start>mdi-check</v-icon>
            {{ t('common.apply') }}
          </v-btn>
          <v-btn
            @click="close"
            variant="outlined"
            rounded="xl"
          >
            {{ t('common.cancel') }}
          </v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- Color Picker Dialog -->
    <v-dialog v-model="dialogPalette" width="360">
      <v-card rounded="xl" class="pa-0">
        <div class="palette-dialog-picker-wrap">
          <v-color-picker
            v-model="palette"
            @update:model-value="changeColor"
            mode="hex"
            hide-mode-switch
            elevation="0"
            class="palette-dialog-picker"
          />
        </div>
        <v-divider class="palette-divider"/>
        <div class="d-flex ga-2 pa-4">
          <v-btn
            @click="applyColor"
            rounded="xl"
            color="primary"
            variant="flat"
            class="flex-1"
          >
            <v-icon start>mdi-check</v-icon>
            {{ t('common.apply') }}
          </v-btn>
          <v-btn
            @click="dialogPalette = false"
            variant="outlined"
            rounded="xl"
          >
            {{ t('common.cancel') }}
          </v-btn>
        </div>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, nextTick, type PropType} from 'vue'
import {useI18n} from 'vue-i18n'
import draggable from 'vuedraggable'
import {useSettingsStore} from '@/stores/settings'

interface GradientColor {
  id: number
  hex: string
  disabled: boolean
}

const props = defineProps({
  themeDark: {
    type: Boolean as PropType<boolean>,
    required: true,
  },
})

const {t} = useI18n()

const emit = defineEmits<{
  close: []
  save: [values: { gradient: string; themeDark: boolean }]
}>()

const settingsStore = useSettingsStore()

const dialogHeaderGradient = ref(false)
const dialogPalette = ref(false)
const colors = ref<GradientColor[]>([])
const palette = ref('#435121')
const colorIndex = ref(0)

// Draggable options
const dragOptions = {
  animation: 200,
  disabled: false,
  ghostClass: 'ghost',
}

// Computed
const gradient = computed(() => {
  const colorValues = colors.value.map(c => c.hex).join(', ')
  return `linear-gradient(to right, ${colorValues})`
})

const savedGradient = computed(() => {
  return props.themeDark
    ? settingsStore.headerGradientDark
    : settingsStore.headerGradientLight
})

// Methods
const initColors = () => {
  colors.value = []

  if (!savedGradient.value) {
    // Default gradient if none saved
    const defaultColors = props.themeDark
      ? ['#1a237e', '#311b92', '#4a148c']
      : ['#bbdefb', '#90caf9', '#64b5f6']

    defaultColors.forEach((color, index) => {
      colors.value.push({
        id: Date.now() + index,
        hex: color,
        disabled: false
      })
    })
    return
  }

  // Parse saved gradient
  try {
    const gradientStr = savedGradient.value
      .replace('linear-gradient(to right,', '')
      .replace(')', '')
      .trim()

    const colorArray = gradientStr.split(',').map(c => c.trim())

    colorArray.forEach((color, index) => {
      colors.value.push({
        id: Date.now() + index,
        hex: color,
        disabled: false
      })
    })
  } catch (error) {
    console.error('Error parsing gradient:', error)
    // Fallback to default
    initColors()
  }
}

const openDialogPalette = (index: number) => {
  dialogPalette.value = true
  colorIndex.value = index
  palette.value = colors.value[index].hex
}

const changeColor = (color: string | { hex?: string }) => {
  // color может быть объектом или строкой в зависимости от color-picker
  if (typeof color === 'object' && color.hex) {
    palette.value = color.hex
  } else if (typeof color === 'string') {
    palette.value = color
  }
}

const applyColor = () => {
  colors.value[colorIndex.value].hex = palette.value
  dialogPalette.value = false
}

const addColor = () => {
  colors.value.push({
    id: Date.now() + colors.value.length,
    hex: randomHex(),
    disabled: false
  })
}

const removeColor = () => {
  if (colors.value.length > 2) {
    const lastColor = colors.value[colors.value.length - 1]
    if (!lastColor.disabled) {
      colors.value.pop()
    }
  }
}

const generateGradient = () => {
  colors.value.forEach((color, index) => {
    if (!color.disabled) {
      colors.value[index].hex = randomHex()
    }
  })
}

const lockColor = (index: number) => {
  colors.value[index].disabled = !colors.value[index].disabled
}

const randomHex = () => {
  const letters = '0123456789ABCDEF'
  let color = '#'
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)]
  }
  return color
}

const close = () => {
  emit('close')
}

const apply = () => {
  const values = {
    gradient: gradient.value,
    themeDark: props.themeDark
  }
  emit('save', values)
  close()
}

// Lifecycle
onMounted(() => {
  nextTick(() => {
    dialogHeaderGradient.value = true
    initColors()
  })
})
</script>

<style scoped lang="scss">
.gradient-preview-strip {
  height: 56px;
  border-radius: 12px 12px 0 0;
  display: flex;
  align-items: center;
  padding: 0 20px;

  &.theme-light {
    color: rgba(255, 255, 255, 0.9);
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  }

  &.theme-dark {
    color: rgba(255, 255, 255, 0.95);
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
  }
}

.gradient-preview-label {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.gradient-color-wrap {
  margin: 8px 12px;
  border: 1px solid rgba(var(--v-theme-primary), 0.1);
  border-radius: 14px;
  background: rgba(var(--v-theme-on-surface), 0.02);
  overflow: hidden;
}

.gradient-color-row {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 0;
  cursor: default;

  &:not(:last-child) {
    border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  }

  &:hover {
    background: rgba(var(--v-theme-primary), 0.04);
  }
}

.color-swatch {
  width: 32px;
  height: 32px;
  min-width: 32px;
  border-radius: 8px;
  cursor: pointer;
  border: 2px solid rgba(var(--v-theme-on-surface), 0.08);
  transition: transform 0.15s ease;

  &:hover {
    transform: scale(1.1);
  }
}

.color-hex {
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  user-select: none;
}

.lock-btn {
  opacity: 0.5;

  &:hover {
    opacity: 1;
  }
}

.drag-handle {
  cursor: grab;
  opacity: 0.4;

  &:hover {
    opacity: 0.8;
  }
}

.gradient-divider {
  opacity: 0.35;
}

.palette-dialog-picker-wrap {
  margin: 12px;
  padding: 4px;
  border: 1px solid rgba(var(--v-theme-primary), 0.16);
  border-radius: 18px;
  background: rgb(var(--v-theme-surface));
  box-shadow:
    0 1px 0 rgba(var(--v-theme-primary), 0.04),
    0 8px 22px -16px rgba(0, 0, 0, 0.22);
}

.palette-dialog-picker {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  padding: 0;

  :deep(.v-color-picker) {
    border: none;
    border-radius: 0;
    box-shadow: none;
  }

  :deep(.v-color-picker__canvas) {
    border-radius: 12px;
    max-width: 280px;
    width: 100%;
    margin: 12px auto 8px;
    overflow: hidden;
  }

  :deep(.v-color-picker__controls) {
    max-width: 280px;
    margin: 0 auto;
    padding: 4px 12px 8px;
  }

  :deep(.v-color-picker__preview) {
    display: flex;
    justify-content: center;
    margin-bottom: 4px;
  }

  :deep(.v-color-picker__input) {
    max-width: 280px;
    margin: 0 auto;
  }
}

.palette-divider {
  margin: 0 16px;
  opacity: 0.55;
}
</style>