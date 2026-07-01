<script setup lang="ts">
import {defineAsyncComponent} from 'vue'

const CountryFlag = defineAsyncComponent(() => import('vue-country-flag-next'))
</script>

<template>
  <CountryFlag v-bind="$attrs" />
</template>
