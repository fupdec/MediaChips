<script setup lang="ts">
import {useAppShell} from '@/composable/appShell'

const appShell = useAppShell()

const props = withDefaults(defineProps<{
  id?: string
  dense?: boolean
}>(), {
  id: '',
  dense: false,
})

const showDocumentation = () => {
  appShell.showDocumentation(props.id || '')
}
</script>

<template>
  <v-btn
    @click.stop="showDocumentation()"
    :class="dense ? 'button-documentation--dense' : 'ml-4 mr-4'"
    color="primary"
    variant="text"
    :size="dense ? 'x-small' : 'small'"
    icon
    :aria-label="'Documentation'"
  >
    <v-icon :size="dense ? 18 : undefined">mdi-help-circle</v-icon>
  </v-btn>
</template>

<style scoped>
.button-documentation--dense {
  margin-inline: 0;
  opacity: 0.72;
}

.button-documentation--dense:hover,
.button-documentation--dense:focus-visible {
  opacity: 1;
}
</style>
