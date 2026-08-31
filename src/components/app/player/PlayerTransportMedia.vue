<template>
  <v-btn-group v-if="video"
    variant="tonal"
    :density="density"
    rounded="xl"
    style="overflow: visible"
    dark
    class="btn-edit-video px-0">
    <v-btn v-if="!isAudioMode"
      @click="setAsThumb"
      class="action-buttons"
      icon
      dark>
      <v-icon>mdi-image-outline</v-icon>
      <div class="tip" v-html="t('player.controls.set_frame_as_thumb')"/>
    </v-btn>

    <v-btn
      v-if="canOpenTrim"
      @click="toggleTrimMode"
      :color="player.trimMode ? 'primary' : undefined"
      :disabled="player.trimBusy"
      icon
      dark
    >
      <v-icon>mdi-content-cut</v-icon>
      <div class="tip">
        <span class="mr-2">{{ t('player.controls.trim') }}</span>
        <v-hotkey keys="t"/>
      </div>
    </v-btn>

    <v-btn @click="editVideo" icon dark>
      <v-icon>mdi-square-edit-outline</v-icon>
      <div class="tip">
        <span class="mr-2">{{ t('player.edit_video') }}</span>
        <v-hotkey keys="e"/>
      </div>
    </v-btn>

    <v-btn @click="showInLibrary" icon dark>
      <v-icon>mdi-select-all</v-icon>
      <div class="tip">
        <span class="mr-2">{{ t('player.controls.show_in_library') }}</span>
      </div>
    </v-btn>

    <v-dialog
      v-if="dialog_video_edit && video_editing"
      v-model="dialog_video_edit"
      :attach="player.fullscreen ? '.player' : false"
      :fullscreen="xs"
      :width="xl ? 1800 : 1200"
      persistent
      no-click-animation
      scrollable
      hide-overlay
    >
      <v-card class="edit-dialog-card">
        <DialogHeader
          @close="dialog_video_edit = false"
          :header="t('player.editing')"
          :subheader="video_editing.name"
          :buttons="[
            {
              icon: 'content-save',
              text: t('common.save'),
              color: 'success',
              outlined: false,
              action: updateVideoInfo,
            },
          ]"
          icon="pencil"
          closable
        />

        <v-card-text :key="video_editing.id" class="edit-dialog-card__body">
          <EditPinnedMetaValues
            v-if="video_editing"
            @close="dialogsStore.mediaEditing.show = false"
            :media="video_editing"
            ref="editingComponent"
          />
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-menu
      attach=".btn-edit-video"
      location="top"
      :offset="8"
      width="180"
    >
      <template #activator="{ props: menuProps }">
        <v-btn v-bind="menuProps"
          style="border-top-right-radius: 24px; border-bottom-right-radius: 24px;"
          icon
          dark
        >
          <v-icon>mdi-delete-outline</v-icon>
          <div class="tip">
            <span class="mr-2" v-html="t('player.controls.delete_video')"/>
            <v-hotkey keys="alt+del"/>
          </div>
        </v-btn>
      </template>

      <v-list density="compact" class="py-1">
        <v-list-item @click="deleteVideo(true)">
          <v-list-item-title>
            <v-icon class="mr-4" icon="mdi-delete-alert" color="error"/>
            <span>{{ t('actions.delete_with_file') }}</span>
          </v-list-item-title>
        </v-list-item>

        <v-list-item @click="deleteVideo(false)">
          <v-list-item-title>
            <v-icon class="mr-4" icon="mdi-delete" color="error"/>
            <span>{{ t('common.delete') }}</span>
          </v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>
  </v-btn-group>
</template>

<script setup lang="ts">
import {inject} from 'vue'
import {useI18n} from 'vue-i18n'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import EditPinnedMetaValues from '@/components/items/EditPinnedMetaValues.vue'
import {PLAYER_TRANSPORT_KEY} from '@/composable/playerTransportKey'

const {t} = useI18n()
const {
  player,
  dialogsStore,
  editingComponent,
  video_editing,
  dialog_video_edit,
  video,
  isAudioMode,
  density,
  xs,
  xl,
  setAsThumb,
  editVideo,
  showInLibrary,
  updateVideoInfo,
  deleteVideo,
  canOpenTrim,
  toggleTrimMode,
} = inject(PLAYER_TRANSPORT_KEY)!
</script>
