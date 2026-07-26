<template>
  <v-dialog
    v-if="dialog"
    v-model="dialogLocal"
    :fullscreen="smAndDown"
    scrollable
    width="600"
  >
    <v-card>
      <DialogHeader
        @close="close"
        :header="t('playlists.new_playlist')"
        :buttons="buttons"
        closable
      />

      <v-form
        v-model="valid"
        ref="form"
        @submit.prevent
      >
        <v-card-text class="pa-4">
          <v-text-field
            v-model="name"
            :rules="[nameRules]"
            :placeholder="t('playlists.playlist_name')"
            variant="filled"
            autofocus
          ></v-text-field>
        </v-card-text>
      </v-form>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {ref, computed, watch} from 'vue';
import type {PropType} from 'vue';
import type {VFormInstance} from '@/types/vue';
import {useI18n} from 'vue-i18n';
import {useDisplay} from 'vuetify';
import {typedApi} from '@/services/typedApi';
import {validateName} from '@/services/formatUtils';
import {setNotification} from '@/services/notificationService';
import DialogHeader from '@/components/elements/DialogHeader.vue';
import {useItemsStore} from '@/stores/items';
import {reloadPlaylistsCatalog} from '@/composable/appCatalogs';

const props = defineProps({
  dialog: Boolean,
  mediaIds: {
    type: Array as PropType<number[]>,
    default: () => [],
  },
});

const emit = defineEmits(['close', 'add']);

const {smAndDown} = useDisplay()
const itemsStore = useItemsStore()
const {t} = useI18n()

const dialogLocal = ref(props.dialog);
const name = ref('');
const valid = ref(false);
const form = ref<VFormInstance>(null);

const buttons = computed(() => [{
  icon: "plus",
  text: t('common.add'),
  color: "success",
  variant: "flat",
  action: () => {
    addPlaylist();
  },
}]);

// Следим за изменением props.dialog и синхронизируем с локальной переменной
watch(() => props.dialog, (newVal) => {
  dialogLocal.value = newVal;
  if (newVal) name.value = '';
});

// Следим за изменением dialogLocal и эмитим событие при закрытии
watch(dialogLocal, (newVal) => {
  if (!newVal) {
    close();
  }
});

const addPlaylist = async () => {
  await form.value?.validate();
  if (!valid.value) return;

  try {
    const res = await typedApi.createPlaylist({
      name: name.value,
    });

    const playlistName = name.value
    const playlistId = res.data?.id

    if (playlistId && props.mediaIds.length > 0) {
      for (const mediaId of props.mediaIds) {
        await typedApi.addMediaToPlaylist({
          mediaId,
          playlistId,
        })
      }
      itemsStore.isSelect = false
    }

    name.value = '';
    void reloadPlaylistsCatalog()

    if (props.mediaIds.length > 0) {
      setNotification({
        type: 'success',
        title: t('playlists.create_playlist'),
        text: t('playlists.created_and_added', {
          name: res.data?.name || playlistName,
          count: props.mediaIds.length,
        }),
      })
    }

    emit("add", playlistId);
  } catch (e) {
    console.log(e);
  }
};

const nameRules = (value: string) => {
  return validateName(value)
};

const close = () => {
  emit("close");
};
</script>