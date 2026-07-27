<template>
  <div>
    <AppBarButton
      v-if="button"
      :action="editMeta"
      :text="t('appbar.buttons.edit_meta')"
      icon="wrench-cog"
    />

    <MetaManager
      v-if="meta"
      :edit-mode="true"
      :meta="meta"
      :dialog="dialogEditMeta"
      @updated="emitUpdate"
      @delete="deleteMeta"
      @close="dialogEditMeta = false"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, computed} from 'vue'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {reloadMetaCatalog} from '@/composable/metaCatalog'
import {useI18n} from 'vue-i18n'
import {useRouter} from 'vue-router'
import AppBarButton from '@/components/app/appbar/AppBarButton.vue'
import {defineAsyncComponent} from 'vue'
import type { Meta } from '@/types/stores'

defineProps({
  button: {type: Boolean, default: true},
})

const MetaManager = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogMetaManager.vue')
)

const store = useAppStore()
const itemsStore = useItemsStore()
const router = useRouter()
const {t} = useI18n()

const dialogEditMeta = ref(false)

// Computed properties
const meta = computed((): Meta | null => {
  const metaId = itemsStore.environment.meta_id
  if (!metaId) return null
  return store.meta.find((item) => item.id === metaId) ?? null
})

// Methods
const editMeta = () => {
  dialogEditMeta.value = true
}

const deleteMeta = async () => {
  dialogEditMeta.value = false
  await router.push('/')
}

const emitUpdate = () => {
  void reloadMetaCatalog()
}

defineExpose({editMeta})
</script>
