<template>
  <v-dialog
    v-model="markAdding.show"
    :attach="playerStore.fullscreen ? '#player' : false"
    content-class="dialog-overflow-visible dialog-position-start mark-adding-dialog"
    hide-overlay
    width="520"
    persistent
    no-click-animation
    :scrim="false"
  >
    <MarkAddingForm compact @addMark="(data) => emit('addMark', data)"/>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {usePlayerStore} from '@/stores/player'
import {useDialogsStore} from '@/stores/dialogs'
import MarkAddingForm from '@/components/dialogs/MarkAddingForm.vue'

const emit = defineEmits(['addMark'])

const playerStore = usePlayerStore()
const dialogsStore = useDialogsStore()

const markAdding = computed(() => dialogsStore.markAdding)
</script>
