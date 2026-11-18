<template>
  <div v-if="video && player.isLibraryMedia" class="file-actions btn-edit-video ml-1">
    <v-menu
      v-model="menuOpen"
      attach=".file-actions"
      location="top"
      :offset="8"
      min-width="280"
      content-class="player-menu-card"
    >
      <template #activator="{ props: menuProps }">
        <v-btn v-bind="menuProps"
          :color="player.trimMode ? 'primary' : undefined"
          :density="density"
          variant="tonal"
          icon
          dark
        >
          <v-icon>mdi-dots-horizontal</v-icon>
          <div class="tip" :class="{'tip--suppressed': menuOpen}">{{ t('player.file_actions') }}</div>
        </v-btn>
      </template>

      <v-list density="compact" class="player-menu__list">
        <v-list-item
          v-if="!isAudioMode"
          @click="setAsThumb"
          :disabled="!canCaptureFrame"
          :subtitle="canCaptureFrame ? undefined : t('player.thumb_unavailable')"
          :title="t('player.controls.set_frame_as_thumb')"
          prepend-icon="mdi-image-outline"
        />

        <v-list-item
          v-if="canOpenSourcePage"
          @click="openWebVideoPage"
          :title="t('media.adding.web_video_open')"
          prepend-icon="mdi-open-in-new"
        />

        <v-tooltip
          v-if="!isAudioMode && !player.trimBusy"
          :disabled="canOpenTrim"
          :text="t(isWebVideo ? 'player.trim_unavailable_stream' : 'player.trim_unavailable')"
          attach=".file-actions"
          location="start"
        >
          <template #activator="{ props: tipProps }">
            <v-list-item
              v-bind="tipProps"
              @click="canOpenTrim && toggleTrimMode()"
              :active="player.trimMode"
              :class="{'is-disabled': !canOpenTrim}"
              :aria-disabled="!canOpenTrim"
              :title="t('player.controls.trim')"
              prepend-icon="mdi-content-cut"
            >
              <template v-if="canOpenTrim" #append><v-hotkey keys="t"/></template>
            </v-list-item>
          </template>
        </v-tooltip>

        <v-list-item
          @click="toggleStudioMode"
          :active="player.studioMode"
          :title="t(player.studioMode ? 'player.studio_mode_on' : 'player.studio_mode')"
          prepend-icon="mdi-movie-open-edit-outline"
        >
          <template #append><v-hotkey keys="shift+m"/></template>
        </v-list-item>

        <v-list-item
          @click="editVideo"
          :title="t('player.edit_video')"
          prepend-icon="mdi-square-edit-outline"
        >
          <template #append><v-hotkey keys="e"/></template>
        </v-list-item>

        <v-list-item
          @click="showInLibrary"
          :title="t('player.controls.show_in_library')"
          prepend-icon="mdi-select-all"
        />

        <v-divider class="player-menu__divider"/>

        <v-list-item @click="deleteVideo(false)" :title="t('common.delete')">
          <template #prepend><v-icon icon="mdi-delete" color="error"/></template>
          <template #append><v-hotkey keys="alt+del"/></template>
        </v-list-item>

        <v-list-item v-if="!isWebVideo" @click="deleteVideo(true)" :title="t('actions.delete_with_file')">
          <template #prepend><v-icon icon="mdi-delete-alert" color="error"/></template>
        </v-list-item>
      </v-list>
    </v-menu>

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
  </div>
</template>

<script setup lang="ts">
import {inject, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import EditPinnedMetaValues from '@/components/items/EditPinnedMetaValues.vue'
import {PLAYER_TRANSPORT_KEY} from '@/composable/playerTransportKey'

const {t} = useI18n()
const menuOpen = ref(false)
const {
  player,
  dialogsStore,
  editingComponent,
  video_editing,
  dialog_video_edit,
  video,
  isAudioMode,
  isWebVideo,
  canCaptureFrame,
  openWebVideoPage,
  canOpenSourcePage,
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
  toggleStudioMode,
} = inject(PLAYER_TRANSPORT_KEY)!
</script>
