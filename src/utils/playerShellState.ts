import { ref } from 'vue'

/** Lightweight shell flag so AppPreloader does not import the full player store at startup. */
export const isPlayerUiActive = ref(false)
