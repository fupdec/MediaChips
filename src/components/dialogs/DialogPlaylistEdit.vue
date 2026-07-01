<template>
  <div>
    <v-dialog
      v-if="dialog"
      v-model="dialogLocal"
      :fullscreen="smAndDown"
      scrollable
      width="1600"
    >
      <v-card>
        <DialogHeader
          @close="close"
          :header="t('playlists.editing_playlist')"
          :buttons="buttons"
          closable
        />

        <v-card-actions class="px-4 pt-6 flex-wrap">
          <v-form
            v-model="valid"
            ref="form"
            class="flex-grow-1"
            @submit.prevent
          >
            <v-text-field
              v-model="name"
              :rules="[nameRules]"
              :placeholder="t('playlists.playlist_name')"
              min-width="200"
              max-width="500"
              autofocus
              variant="filled"
            >
              <template #append>
                <v-btn
                  @click="apply"
                  :disabled="!valid"
                  icon="mdi-content-save"
                  :title="t('playlists.update_name')"
                ></v-btn>
              </template>
            </v-text-field>
          </v-form>

          <v-switch
            v-model="listView"
            :label="t('playlists.list_view')"
            inset
          ></v-switch>
        </v-card-actions>
        <v-card-text class="px-4 pt-2">
          <v-alert v-if="videos.length == 0"
            type="info"
            variant="text"> {{ t('playlists.no_videos_added') }}
          </v-alert>

          <draggable
            v-model="videos"
            v-bind="dragOptions"
            @start="drag=true"
            @end="reorderVideos"
            item-key="mediaId"
            :class="{'videos-grid': !listView, 'videos-list': listView}"
          >
            <template #item="{element, index}">
              <v-card rounded="lg"
                elevation="3"
                class="playlist-edit-item"
                style="overflow:visible;">
                <v-badge class="position"
                  color="primary"
                  :content="index + 1"/>

                <v-img
                  v-if="is_thumbs_loaded"
                  :src="element.thumb"
                  :aspect-ratio="16/9"
                  class="playlist-item-thumb"
                  cover
                ></v-img>

                <v-card-subtitle class="caption pa-2 pb-0"
                  :title="element.medium?.name">
                  {{ element.medium?.name }}
                </v-card-subtitle>

                <v-card-actions>
                  <v-btn @click="removeVideo(element)"
                    variant="text"
                    color="error"
                    size="small">
                    <v-icon start>mdi-close</v-icon>
                    {{ t('common.remove') }}
                  </v-btn>

                  <v-spacer></v-spacer>

                  <v-btn class="btn-draggable"
                    size="small"
                    icon>
                    <v-icon>mdi-drag</v-icon>
                  </v-btn>
                </v-card-actions>
              </v-card>
            </template>
          </draggable>
        </v-card-text>
      </v-card>
    </v-dialog>

    <DialogDeleteConfirm
      v-if="dialogDeletePlaylist"
      :dialog="dialogDeletePlaylist"
      @close="dialogDeletePlaylist = false"
      @delete="deletePlaylist"
      :text="t('playlists.delete_confirm')"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted} from 'vue';
import type {PropType} from 'vue'
import type {VFormInstance} from '@/types/vue'
import {useI18n} from 'vue-i18n'
import {useDisplay} from 'vuetify';
import {storeToRefs} from 'pinia';
import draggable from 'vuedraggable';
import {typedApi} from '@/services/typedApi';
import {resolveMediaThumbDisplayUrl} from '@/utils/thumbSource'
import {validateName} from '@/services/formatUtils';
import {setNotification} from '@/services/notificationService';
import {useAppStore} from '@/stores/app';
import DialogHeader from '@/components/elements/DialogHeader.vue';
import DialogDeleteConfirm from '@/components/dialogs/DialogDeleteConfirm.vue';
import sortBy from 'lodash/sortBy';
import {buildM3uPlaylist, downloadTextFile, playlistExportFilename} from '@/utils/playlistExport';
import type {Playlist} from '@/types/stores'
import type {PlaylistMediaLink} from '@shared/entities/playlist'

interface DialogHeaderButton {
  icon?: string
  text?: string
  color?: string
  variant?: string
  disabled?: boolean
  action?: () => void | Promise<void>
}

interface SaveFileResult {
  canceled?: boolean
  filePath?: string
}

const props = defineProps({
  dialog: Boolean,
  playlist: {
    type: Object as PropType<Playlist>,
    default: undefined,
  },
});

const emit = defineEmits(['close', 'updatePlaylist', 'delete']);

const {smAndDown} = useDisplay();
const appStore = useAppStore();
const {mediaPath} = storeToRefs(appStore);
const {t} = useI18n()

const listView = ref(false);
const dialogLocal = ref(props.dialog);
const dialogDeletePlaylist = ref(false);
const valid = ref(false);
const name = ref('');
const videos = ref<PlaylistMediaLink[]>([]);
const is_thumbs_loaded = ref(false);
const drag = ref(false);
const form = ref<VFormInstance>(null);

