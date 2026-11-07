<template>
  <DialogOriginalOperations v-if="action.kind === 'originals'" v-model="visible" :media-ids="action.mediaIds" @changed="refresh" />
  <DialogRelinkMedia v-else-if="action.kind === 'relink' && action.media" v-model="visible" :media="action.media" @applied="refresh" />
  <DialogChangeHistory v-else-if="action.kind === 'history' && action.media" v-model="visible" entity-type="media" :entity-id="action.media.id">
    <template #activator />
  </DialogChangeHistory>
  <DialogMetadataTransfer v-else-if="action.kind === 'metadata'" v-model="visible" :media-ids="action.mediaIds" />
  <v-dialog v-else-if="action.kind === 'copies' && action.media" v-model="visible" max-width="960" scrollable>
    <v-card rounded="xl">
      <DialogHeader :header="t('copies.title')" icon="file-multiple-outline" closable @close="visible = false" />
      <v-card-text>
        <MediaCopies :media-id="action.media.id" initially-expanded>
          <template #source><MediaCatalogSourceInfo :media="action.media" /></template>
        </MediaCopies>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, defineAsyncComponent} from 'vue'
import {useI18n} from 'vue-i18n'
import {useDialogsStore} from '@/stores/dialogs'
import {useItemsListSync} from '@/composable/itemsListSync'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import MediaCopies from '@/components/items/MediaCopies.vue'
import MediaCatalogSourceInfo from '@/components/items/MediaCatalogSourceInfo.vue'

const DialogOriginalOperations = defineAsyncComponent(() => import('./DialogOriginalOperations.vue'))
const DialogRelinkMedia = defineAsyncComponent(() => import('./DialogRelinkMedia.vue'))
const DialogChangeHistory = defineAsyncComponent(() => import('./DialogChangeHistory.vue'))
const DialogMetadataTransfer = defineAsyncComponent(() => import('./DialogMetadataTransfer.vue'))
const dialogs = useDialogsStore()
const {t} = useI18n()
const sync = useItemsListSync()
const action = computed(() => dialogs.mediaCardAction)
const visible = computed({
  get: () => action.value.kind !== null,
  set: (value: boolean) => { if (!value) dialogs.mediaCardAction.kind = null },
})
function refresh() {
  sync.getItemsFromDb({ids: [...action.value.mediaIds], type: 'media'})
}
</script>
