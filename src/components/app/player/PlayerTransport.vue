<template>
  <v-card-actions class="buttons pb-4 px-0 pt-0">
    <PlayerTransportPlayback/>
    <v-spacer/>
    <PlayerTransportMarks/>
    <PlayerTransportMedia/>
    <v-spacer/>
    <PlayerTransportView/>
  </v-card-actions>
</template>

<script setup lang="ts">
import PlayerTransportPlayback from '@/components/app/player/PlayerTransportPlayback.vue'
import PlayerTransportMarks from '@/components/app/player/PlayerTransportMarks.vue'
import PlayerTransportMedia from '@/components/app/player/PlayerTransportMedia.vue'
import PlayerTransportView from '@/components/app/player/PlayerTransportView.vue'
</script>
