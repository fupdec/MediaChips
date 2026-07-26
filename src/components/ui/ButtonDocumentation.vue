<script setup lang="ts">
import {useAppShell} from '@/composable/appShell'

const appShell = useAppShell()

const props = defineProps({
  id: String,
})

const showDocumentation = () => {
  appShell.showDocumentation(props.id || '')
}
</script>

<template>
  <v-btn
    @click="showDocumentation()"
    class="ml-4 mr-4"
    color="primary"
    variant="text"
    size="sm"
    icon
  >
    <v-icon>mdi-help-circle</v-icon>
  </v-btn>
</template>