const buttons = computed((): DialogHeaderButton[] => [
  {
    icon: "file-export",
    text: t('playlists.export'),
    action: exportPlaylist,
    disabled: videos.value.length === 0,
  },
  {
    icon: "delete",
    text: t('common.delete'),
    color: "error",
    variant: "flat",
    action: () => {
      dialogDeletePlaylist.value = true;
    },
  },
]);

const dragOptions = {
  animation: 300,
  group: "description",
  disabled: false,
  ghostClass: "ghost"
};

// Следим за изменением props.dialog
watch(() => props.dialog, (newVal) => {
  dialogLocal.value = newVal;
  if (newVal && props.playlist) {
    initButtons();
    getVideos();
  }
});

// Следим за изменением dialogLocal и эмитим событие при закрытии
watch(dialogLocal, (newVal) => {
  if (!newVal) {
    close();
  }
});

const initButtons = () => {
  name.value = String(props.playlist?.name ?? '');
};

const nameRules = (value: string) => {
  return validateName(value)
};

const apply = async () => {
  if (!form.value || !props.playlist) return
  await form.value.validate();
  if (!valid.value) return;

  try {
    await typedApi.updatePlaylist(props.playlist.id, {
      name: name.value,
    });
    emit("updatePlaylist");
  } catch (e) {
    console.error(e);
  }
};

const close = () => {
  emit("close");
};

const deletePlaylist = () => {
  emit("delete");
  dialogDeletePlaylist.value = false;
};

const exportPlaylist = async () => {
  if (videos.value.length === 0) {
    setNotification({
      type: 'warning',
      title: t('playlists.export'),
      text: t('playlists.export_empty'),
    })
    return
  }

  const content = buildM3uPlaylist(
    videos.value as Parameters<typeof buildM3uPlaylist>[0],
    name.value || String(props.playlist?.name ?? ''),
  )
  const defaultPath = playlistExportFilename(name.value || props.playlist?.name)
  const filters = [{name: 'M3U Playlist', extensions: ['m3u8', 'm3u']}]

  try {
    if (window.electronAPI?.invoke) {
      const result = await window.electronAPI.invoke('dialog:saveFile', {
        defaultPath,
        content,
        filters,
      }) as SaveFileResult

      if (result?.canceled) return

      setNotification({
        type: 'success',
        title: t('playlists.export'),
        text: t('playlists.export_success', {path: result.filePath ?? ''}),
      })
      return
    }

    downloadTextFile(content, defaultPath)
    setNotification({
      type: 'success',
      title: t('playlists.export'),
      text: t('playlists.export_success', {path: defaultPath}),
    })
  } catch (error) {
    console.error(error)
    setNotification({
      type: 'error',
      title: t('playlists.export'),
      text: error instanceof Error ? error.message : String(error),
    })
  }
};

const getVideos = async () => {
  if (!props.playlist) return
  is_thumbs_loaded.value = false;
  try {
    const res = await typedApi.getMediaInPlaylist(props.playlist.id);

    videos.value = sortBy(res.data || [], "order");

    for (const video of videos.value) {
      video.thumb = resolveMediaThumbDisplayUrl(
        mediaPath.value,
        'videos',
        video.mediaId,
      ) ?? undefined
    }

    is_thumbs_loaded.value = true;
  } catch (error) {
    console.error(error);
  }
};

const removeVideo = async (video: PlaylistMediaLink) => {
  if (!props.playlist) return
  try {
    await typedApi.deleteMediaInPlaylists({
      mediaId: video.mediaId,
      playlistId: props.playlist.id,
    });
    await getVideos();
  } catch (error) {
    console.error(error);
  }
};

const reorderVideos = async () => {
  drag.value = false;

  const reorderedVideos = videos.value.map((video, index) => ({
    mediaId: video.mediaId,
    playlistId: video.playlistId,
    order: index,
  }));

  try {
    await typedApi.updateMediaInPlaylistsOrder(reorderedVideos);
    emit("updatePlaylist");
  } catch (error) {
    console.error(error);
  }
};

onMounted(() => {
  if (props.dialog && props.playlist) {
    initButtons();
    getVideos();
  }
});
</script>

<style lang="scss"
  scoped>
.videos-grid {
  display: grid;
  grid-gap: 15px 10px;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));

  .position {
    position: absolute;
    left: 4px;
    top: 2px;
    z-index: 1;
  }

  .playlist-item-thumb {
    border-radius: 10px 10px 0 0;
  }

  .v-card-actions {
    padding: 0 4px 0 8px;
  }
}

.videos-list {
  display: flex;
  flex-direction: column;
  .position {
    position: relative;
    height: 7px;
    left: 25px;
  }
  .v-img {
    min-width: 100px;
    max-width: 100px;
    border-radius: 5px;
    margin-left: 60px;
    margin-right: 20px;
  }
  .playlist-edit-item {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
    .v-card-subtitle {
      overflow: hidden !important;
      padding: 0 !important;
      max-width: calc(100% - 330px);
    }
  }
  .v-card-actions {
    border-radius: 5px;
    position: absolute;
    padding-right: 5px;
    right: 0;
    top: 0;
    bottom: 0;
    z-index: 1;
    backdrop-filter: blur(20px);
  }
}

.playlist-item-thumb {
  background: black;
}
</style>