<template>
  <v-dialog
    v-model="tasksStore.mediaAdding.dialogProcess"
    :fullscreen="xs"
    scrollable
    width="800"
    persistent
  >
    <v-card rounded="xl">
      <DialogHeader
        @close="closeProcessDialog"
        :header="t('media.adding.files')"
        :buttons="buttons"
        closable
      />

      <v-card-actions class="pa-4">
        <v-progress-linear
          v-model="task.progress"
          :striped="task.active && !task.stopped"
          height="20"
          color="primary"
          rounded
        >
          <template v-slot:default="{ value }">
            <strong class="process-percents">{{ Math.ceil(value) }} %</strong>
          </template>
        </v-progress-linear>
      </v-card-actions>

      <div class="d-flex justify-space-between px-4">
        <div>{{ task.status }}</div>
        <v-card class="text-medium-emphasis text-caption" variant="flat">
          <v-progress-linear v-if="task.active && !task.stopped" height="3" indeterminate reverse/>
          {{ task.processed }}
        </v-card>
      </div>

      <v-card-text class="pa-4 process-dialog-body">
        <!-- Process added files -->
        <section
          v-if="task.added.length > 0 && canMakeLibrarySmart"
          class="process-dialog-section"
        >
          <v-card
            variant="tonal"
            color="primary"
            class="smart-wizard-section pa-3"
          >
            <div class="smart-wizard-section__title text-body-2 font-weight-medium mb-1">
              {{ t('media.adding.make_library_smart') }}
            </div>
            <div class="text-caption text-medium-emphasis mb-3 smart-wizard-section__hint">
              {{ smartEnhanceHint }}
            </div>

            <v-btn
              class="mb-1"
              @click="runSafeEnhance"
              :loading="smartWizardRunning"
              :disabled="!canMakeLibrarySmart || smartWizardRunning"
              color="primary"
              rounded
              variant="flat"
              size="small"
            >
              <v-icon icon="mdi-flash" start size="18"/>
              {{ t('media.adding.make_library_smart_safe') }}
            </v-btn>
            <div class="text-caption text-medium-emphasis mb-2 smart-wizard-section__hint">
              {{ smartEnhanceSafeHint }}
            </div>

            <div
              v-if="smartWizardSummaryLines.length"
              class="text-caption mb-2 smart-wizard-summary"
            >
              <div
                v-for="(line, index) in smartWizardSummaryLines"
                :key="`smart-summary-${index}`"
              >
                {{ line }}
              </div>
              <div
                v-if="smartWizardSummary?.clipIndexed"
                class="mt-2"
              >
                <div class="text-caption text-medium-emphasis mb-1">
                  {{ t('media.adding.make_library_smart_find_scene_tip') }}
                </div>
                <v-btn
                  @click="openFindSceneFromEnhance"
                  color="primary"
                  rounded
                  variant="tonal"
                  size="small"
                >
                  <v-icon icon="mdi-movie-search-outline" start size="18"/>
                  {{ t('media.adding.make_library_smart_find_scene_cta') }}
                </v-btn>
              </div>
            </div>
            <div
              v-else-if="pathAutoTagSummary"
              class="text-caption mb-2"
            >
              {{ pathAutoTagSummary }}
            </div>

            <div v-if="smartWizardRunning || smartWizardProgress > 0" class="mb-2">
              <v-progress-linear
                v-model="smartWizardProgress"
                color="primary"
                height="14"
                rounded
                :striped="smartWizardRunning"
              >
                <template #default="{ value }">
                  <strong class="process-percents">{{ Math.ceil(value) }} %</strong>
                </template>
              </v-progress-linear>
              <div class="text-caption text-medium-emphasis mt-1">
                {{ smartWizardStatus }}
              </div>
            </div>

            <v-expansion-panels
              v-model="smartAdvancedOpen"
              variant="accordion"
              class="smart-wizard-advanced"
            >
              <v-expansion-panel>
                <v-expansion-panel-title class="text-caption px-2">
                  {{ t('media.adding.make_library_smart_advanced') }}
                </v-expansion-panel-title>
                <v-expansion-panel-text class="px-0">
                  <div class="text-caption text-medium-emphasis text-uppercase mb-0 smart-wizard-section__group">
                    {{ t('media.adding.make_library_smart_group_tags') }}
                  </div>
                  <div class="smart-wizard-option">
                    <v-checkbox
                      v-model="smartWizard.pathTags"
                      density="compact"
                      hide-details
                      color="primary"
                      :disabled="smartWizardRunning"
                      :label="t('media.adding.make_library_smart_path_tags')"
                    />
                    <ButtonDocumentation id="media.parser" dense/>
                  </div>
                  <div class="smart-wizard-option">
                    <v-checkbox
                      v-model="smartWizard.neighborTags"
                      density="compact"
                      hide-details
                      color="primary"
                      :disabled="smartWizardRunning || !isAddedVideo"
                      :label="t('media.adding.make_library_smart_neighbor_tags')"
                    />
                    <ButtonDocumentation id="media.adding.neighbor_tags" dense/>
                  </div>

                  <div class="text-caption text-medium-emphasis text-uppercase mt-2 mb-0 smart-wizard-section__group">
                    {{ t('media.adding.make_library_smart_group_enrich') }}
                  </div>
                  <div class="smart-wizard-option">
                    <v-checkbox
                      v-model="smartWizard.grids"
                      density="compact"
                      hide-details
                      color="primary"
                      :disabled="smartWizardRunning || !isAddedVideo"
                      :label="t('media.adding.make_library_smart_grids')"
                    />
                    <ButtonDocumentation id="settings.files.generated_previews" dense/>
                  </div>
                  <div class="text-caption text-medium-emphasis smart-wizard-nested__hint">
                    {{ t('media.adding.make_library_smart_grids_hint') }}
                  </div>
                  <div class="smart-wizard-option">
                    <v-checkbox
                      v-model="smartWizard.faces"
                      density="compact"
                      hide-details
                      color="primary"
                      :disabled="smartWizardRunning || !isAddedVideo"
                      :label="t('media.adding.make_library_smart_faces')"
                    />
                    <ButtonDocumentation id="media.face_recognition" dense/>
                  </div>
                  <div
                    v-if="smartWizard.faces"
                    class="smart-wizard-nested"
                  >
                    <div class="smart-wizard-option">
                      <v-checkbox
                        v-model="smartWizard.blindFaceTags"
                        density="compact"
                        hide-details
                        color="primary"
                        :disabled="smartWizardRunning || !isAddedVideo || !hasFacePeopleCategory"
                        :label="t('media.adding.make_library_smart_blind_faces')"
                      />
                      <ButtonDocumentation id="media.adding.blind_faces" dense/>
                    </div>
                    <div class="text-caption text-medium-emphasis smart-wizard-nested__hint">
                      {{
                        hasFacePeopleCategory
                          ? t('media.adding.make_library_smart_blind_faces_hint')
                          : t('media.adding.make_library_smart_blind_faces_need_category')
                      }}
                    </div>
                  </div>
                  <div class="smart-wizard-option">
                    <v-checkbox
                      v-model="smartWizard.clip"
                      density="compact"
                      hide-details
                      color="primary"
                      :disabled="smartWizardRunning || !isAddedVideo"
                      :label="t('media.adding.make_library_smart_clip')"
                    />
                    <ButtonDocumentation id="media.adding.visual_search" dense/>
                  </div>
                  <div class="smart-wizard-option">
                    <v-checkbox
                      v-model="smartWizard.chapters"
                      density="compact"
                      hide-details
                      color="primary"
                      :disabled="smartWizardRunning || !isAddedVideo"
                      :label="t('media.adding.make_library_smart_chapters')"
                    />
                    <ButtonDocumentation id="media.adding.chapters" dense/>
                  </div>

                  <div class="text-caption text-medium-emphasis text-uppercase mt-2 mb-0 smart-wizard-section__group">
                    {{ t('media.adding.make_library_smart_group_more') }}
                  </div>
                  <div class="smart-wizard-option">
                    <v-checkbox
                      v-model="smartWizard.organize"
                      density="compact"
                      hide-details
                      color="primary"
                      :disabled="smartWizardRunning"
                      :label="t('media.adding.make_library_smart_organize')"
                    />
                    <ButtonDocumentation id="media.adding.organize" dense/>
                  </div>
                  <div
                    v-if="sceneScrapeAvailable"
                    class="smart-wizard-option"
                  >
                    <v-checkbox
                      v-model="smartWizard.scrape"
                      density="compact"
                      hide-details
                      color="primary"
                      :disabled="smartWizardRunning || !isAddedVideo"
                      :label="t('media.adding.make_library_smart_scrape')"
                    />
                    <ButtonDocumentation id="data_scraper" dense/>
                  </div>

                  <div
                    v-if="smartWizard.faces && faceModelNeedsDownload"
                    class="text-caption text-medium-emphasis mt-2"
                  >
                    {{ t('media.adding.download_face_model_hint') }}
                  </div>
                  <div
                    v-if="smartWizard.clip && clipModelNeedsDownload"
                    class="text-caption text-medium-emphasis mt-2"
                  >
                    {{ t('media.adding.download_video_recognition_model_hint') }}
                  </div>

                  <div class="d-flex flex-wrap ga-2 mt-2">
                    <v-btn
                      v-if="smartWizard.faces && faceModelNeedsDownload"
                      @click="downloadFaceModel"
                      :loading="faceModelDownloading"
                      :disabled="faceModelDownloading || smartWizardRunning"
                      color="secondary"
                      rounded
                      variant="outlined"
                      size="small"
                    >
                      <v-icon icon="mdi-download" start/>
                      {{ t('media.adding.download_face_model') }}
                    </v-btn>
                    <v-btn
                      v-if="smartWizard.clip && clipModelNeedsDownload"
                      @click="downloadClipModel"
                      :loading="clipModelDownloading"
                      :disabled="clipModelDownloading || smartWizardRunning"
                      color="secondary"
                      rounded
                      variant="outlined"
                      size="small"
                    >
                      <v-icon icon="mdi-download" start/>
                      {{ t('media.adding.download_video_recognition_model') }}
                    </v-btn>
                    <v-btn
                      @click="runSmartLibraryWizard"
                      :loading="smartWizardRunning"
                      :disabled="!canRunSmartWizard || smartWizardRunning"
                      color="primary"
                      rounded
                      variant="tonal"
                      size="small"
                    >
                      <v-icon icon="mdi-playlist-check" start/>
                      {{ t('media.adding.make_library_smart_run') }}
                    </v-btn>
                    <v-btn
                      @click="runEverythingPossible"
                      :loading="smartWizardRunning"
                      :disabled="!canMakeLibrarySmart || smartWizardRunning"
                      color="primary"
                      rounded
                      variant="text"
                      size="small"
                    >
                      <v-icon icon="mdi-auto-fix" start size="18"/>
                      {{ t('media.adding.make_library_smart_magic') }}
                    </v-btn>
                  </div>
                  <div class="text-caption text-medium-emphasis mt-1">
                    {{ t('media.adding.make_library_smart_magic_hint') }}
                  </div>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </v-card>
        </section>

        <!-- Suggested tags -->
        <section
          v-if="task.added.length > 0 && task.finished && pendingReviewTagCount"
          class="process-dialog-section process-dialog-section--panel process-dialog-section--review"
        >
          <div class="text-body-2 font-weight-medium mb-1">
            {{ t('media.adding.suggested_tags_actions') }}
          </div>
          <div class="text-caption text-medium-emphasis mb-2">
            {{ t('media.adding.make_library_smart_review_cta') }}
          </div>
          <div class="d-flex flex-wrap ga-2">
            <v-btn
              v-if="pendingReviewTagCount"
              @click="acceptAllSuggestedTags"
              :loading="acceptingSuggestedTags"
              :disabled="acceptingSuggestedTags"
              color="primary"
              rounded
              variant="flat"
              size="large"
            >
              <v-icon icon="mdi-tag-check-outline" start/>
              {{ t('media.adding.accept_all_suggested_tags_count', {
                count: pendingReviewTagCount,
              }) }}
            </v-btn>

            <v-btn
              v-if="pathReviewTagNames.length"
              @click="openSuggestedTags"
              color="primary"
              rounded
              variant="outlined"
            >
              <v-icon icon="mdi-tag-plus-outline" start/>
              {{ t('media.adding.review_suggested_tags_count', {
                count: pathReviewTagNames.length,
              }) }}
            </v-btn>
          </div>
        </section>

        <!-- Other actions -->
        <section
          v-if="task.added.length > 0 && task.finished && (canReparseTags || canDetectFaces)"
          class="process-dialog-section process-dialog-section--panel"
        >
          <div class="text-caption text-medium-emphasis text-uppercase mb-2">
            {{ t('media.adding.ai_actions') }}
          </div>
          <div class="d-flex flex-wrap ga-2 align-center">
            <v-btn
              v-if="canReparseTags"
              @click="reparseTags"
              :loading="task.parsingTags"
              :disabled="task.parsingTags"
              color="primary"
              rounded
              variant="outlined"
            >
              <v-icon icon="mdi-text-box-search-outline" start/>
              {{ t('media.adding.reparse_tags') }}
            </v-btn>
            <ButtonDocumentation
              v-if="canReparseTags"
              id="media.parser"
              dense
            />

            <v-btn
              v-if="canDetectFaces && faceModelNeedsDownload"
              @click="downloadFaceModel"
              :loading="faceModelDownloading"
              :disabled="faceModelDownloading || task.detectingFaces"
              color="secondary"
              rounded
              variant="outlined"
            >
              <v-icon icon="mdi-download" start/>
              {{ t('media.adding.download_face_model') }}
            </v-btn>

            <v-btn
              v-if="canDetectFaces && faceModelReady"
              @click="detectFacesInAddedVideos"
              :loading="task.detectingFaces"
              :disabled="task.detectingFaces"
              color="secondary"
              rounded
              variant="flat"
            >
              <v-icon icon="mdi-face-recognition" start/>
              {{ t('media.adding.detect_faces') }}
            </v-btn>
          </div>

          <div
            v-if="canDetectFaces && faceModelNeedsDownload"
            class="text-caption text-medium-emphasis mt-2"
          >
            {{ t('media.adding.download_face_model_hint') }}
          </div>

          <div v-if="task.detectingFaces || task.faceDetectionTotal > 0" class="mt-3">
            <v-progress-linear
              v-model="task.faceDetectionProgress"
              color="secondary"
              height="18"
              rounded
              :striped="task.detectingFaces"
            >
              <template #default="{ value }">
                <strong class="process-percents">{{ Math.ceil(value) }} %</strong>
              </template>
            </v-progress-linear>
            <div class="text-caption text-medium-emphasis mt-1">
              {{ t('media.adding.face_detection_progress', {
                processed: task.faceDetectionProcessed,
                total: task.faceDetectionTotal,
                remaining: task.faceDetectionRemaining,
              }) }}
            </div>
          </div>
        </section>

        <!-- File lists -->
        <section
          v-if="task.added.length > 0 || duplicates_by_path.length || moved_files.length || duplicates_by_content_hash.length"
          class="process-dialog-section process-dialog-section--lists"
        >
          <div v-if="task.added.length > 0" class="process-list-item">
            <div class="process-list-row">
              <v-chip
                @click="is_show_added = !is_show_added"
                :text="t('media.adding.added_count', {count: task.added.length})"
                prepend-icon="mdi-plus"
                color="success"
                size="small"
              />
            </div>
            <v-card v-if="is_show_added" variant="outlined" class="pa-2 mt-2">
              <v-virtual-scroll
                :height="task.added.length > 10 ? 150 : task.added.length * 15"
                :items="task.added"
                class="virtual-scroller"
                item-height="15"
              >
                <template v-slot:default="{ item }">
                  <div class="text-caption selectable">{{ item }}</div>
                </template>
              </v-virtual-scroll>
            </v-card>
          </div>

          <!-- Existing files (by path) -->
          <div v-if="duplicates_by_path.length" class="process-list-item">
            <div class="process-list-row">
              <v-chip
                @click="is_show_duplicates_by_path = !is_show_duplicates_by_path"
                :text="t('media.adding.existing_count', {count: duplicates_by_path.length})"
                :prepend-icon="duplicateMarkers.inLibrary.icon"
                color="info"
                size="small"
              />
            </div>
            <v-card v-if="is_show_duplicates_by_path" variant="outlined" class="pa-2 mt-2">
              <v-virtual-scroll
                :height="duplicates_by_path.length > 10 ? 150 : duplicates_by_path.length * 22"
                :items="duplicates_by_path"
                class="virtual-scroller"
                item-height="22"
              >
                <template v-slot:default="{ item }">
                  <DuplicatePathRow
                    :icon="duplicateMarkers.inLibrary.icon"
                    :color="duplicateMarkers.inLibrary.color"
                    :label="t('media.adding.duplicate_file_in_library')"
                    :path="item"
                  />
                </template>
              </v-virtual-scroll>
            </v-card>
          </div>

          <!-- Moved files (same content, old path missing) -->
          <div v-if="moved_files.length" class="process-list-item">
            <div class="process-list-row">
              <v-chip
                @click="is_show_moved_files = !is_show_moved_files"
                :text="t('media.adding.moved_files_count', {count: moved_files.length})"
                :prepend-icon="duplicateMarkers.moved.icon"
                color="secondary"
                size="small"
              />
              <div class="process-list-row__actions">
                <v-btn
                  @click="relinkMovedFiles"
                  :disabled="task.active"
                  color="primary"
                  variant="flat"
                  rounded
                  size="small"
                >
                  <v-icon icon="mdi-folder-move" start/>
                  {{ t('media.adding.relink_moved_files') }}
                </v-btn>
              </div>
            </div>
            <v-card v-if="is_show_moved_files" variant="outlined" class="pa-2 mt-2">
              <v-virtual-scroll
                :height="moved_files.length > 10 ? 150 : moved_files.length * 44"
                :items="moved_files"
                class="virtual-scroller"
                item-height="44"
              >
                <template v-slot:default="{ item }">
                  <div class="duplicate-entry selectable">
                    <DuplicatePathRow
                      :icon="duplicateMarkers.incoming.icon"
                      :color="duplicateMarkers.incoming.color"
                      :label="t('media.adding.duplicate_file_incoming')"
                      :path="item.path"
                    />
                    <DuplicatePathRow
                      :icon="duplicateMarkers.movedOld.icon"
                      :color="duplicateMarkers.movedOld.color"
                      :label="t('media.adding.duplicate_file_old_path')"
                      :path="item.duplicate?.path"
                    />
                  </div>
                </template>
              </v-virtual-scroll>
            </v-card>
          </div>

          <!-- Duplicates by content hash -->
          <div v-if="duplicates_by_content_hash.length" class="process-list-item">
            <div class="process-list-row">
              <v-chip
                @click="is_show_duplicates_by_content_hash = !is_show_duplicates_by_content_hash"
                :text="t('media.adding.duplicates_by_content_count', {count: duplicates_by_content_hash.length})"
                :prepend-icon="duplicateMarkers.contentDuplicate.icon"
                color="warning"
                size="small"
              />
              <div class="process-list-row__actions">
                <v-btn
                  @click="deleteDuplicates('incoming')"
                  :disabled="task.active"
                  color="error"
                  variant="flat"
                  rounded
                  size="small"
                >
                  <v-icon :icon="duplicateMarkers.incomingDelete.icon" start/>
                  {{ t('media.adding.delete_incoming_files') }}
                </v-btn>
                <v-btn
                  @click="deleteDuplicates('existing')"
                  :disabled="task.active"
                  color="error"
                  variant="flat"
                  rounded
                  size="small"
                >
                  <v-icon :icon="duplicateMarkers.inLibraryDelete.icon" start/>
                  {{ t('media.adding.delete_existing_files') }}
                </v-btn>
              </div>
            </div>
            <v-card v-if="is_show_duplicates_by_content_hash" variant="outlined" class="pa-2 mt-2">
              <v-virtual-scroll
                :height="duplicates_by_content_hash.length > 10 ? 150 : duplicates_by_content_hash.length * 44"
                :items="duplicates_by_content_hash"
                class="virtual-scroller"
                item-height="44"
              >
                <template v-slot:default="{ item }">
                  <div class="duplicate-entry selectable">
                    <DuplicatePathRow
                      v-if="pathsLookSame(item.path, item.duplicate?.path)"
                      :icon="duplicateMarkers.inLibrary.icon"
                      :color="duplicateMarkers.inLibrary.color"
                      :label="t('media.adding.duplicate_file_in_library')"
                      :path="item.path"
                    />
                    <template v-else>
                      <DuplicatePathRow
                        :icon="duplicateMarkers.incoming.icon"
                        :color="duplicateMarkers.incoming.color"
                        :label="t('media.adding.duplicate_file_incoming')"
                        :path="item.path"
                      />
                      <DuplicatePathRow
                        :icon="duplicateMarkers.inLibrary.icon"
                        :color="duplicateMarkers.inLibrary.color"
                        :label="t('media.adding.duplicate_file_in_library')"
                        :path="item.duplicate?.path"
                      />
                    </template>
                  </div>
                </template>
              </v-virtual-scroll>
            </v-card>
          </div>
        </section>

        <!-- Errors -->
        <section v-if="task.errors.length > 0" class="process-dialog-section process-dialog-section--panel">
          <v-chip
            @click="is_show_errors = !is_show_errors"
            :text="t('media.adding.errors_count', {count: task.errors.length})"
            color="error"
            class="mb-2"
            size="small"
          />
          <v-card v-if="is_show_errors" variant="outlined" class="pa-2">
            <v-virtual-scroll
              :height="task.errors.length > 10 ? 150 : task.errors.length * 15"
              :items="task.errors"
              class="virtual-scroller"
              item-height="15"
            >
              <template v-slot:default="{ item }">
                <div class="text-caption selectable">{{ item }}</div>
              </template>
            </v-virtual-scroll>
          </v-card>
        </section>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {ref, computed, nextTick, onMounted, onUnmounted, watch} from 'vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import DialogHeader from "@/components/elements/DialogHeader.vue"
import ButtonDocumentation from "@/components/ui/ButtonDocumentation.vue"
import DuplicatePathRow from "@/components/dialogs/DuplicatePathRow.vue"
import {typedApi} from '@/services/typedApi'
import {useAppStore} from '@/stores/app'
import {useTasksStore} from '@/stores/tasks'
import {useItemsStore} from '@/stores/items'
import {useDialogsStore} from '@/stores/dialogs'
import {useEventBus} from '@/utils/eventBus'
import {useItemsListSync} from '@/composable/itemsListSync'
import {useAppShell} from '@/composable/appShell'
import {useMediaAdding} from '@/composable/AddingMedia'
import {useMediaAddingModelStatus} from '@/composable/useMediaAddingModelStatus'
import {deleteLocalFile} from '@/services/fileService'
import {setNotification} from '@/services/notificationService'
import {
  ensureModelsDownloaded,
  isModelStatusReady,
  MODEL_DOWNLOAD_SIZES_MB,
  type PendingModelDownload,
} from '@/services/modelDownloadConsent'
import {applyFaceDetectStatusEvent} from '@/utils/faceDetectStreamUi'
import {getErrorResponseData} from '@/types/vue'
import {getDefaultParserTagsMetaId} from '@/services/ensureStarterMeta'
import {
  acceptSuggestedTagsAndAssign,
  applyImportPathAutoTags,
  applyNeighborSuggestionsToMedia,
} from '@/services/importPathAutoTag'
import {
  buildOrganizeMoveItems,
  hasOrganizeByTagPrefs,
  loadOrganizeByTagPrefs,
} from '@/services/organizeMediaByTag'
import {
  flattenNeighborSuggestions,
  neighborSuggestionLabels,
  splitNeighborSuggestionsByCount,
  type NeighborTagSuggestion,
} from '@/services/smartLibrarySuggestions'
import {checkFileExists} from '@/services/fileService'
import {useSettingsStore} from '@/stores/settings'
import {useOperationsStore} from '@/stores/operations'
import {parseMatchAutoBlindTagsForm} from '@/utils/faceSettingsForm'
import {
  ONBOARDING_STEP_COUNT,
  openOnboarding,
  saveOnboardingStep,
  shouldShowOnboarding,
} from '@/composable/useOnboarding'
import {buildVideoGridTaskParams} from '@shared/videoPreview'
import {reloadTagsCatalog} from '@/composable/appCatalogs'
import {useAutoSceneScrapeBatch} from '@mediachips/plugin-adult/composables/useAutoSceneScrapeBatch'

interface DialogHeaderButton {
  icon?: string
  text?: string
  color?: string
  variant?: string
  action?: () => void
}

interface MediaDuplicateDetails {
  id?: number
  path?: string
  parameter?: string
  reason?: string
}

interface MediaAddingDuplicateEntry {
  path: string
  duplicate?: MediaDuplicateDetails
}

interface NotificationAction {
  id: string
  text: string
  icon: string
  action: () => void | Promise<void>
  hide?: boolean
}

type DeleteDuplicateType = 'incoming' | 'existing'

const getDuplicateDetails = (duplicate: unknown): MediaDuplicateDetails | undefined =>
  duplicate as MediaDuplicateDetails | undefined

const getErrorMessage = (error: unknown) =>
  getErrorResponseData<{ message?: string }>(error)?.message
  || (error instanceof Error ? error.message : String(error))

// Props - dialog state is controlled via tasksStore.mediaAdding.dialogProcess

// Emits
const emit = defineEmits(['close'])

// Stores and composables
const {xs} = useDisplay()
const {t} = useI18n()
const appStore = useAppStore()
const settingsStore = useSettingsStore()
const tasksStore = useTasksStore()
const itemsStore = useItemsStore()
const operationsStore = useOperationsStore()
const {runBatch: runSceneScrapeBatch} = useAutoSceneScrapeBatch()
const sceneScrapeAvailable = computed(() => typeof runSceneScrapeBatch === 'function')
const dialogsStore = useDialogsStore()
const eventBus = useEventBus()
const listSync = useItemsListSync()
const appShell = useAppShell()
const {reparseTagsForAddedMedia} = useMediaAdding()

// Reactive state
const buttons = ref<DialogHeaderButton[]>([])
const is_show_added = ref(false)
const is_show_duplicates_by_content_hash = ref(false)
const is_show_moved_files = ref(false)
const is_show_duplicates_by_path = ref(false)
const is_show_errors = ref(false)
const {
  clipModelStatus,
  clipModelDownloading,
  faceModelStatus,
  faceModelDownloading,
  clipModelNeedsDownload,
  faceModelReady,
  faceModelNeedsDownload,
  fetchClipModelStatus,
  downloadClipModel,
  fetchFaceModelStatus,
  downloadFaceModel,
} = useMediaAddingModelStatus()
const acceptingSuggestedTags = ref(false)
const pathAutoTagSummary = ref('')
const neighborReviewSuggestions = ref<NeighborTagSuggestion[]>([])
const smartWizardSummary = ref<{
  pathCreated?: number
  pathApplied?: number
  pathMedia?: number
  grids?: number
  faces?: number
  blindTags?: number
  clipIndexed?: boolean
  tagsAutoApplied?: number
  tagsPendingReview?: number
  organize?: 'done' | 'opened' | 'needs_setup' | 'skipped'
} | null>(null)
const smartWizard = ref({
  pathTags: true,
  grids: true,
  faces: false,
  blindFaceTags: parseMatchAutoBlindTagsForm(settingsStore['faceMatch.autoBlindTags'], false),
  clip: true,
  chapters: false,
  organize: false,
  neighborTags: false,
  scrape: false,
})
const smartAdvancedOpen = ref<number | undefined>(undefined)
const smartWizardRunning = ref(false)
const smartWizardProgress = ref(0)
const smartWizardStatus = ref('')
let smartWizardAbort: AbortController | null = null
let smartWizardTaskId: string | null = null

const hasFacePeopleCategory = computed(() => {
  const metaId = Number(settingsStore['faceMatch.performerMetaId'] || 0)
  return Number.isFinite(metaId) && metaId > 0
})

let faceDetectionAbort: AbortController | null = null
let faceDetectionTaskId: string | null = null

const stopBackgroundJobs = () => {
  if (faceDetectionAbort) {
    faceDetectionAbort.abort()
    faceDetectionAbort = null
  }
  if (faceDetectionTaskId) {
    tasksStore.removeTask(faceDetectionTaskId)
    faceDetectionTaskId = null
  }
  if (smartWizardAbort) {
    smartWizardAbort.abort()
    smartWizardAbort = null
  }
  if (smartWizardTaskId) {
    tasksStore.removeTask(smartWizardTaskId)
    smartWizardTaskId = null
  }
  smartWizardRunning.value = false
  task.value.detectingFaces = false
}

const closeProcessDialog = () => {
  stopBackgroundJobs()
  // When adding is idle, dismiss the related notification/task with the dialog.
  if (!task.value.active) {
    const notificationTaskId = task.value.notificationTaskId
    if (notificationTaskId) {
      tasksStore.removeTask(notificationTaskId)
      task.value.notificationTaskId = null
    }
  }
  tasksStore.mediaAdding.dialogProcess = false
  emit('close')
}

const duplicateMarkers = {
  inLibrary: {
    icon: 'mdi-database-check',
    color: 'info',
  },
  incoming: {
    icon: 'mdi-file-import-outline',
    color: 'warning',
  },
  incomingDelete: {
    icon: 'mdi-file-remove-outline',
    color: 'error',
  },
  inLibraryDelete: {
    icon: 'mdi-database-remove-outline',
    color: 'error',
  },
  contentDuplicate: {
    icon: 'mdi-file-compare',
    color: 'warning',
  },
  moved: {
    icon: 'mdi-folder-move-outline',
    color: 'secondary',
  },
  movedOld: {
    icon: 'mdi-database-off-outline',
    color: 'secondary',
  },
}

// Computed properties
const task = computed(() => tasksStore.mediaAdding)
const isAddedVideo = computed(() =>
  String(task.value.addedMediaType || '').toLowerCase() === 'video',
)
const canDetectFaces = computed(() => (
  task.value.finished &&
  task.value.added.length > 0 &&
  isAddedVideo.value
))
const canReparseTags = computed(() => (
  task.value.finished &&
  task.value.addedMedia.length > 0
))
const canMakeLibrarySmart = computed(() => (
  task.value.finished &&
  task.value.addedMedia.length > 0
))

const uniqueNames = (items: string[]) => {
  const seen = new Set<string>()
  return items.filter((name) => {
    const key = String(name || '').trim().toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const canRunSmartWizard = computed(() =>
  canMakeLibrarySmart.value &&
  (
    smartWizard.value.pathTags
    || smartWizard.value.organize
    || (isAddedVideo.value && (
      smartWizard.value.grids
      || smartWizard.value.faces
      || smartWizard.value.clip
      || smartWizard.value.chapters
      || smartWizard.value.neighborTags
      || (sceneScrapeAvailable.value && smartWizard.value.scrape)
    ))
  )
)

const smartEnhanceHint = computed(() => (
  isAddedVideo.value
    ? t('media.adding.make_library_smart_hint')
    : t('media.adding.make_library_smart_hint_images')
))

const smartEnhanceSafeHint = computed(() => (
  isAddedVideo.value
    ? t('media.adding.make_library_smart_safe_hint')
    : t('media.adding.make_library_smart_safe_hint_images')
))

const pathReviewTagNames = computed(() => uniqueNames(task.value.suggestedTags || []))

const pendingReviewTagCount = computed(() =>
  pathReviewTagNames.value.length
  + neighborReviewSuggestions.value.length,
)

const smartWizardSummaryLines = computed(() => {
  const summary = smartWizardSummary.value
  if (!summary) return [] as string[]
  const lines: string[] = []
  if (summary.pathApplied != null || summary.pathCreated != null) {
    lines.push(t('media.adding.make_library_smart_path_tags_done', {
      created: summary.pathCreated || 0,
      applied: summary.pathApplied || 0,
      media: summary.pathMedia || 0,
    }))
  }
  if (summary.grids != null) {
    lines.push(t('media.adding.make_library_smart_summary_grids', {
      count: summary.grids,
    }))
  }
  if (summary.faces != null) {
    lines.push(t('media.adding.faces_found', {count: summary.faces}))
  }
  if (summary.blindTags) {
    lines.push(t('media.adding.make_library_smart_blind_faces_done', {
      tags: summary.blindTags,
      faces: summary.faces || 0,
    }))
  }
  if (summary.clipIndexed) {
    lines.push(t('media.adding.make_library_smart_summary_clip_indexed'))
  }
  if (summary.tagsAutoApplied) {
    lines.push(t('media.adding.make_library_smart_summary_auto_applied', {
      count: summary.tagsAutoApplied,
    }))
  }
  if (summary.tagsPendingReview) {
    lines.push(t('media.adding.make_library_smart_summary_pending_review', {
      count: summary.tagsPendingReview,
    }))
  }
  if (summary.organize === 'done') {
    lines.push(t('media.adding.make_library_smart_summary_organize_done'))
  } else if (summary.organize === 'opened') {
    lines.push(t('media.adding.make_library_smart_summary_organize_opened'))
  } else if (summary.organize === 'needs_setup') {
    lines.push(t('media.adding.make_library_smart_summary_organize_needs_setup'))
  }
  return lines
})

function addedMediaIds(): number[] {
  return (task.value.addedMedia || [])
    .map((entry) => Number(entry.mediaId))
    .filter((id) => Number.isFinite(id) && id > 0)
}

function applySafeEnhancePreset() {
  const video = isAddedVideo.value
  smartWizard.value = {
    pathTags: true,
    grids: video,
    faces: false,
    blindFaceTags: false,
    clip: video,
    chapters: false,
    organize: false,
    neighborTags: false,
    scrape: false,
  }
}

function applyEverythingPossiblePreset() {
  const video = isAddedVideo.value
  smartWizard.value = {
    pathTags: true,
    grids: video,
    faces: video,
    blindFaceTags: video && hasFacePeopleCategory.value,
    clip: video,
    chapters: video,
    // Disk moves stay opt-in in Advanced — never auto from Magic.
    organize: false,
    neighborTags: video,
    scrape: video && sceneScrapeAvailable.value,
  }
}

async function preflightSmartWizardModels(trayTaskId?: string | null) {
  const setStatus = (text: string) => {
    smartWizardStatus.value = text
    if (trayTaskId) {
      tasksStore.updateTask(trayTaskId, {subtitle: text, progress: 0})
    }
  }

  const pending: PendingModelDownload[] = []

  if (smartWizard.value.faces && faceModelNeedsDownload.value) {
    pending.push({
      kind: 'faceDetect',
      name: t('ai.models.face_detect'),
      sizeMb: MODEL_DOWNLOAD_SIZES_MB.faceDetect,
      download: async (onProgress) => {
        const response = await typedApi.downloadFaceModel({}, onProgress)
        faceModelStatus.value = response.data?.status || 'downloaded'
      },
    })
  }

  if (smartWizard.value.faces) {
    try {
      const embedStatus = await typedApi.getFaceEmbedModelStatus()
      if (!isModelStatusReady(embedStatus.data?.status)) {
        pending.push({
          kind: 'faceEmbed',
          name: t('ai.models.face_embed'),
          sizeMb: MODEL_DOWNLOAD_SIZES_MB.faceEmbed,
          download: async (onProgress) => {
            await typedApi.downloadFaceEmbedModel({}, onProgress)
          },
        })
      }
    } catch (error) {
      console.error('Failed to check face embed model status:', error)
    }
  }

  if (smartWizard.value.clip && clipModelNeedsDownload.value) {
    pending.push({
      kind: 'clip',
      name: t('ai.models.clip'),
      sizeMb: MODEL_DOWNLOAD_SIZES_MB.clip,
      download: async (onProgress) => {
        const response = await typedApi.downloadClipModel({}, onProgress)
        clipModelStatus.value = response.data?.status || 'downloaded'
      },
    })
  }

  if (!pending.length) return

  const consent = await ensureModelsDownloaded({
    models: pending,
    t,
    onProgress: setStatus,
  })
  if (consent === 'cancelled') {
    const error = new Error(t('ai.models.cancelled'))
    ;(error as Error & {code?: string}).code = 'MODEL_DOWNLOAD_CANCELLED'
    throw error
  }
  if (consent === 'error') {
    throw new Error(t('media.adding.make_library_smart_failed'))
  }

  if (smartWizard.value.faces && faceModelNeedsDownload.value) {
    throw new Error(t('media.adding.download_face_model_hint'))
  }
  if (smartWizard.value.clip && clipModelNeedsDownload.value) {
    throw new Error(t('media.adding.download_video_recognition_model_hint'))
  }
}

function openFindSceneFromEnhance() {
  closeProcessDialog()
  appShell.showGlobalSearch()
}

async function runSafeEnhance() {
  if (!canMakeLibrarySmart.value || smartWizardRunning.value) return
  applySafeEnhancePreset()
  await runSmartLibraryWizard()
}

async function runEverythingPossible() {
  if (!canMakeLibrarySmart.value || smartWizardRunning.value) return
  applyEverythingPossiblePreset()
  await runSmartLibraryWizard()
}

function confirmSmartWizardOrganize(root: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: boolean) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    dialogsStore.confirm.checkBox = false
    dialogsStore.confirm.checkBox2 = false
    dialogsStore.confirm.checkBox2RequiresPrimary = false
    dialogsStore.confirm.checkBoxText = ''
    dialogsStore.confirm.checkBox2Text = ''
    dialogsStore.confirm.text = t('media.adding.make_library_smart_organize_confirm', {root})
    dialogsStore.confirm.action = () => finish(true)
    dialogsStore.confirm.show = true
    const stop = watch(
      () => dialogsStore.confirm.show,
      (show) => {
        if (show) return
        stop()
        finish(false)
      },
    )
  })
}

const duplicates_by_path = computed((): string[] => {
  return (task.value.duplicates as MediaAddingDuplicateEntry[])
    .filter(i => getDuplicateDetails(i.duplicate)?.parameter === 'path')
    .map(i => i.path)
})

const duplicates_by_content_hash = computed((): MediaAddingDuplicateEntry[] => {
  return (task.value.duplicates as MediaAddingDuplicateEntry[])
    .filter(i => {
      const duplicate = getDuplicateDetails(i.duplicate)
      const parameter = duplicate?.parameter
      return (
        (parameter === 'content_hash' || parameter === 'oshash' || parameter === 'basename_filesize')
        && duplicate?.reason === 'duplicate'
      )
    })
})

const moved_files = computed((): MediaAddingDuplicateEntry[] => {
  return (task.value.duplicates as MediaAddingDuplicateEntry[]).filter(i => {
    const duplicate = getDuplicateDetails(i.duplicate)
    const parameter = duplicate?.parameter
    return (
      (parameter === 'content_hash' || parameter === 'oshash' || parameter === 'basename_filesize')
      && duplicate?.reason === 'moved'
    )
  })
})

// Methods
const initButtons = () => {
  buttons.value = [{
    icon: "stop",
    text: t("common.stop"),
    color: "error",
    variant: "flat",
    action: stop,
  }]
}

const clearStopButton = () => {
  buttons.value = []
}

const syncStopButton = () => {
  const running = Boolean(task.value?.active && !task.value?.finished && !task.value?.stopped)
  if (running) {
    if (!buttons.value.length) initButtons()
    return
  }
  clearStopButton()
}

const stop = () => {
  tasksStore.mediaAdding.stopped = true
  clearStopButton()
  const notificationTaskId = task.value.notificationTaskId
  if (notificationTaskId) {
    tasksStore.updateTask(notificationTaskId, {
      action: undefined,
      done: true,
      subtitle: t('common.stop'),
    })
  }
}

const reparseTags = async () => {
  await reparseTagsForAddedMedia()
}

const pathsLookSame = (left: unknown, right: unknown) => {
  if (!left || !right) return false
  return left === right || String(left).toLowerCase() === String(right).toLowerCase()
}

const deleteDuplicates = async (delete_type: DeleteDuplicateType) => {
  dialogsStore.confirm.show = true
  dialogsStore.confirm.text = t('media.adding.delete_files_confirm')
  dialogsStore.confirm.action = async () => {
    try {
      const dupes = (task.value.duplicates as MediaAddingDuplicateEntry[]).filter(i => {
        const duplicate = getDuplicateDetails(i.duplicate)
        const parameter = duplicate?.parameter
        return (
          (parameter === 'content_hash' || parameter === 'oshash' || parameter === 'basename_filesize')
          && duplicate?.reason === 'duplicate'
        )
      })

      for (const dupe of dupes) {
        const duplicate = getDuplicateDetails(dupe.duplicate)
        const file_path = delete_type === 'incoming' ? dupe.path : duplicate?.path

        if (!file_path) continue

        try {
          await deleteLocalFile(file_path)
        } catch (error) {
          console.error('Error deleting local file:', error)
        }

        if (delete_type === 'existing' && duplicate?.id) {
          await typedApi.updateMediaPath({
            id: duplicate.id,
            path: dupe.path,
          })
        }
      }

      if (delete_type === "existing") {
        const ids = dupes.map(i => getDuplicateDetails(i.duplicate)?.id).filter(Boolean) as number[]

        if (ids.length > 0) {
          listSync.getItemsFromDb({
            ids: ids,
            type: 'media',
          })
        }
      }

      emit('close')

      setNotification({
        type: 'success',
        title: t('media.adding.deleting_files'),
        text: t('media.adding.files_deleted')
      })

      eventBus.emit('update:watcher')

    } catch (error) {
      console.error('Error deleting duplicates:', error)
    }
  }
}

const relinkMovedFiles = async () => {
  const dupes = moved_files.value

  if (!dupes.length) return

  try {
    for (const dupe of dupes) {
      const duplicate = getDuplicateDetails(dupe.duplicate)
      if (!duplicate?.id || !dupe.path) continue

      await typedApi.updateMediaPath({
        id: duplicate.id,
        path: dupe.path,
      })
    }

    const ids = dupes.map(i => getDuplicateDetails(i.duplicate)?.id).filter(Boolean) as number[]

    if (ids.length > 0) {
      listSync.getItemsFromDb({
        ids: ids,
        type: 'media',
      })
    }

    setNotification({
      type: 'success',
      title: t('media.adding.relink_moved_files'),
      text: t('media.adding.paths_relinked', {count: dupes.length}),
    })

    eventBus.emit('update:watcher')
  } catch (error) {
    console.error('Error relinking moved files:', error)
    setNotification({
      type: 'error',
      title: t('media.adding.relink_moved_files'),
      text: getErrorMessage(error),
    })
  }
}

const openSuggestedTags = () => {
  const names = uniqueNames([
    ...pathReviewTagNames.value,
    ...neighborSuggestionLabels(neighborReviewSuggestions.value),
  ])
  appShell.openTagsAddWithNames({
    names,
    metaId: getDefaultParserTagsMetaId(appStore.meta, settingsStore.defaultTagCategoryId) ?? undefined,
    title: t('media.adding.suggested_tags_from_added_files'),
    mediaIds: addedMediaIds(),
  })
}

const acceptAllSuggestedTags = async () => {
  const pathNames = pathReviewTagNames.value
  const neighbors = [...neighborReviewSuggestions.value]
  if (!pathNames.length && !neighbors.length) return

  acceptingSuggestedTags.value = true
  try {
    const mediaIds = addedMediaIds()
    let created = 0
    let applied = 0

    if (neighbors.length) {
      const neighborResult = await applyNeighborSuggestionsToMedia(neighbors)
      applied += neighborResult.applied
      neighborReviewSuggestions.value = []
    }

    if (pathNames.length) {
      const metaId = getDefaultParserTagsMetaId(appStore.meta, settingsStore.defaultTagCategoryId)
      if (!metaId) {
        openSuggestedTags()
      } else {
        const pathResult = await acceptSuggestedTagsAndAssign(pathNames, mediaIds)
        created += pathResult.createdTags
        applied += pathResult.applied
        task.value.suggestedTags = []
      }
    }

    listSync.getItemsFromDb({
      ids: mediaIds,
      type: 'media',
    })
    setNotification({
      type: 'success',
      title: t('media.adding.accept_all_suggested_tags'),
      text: t('media.adding.accept_all_suggested_tags_done', {
        created,
        applied,
      }),
    })
  } catch (error) {
    console.error('Error accepting suggested tags:', error)
    setNotification({
      type: 'error',
      title: t('media.adding.accept_all_suggested_tags'),
      text: getErrorMessage(error),
    })
  } finally {
    acceptingSuggestedTags.value = false
  }
}

const openProcessAction = (): NotificationAction => ({
  id: 'open-media-adding-process',
  text: t('media.adding.open_process_dialog'),
  icon: 'open-in-new',
  action: async () => {
    if (task.value.dialogProcess) return
    await nextTick()
    task.value.dialogProcess = true
  },
  hide: true,
})

const detectFacesInAddedVideos = async () => {
  if (!faceModelReady.value) {
    setNotification({
      type: 'warning',
      title: t('media.adding.detect_faces'),
      text: t('media.adding.download_face_model_hint'),
    })
    return
  }

  task.value.detectingFaces = true
  task.value.faceDetectionProgress = 0
  task.value.faceDetectionProcessed = 0
  task.value.faceDetectionTotal = task.value.added.length
  task.value.faceDetectionRemaining = task.value.added.length
  task.value.facesFound = 0

  const previousStatus = task.value.status
  task.value.status = t('media.adding.detect_faces')
  const controller = new AbortController()
  faceDetectionAbort = controller
  const detectionTaskId = tasksStore.setTask({
    title: t('media.adding.detect_faces'),
    subtitle: t('media.adding.face_detection_progress', {
      processed: 0,
      total: task.value.added.length,
      remaining: task.value.added.length,
    }),
    icon: 'face-recognition',
    progress: 0,
    click: () => {
      task.value.dialogProcess = true
    },
    action: () => {
      controller.abort()
    },
  })
  faceDetectionTaskId = detectionTaskId

  try {
    const refreshedMediaIds = new Set<number>()

    await typedApi.streamFaceDetection(
      {
        paths: task.value.added,
        force: false,
      },
      {signal: controller.signal},
      (event: Record<string, unknown>) => {
        if (applyFaceDetectStatusEvent(event, {
          notify: ({type, textKey}) => {
            setNotification({type, text: t(textKey)})
          },
          updateTask: ({subtitleKey, progress}) => {
            tasksStore.updateTask(detectionTaskId, {
              subtitle: t(subtitleKey),
              ...(progress != null ? {progress} : {}),
            })
          },
        })) {
          return
        }

        if (event.type === 'progress') {
          const mediaId = Number(event.mediaId)
          if (Number.isFinite(mediaId) && mediaId > 0) refreshedMediaIds.add(mediaId)
          task.value.faceDetectionProcessed = Number(event.processed || 0)
          task.value.faceDetectionTotal = Number(event.total || task.value.faceDetectionTotal || 0)
          task.value.faceDetectionRemaining = Number(
            event.remaining ?? Math.max(task.value.faceDetectionTotal - task.value.faceDetectionProcessed, 0),
          )
          task.value.facesFound = Number(event.faces || 0)
          task.value.faceDetectionProgress = task.value.faceDetectionTotal
            ? Math.min((task.value.faceDetectionProcessed / task.value.faceDetectionTotal) * 100, 100)
            : 0
          tasksStore.updateTask(detectionTaskId, {
            subtitle: t('media.adding.face_detection_progress', {
              processed: task.value.faceDetectionProcessed,
              total: task.value.faceDetectionTotal,
              remaining: task.value.faceDetectionRemaining,
            }),
            progress: task.value.faceDetectionProgress,
          })
        }

        if (event.type === 'complete') {
          task.value.faceDetectionProcessed = Number(event.processed || task.value.faceDetectionTotal)
          task.value.faceDetectionTotal = Number(event.total || task.value.faceDetectionTotal)
          task.value.faceDetectionRemaining = 0
          task.value.faceDetectionProgress = 100
          task.value.facesFound = Number(event.faces || 0)
          tasksStore.updateTask(detectionTaskId, {
            subtitle: t('media.adding.faces_found', {count: task.value.facesFound}),
            progress: 100,
            color: 'success',
            done: true,
            action: undefined,
          })
        }

        if (event.type === 'error') {
          throw new Error(String(event.message || 'Face detection failed'))
        }
      },
    )

    if (refreshedMediaIds.size) {
      listSync.getItemsFromDb({
        ids: [...refreshedMediaIds],
        type: 'media',
      })
    }

    if (task.value.facesFound > 0) {
      setNotification({
        type: 'success',
        title: t('media.adding.face_detection_complete'),
        text: t('media.adding.faces_found', {count: task.value.facesFound}),
        actions: [openProcessAction()],
      })
    } else {
      setNotification({
        type: 'info',
        title: t('media.adding.face_detection_complete'),
        text: t('media.adding.faces_not_found'),
        actions: [openProcessAction()],
      })
    }
  } catch (error) {
    console.error('Error detecting faces:', error)
    const isAbortError = error instanceof Error && error.name === 'AbortError'
    if (isAbortError) {
      if (faceDetectionTaskId === detectionTaskId) {
        tasksStore.removeTask(detectionTaskId)
      }
    } else {
      tasksStore.updateTask(detectionTaskId, {
        subtitle: t('media.adding.face_detection_failed'),
        color: 'error',
        done: true,
        action: undefined,
      })
      setNotification({
        type: 'error',
        title: t('media.adding.face_detection_failed'),
        text: getErrorMessage(error),
      })
    }
  } finally {
    if (faceDetectionAbort === controller) faceDetectionAbort = null
    task.value.status = previousStatus
    task.value.detectingFaces = false
  }
}

const runSmartLibraryWizard = async () => {
  if (!canRunSmartWizard.value || smartWizardRunning.value) return

  const steps: Array<'pathTags' | 'grids' | 'faces' | 'clip' | 'chapters' | 'neighborTags' | 'scrape' | 'organize'> = []
  if (smartWizard.value.pathTags) steps.push('pathTags')
  if (isAddedVideo.value && smartWizard.value.grids) steps.push('grids')
  if (isAddedVideo.value && smartWizard.value.faces) steps.push('faces')
  if (isAddedVideo.value && smartWizard.value.clip) steps.push('clip')
  if (isAddedVideo.value && smartWizard.value.chapters) steps.push('chapters')
  if (isAddedVideo.value && smartWizard.value.neighborTags) steps.push('neighborTags')
  if (isAddedVideo.value && sceneScrapeAvailable.value && smartWizard.value.scrape) steps.push('scrape')
  if (smartWizard.value.organize) steps.push('organize')
  if (!steps.length) return

  smartWizardRunning.value = true
  smartWizardProgress.value = 0
  pathAutoTagSummary.value = ''
  smartWizardSummary.value = {}
  neighborReviewSuggestions.value = []
  smartWizardStatus.value = t('media.adding.make_library_smart')
  const controller = new AbortController()
  smartWizardAbort = controller
  const trayTaskId = tasksStore.setTask({
    title: t('media.adding.make_library_smart'),
    subtitle: smartEnhanceHint.value,
    icon: 'auto-fix',
    progress: 0,
    click: () => {
      task.value.dialogProcess = true
    },
    action: () => {
      controller.abort()
    },
  })
  smartWizardTaskId = trayTaskId

  const mediaEntries = task.value.addedMedia || []
  const mediaIds = addedMediaIds()
  let tagsAutoApplied = 0
  let tagsPendingReview = 0

  try {
    try {
      await preflightSmartWizardModels(trayTaskId)
    } catch (error) {
      const cancelled = error instanceof Error
        && ((error as Error & {code?: string}).code === 'MODEL_DOWNLOAD_CANCELLED'
          || error.message === t('ai.models.cancelled'))
      tasksStore.updateTask(trayTaskId, {
        subtitle: cancelled
          ? t('ai.models.cancelled')
          : t('media.adding.make_library_smart_failed'),
        color: cancelled ? 'warning' : 'error',
        done: true,
        action: undefined,
      })
      if (!cancelled) {
        setNotification({
          type: 'error',
          title: t('media.adding.make_library_smart_failed'),
          text: getErrorMessage(error),
        })
      }
      return
    }

    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      if (controller.signal.aborted) break
      const step = steps[stepIndex]
      const base = (stepIndex / steps.length) * 100
      const span = 100 / steps.length

      if (step === 'pathTags') {
        smartWizardStatus.value = t('media.adding.make_library_smart_path_tags')
        tasksStore.updateTask(trayTaskId, {
          subtitle: t('media.adding.make_library_smart_path_tags'),
          progress: base + span * 0.2,
        })
        const result = await applyImportPathAutoTags(mediaIds, {signal: controller.signal})
        smartWizardSummary.value = {
          ...smartWizardSummary.value,
          pathCreated: result.createdTags,
          pathApplied: result.applied,
          pathMedia: result.mediaWithTags,
        }
        pathAutoTagSummary.value = t('media.adding.make_library_smart_path_tags_done', {
          created: result.createdTags,
          applied: result.applied,
          media: result.mediaWithTags,
        })
        if (mediaIds.length) {
          listSync.getItemsFromDb({ids: mediaIds, type: 'media'})
        }
        smartWizardProgress.value = base + span
        tasksStore.updateTask(trayTaskId, {
          subtitle: pathAutoTagSummary.value,
          progress: smartWizardProgress.value,
        })
      }

      if (step === 'grids') {
        smartWizardStatus.value = t('media.adding.make_library_smart_grids')
        let gridsCreated = 0
        for (let i = 0; i < mediaEntries.length; i++) {
          if (controller.signal.aborted) break
          const entry = mediaEntries[i]
          smartWizardProgress.value = base + ((i + 1) / Math.max(mediaEntries.length, 1)) * span
          tasksStore.updateTask(trayTaskId, {
            subtitle: t('media.adding.make_library_smart_grids_progress', {
              processed: i + 1,
              total: mediaEntries.length,
            }),
            progress: smartWizardProgress.value,
          })
          try {
            await typedApi.taskCreateGrid(buildVideoGridTaskParams(entry.path, `${entry.mediaId}.jpg`))
            gridsCreated += 1
            itemsStore.refreshThumb(entry.mediaId, {broadcast: false})
            eventBus.emit('updateVideoFrames', entry.mediaId)
            listSync.getItemsFromDb({ids: [entry.mediaId], type: 'media'})
          } catch (error) {
            console.error(`Failed to create grid for media ${entry.mediaId}:`, error)
          }
        }
        smartWizardSummary.value = {
          ...smartWizardSummary.value,
          grids: gridsCreated,
        }
      }

      if (step === 'faces') {
        smartWizardStatus.value = t('media.adding.detect_faces')
        await typedApi.streamFaceDetection(
          {
            mediaIds,
            paths: task.value.added,
            force: false,
            autoBlindTags: smartWizard.value.blindFaceTags && hasFacePeopleCategory.value,
          },
          {signal: controller.signal},
          (event: Record<string, unknown>) => {
            if (event.type === 'progress') {
              const processed = Number(event.processed || 0)
              const total = Number(event.total || mediaIds.length || 1)
              smartWizardProgress.value = base + (processed / Math.max(total, 1)) * span
              task.value.facesFound = Number(event.faces || 0)
              tasksStore.updateTask(trayTaskId, {
                subtitle: t('media.adding.face_detection_progress', {
                  processed,
                  total,
                  remaining: Number(event.remaining ?? Math.max(total - processed, 0)),
                }),
                progress: smartWizardProgress.value,
              })
            }
            if (event.type === 'complete') {
              const blindTags = Number(event.blindTags || 0)
              const faces = Number(event.faces || task.value.facesFound || 0)
              smartWizardSummary.value = {
                ...smartWizardSummary.value,
                faces,
                blindTags: blindTags || undefined,
              }
              if (blindTags > 0) {
                setNotification({
                  type: 'success',
                  text: t('media.adding.make_library_smart_blind_faces_done', {
                    tags: blindTags,
                    faces,
                  }),
                })
              }
            }
            if (event.type === 'error') {
              throw new Error(String(event.message || 'Face detection failed'))
            }
          },
        )
        if (mediaIds.length) {
          listSync.getItemsFromDb({ids: mediaIds, type: 'media'})
        }
      }

      if (step === 'clip') {
        smartWizardStatus.value = t('media.adding.make_library_smart_clip')
        await typedApi.streamBackfill(
          'clipEmbedding',
          {mediaIds, signal: controller.signal},
          (event) => {
            if (event.type === 'progress') {
              const processed = Number(event.processed || 0)
              const total = Number(event.total || mediaIds.length || 1)
              smartWizardProgress.value = base + (processed / Math.max(total, 1)) * span
              tasksStore.updateTask(trayTaskId, {
                subtitle: t('media.adding.make_library_smart_clip_progress', {
                  processed,
                  total,
                }),
                progress: smartWizardProgress.value,
              })
            }
            if (event.type === 'error') {
              throw new Error(String(event.message || 'CLIP embedding failed'))
            }
          },
        )

        smartWizardSummary.value = {
          ...smartWizardSummary.value,
          clipIndexed: true,
        }
        smartWizardProgress.value = base + span
      }

      if (step === 'chapters') {
        smartWizardStatus.value = t('media.adding.make_library_smart_chapters')
        tasksStore.updateTask(trayTaskId, {
          subtitle: t('media.adding.make_library_smart_chapters'),
          progress: base + span * 0.1,
        })
        await typedApi.streamAutoChapterGeneration(
          {
            mediaIds,
            force: true,
            useSilence: true,
            useLlmTitles: true,
            locale: String(settingsStore.locale || 'en'),
          },
          {signal: controller.signal},
          (event) => {
            if (event.type === 'progress' || event.type === 'item') {
              const processed = Number(event.processed || 0)
              const total = Math.max(1, Number(event.total || mediaIds.length || 1))
              const itemProgress = Math.min(1, Math.max(0, Number(event.itemProgress) || 0))
              const effective = processed + (event.type === 'progress' ? itemProgress : 0)
              const percent = Math.min((effective / total) * 100, 100)
              smartWizardProgress.value = base + (effective / total) * span
              tasksStore.updateTask(trayTaskId, {
                subtitle: t('media.adding.make_library_smart_chapters_progress', {
                  processed,
                  total,
                  percent: Math.round(percent),
                }),
                progress: smartWizardProgress.value,
              })
            }
            if (event.type === 'error') {
              throw new Error(String(event.message || 'Auto chapters failed'))
            }
          },
        )
        smartWizardProgress.value = base + span
      }

      if (step === 'neighborTags') {
        smartWizardStatus.value = t('media.adding.make_library_smart_neighbor_tags')
        tasksStore.updateTask(trayTaskId, {
          subtitle: t('media.adding.make_library_smart_neighbor_tags'),
          progress: base + span * 0.2,
        })
        const response = await typedApi.suggestTagsFromSimilar({
          mediaIds,
          apply: false,
          tagLimit: 12,
          neighborLimit: 24,
          minCount: 1,
        })
        const flat = flattenNeighborSuggestions(response.data?.items || [])
        const {high, low} = splitNeighborSuggestionsByCount(flat)
        if (high.length) {
          const applied = await applyNeighborSuggestionsToMedia(high)
          tagsAutoApplied += applied.applied
        }
        neighborReviewSuggestions.value = low
        tagsPendingReview += low.length
        smartWizardProgress.value = base + span
      }

      if (step === 'scrape') {
        smartWizardStatus.value = t('media.adding.make_library_smart_scrape')
        tasksStore.updateTask(trayTaskId, {
          subtitle: t('media.adding.make_library_smart_scrape'),
          progress: base + span * 0.2,
        })
        if (mediaIds.length) {
          listSync.getItemsFromDb({ids: mediaIds, type: 'media'})
        }
        const byId = new Map(
          (itemsStore.entities || []).map((item) => [Number(item.id), item]),
        )
        const videoItems = mediaIds.map((id) => {
          const existing = byId.get(id)
          if (existing) return existing
          const entry = (task.value.addedMedia || []).find((row) => Number(row.mediaId) === id)
          return {
            id,
            path: entry?.path,
            mediaTypeId: task.value.addedMediaTypeId,
          }
        })
        if (videoItems.length) {
          await runSceneScrapeBatch(videoItems as never[], {clearSelection: false})
        }
        smartWizardProgress.value = base + span
      }

      if (step === 'organize') {
        smartWizardStatus.value = t('media.adding.make_library_smart_organize')
        tasksStore.updateTask(trayTaskId, {
          subtitle: t('media.adding.make_library_smart_organize'),
          progress: base + span * 0.5,
        })
        if (mediaIds.length) {
          listSync.getItemsFromDb({ids: mediaIds, type: 'media'})
          operationsStore.create_folder_move_media.ids = [...mediaIds]
          const prefs = loadOrganizeByTagPrefs()
          if (hasOrganizeByTagPrefs(prefs) && prefs) {
            const rootExists = await checkFileExists(prefs.root)
            if (!rootExists) {
              smartWizardSummary.value = {
                ...smartWizardSummary.value,
                organize: 'needs_setup',
              }
              operationsStore.create_folder_move_media.dialog = true
            } else {
              const runOrganize = await confirmSmartWizardOrganize(prefs.root)
              if (runOrganize) {
                const mediaById = new Map(
                  (itemsStore.entities || []).map((item) => [Number(item.id), item]),
                )
                for (const entry of task.value.addedMedia || []) {
                  const id = Number(entry.mediaId)
                  if (!mediaById.has(id)) {
                    mediaById.set(id, {id, path: entry.path, tags: []})
                  }
                }
                const tagsById = new Map(
                  (appStore.tags || []).map((tag) => [Number(tag.id), tag]),
                )
                const moveItems = buildOrganizeMoveItems({
                  ids: mediaIds,
                  root: prefs.root,
                  metaIds: prefs.metaIds,
                  mediaById,
                  tagsById,
                })
                if (moveItems.length) {
                  operationsStore.moving.items = moveItems
                  operationsStore.moving.ids = []
                  operationsStore.moving.callback = (movedId) => {
                    listSync.getItemsFromDb({ids: [movedId], type: 'media'})
                  }
                  await operationsStore.moveFiles()
                  smartWizardSummary.value = {
                    ...smartWizardSummary.value,
                    organize: 'done',
                  }
                } else {
                  smartWizardSummary.value = {
                    ...smartWizardSummary.value,
                    organize: 'needs_setup',
                  }
                  operationsStore.create_folder_move_media.dialog = true
                }
              } else {
                smartWizardSummary.value = {
                  ...smartWizardSummary.value,
                  organize: 'skipped',
                }
              }
            }
          } else {
            smartWizardSummary.value = {
              ...smartWizardSummary.value,
              organize: 'needs_setup',
            }
            operationsStore.create_folder_move_media.dialog = true
          }
        }
        smartWizardProgress.value = base + span
      }
    }

    if (!controller.signal.aborted) {
      smartWizardSummary.value = {
        ...smartWizardSummary.value,
        tagsAutoApplied: tagsAutoApplied || undefined,
        tagsPendingReview: tagsPendingReview || pendingReviewTagCount.value || undefined,
      }
      smartWizardProgress.value = 100
      const summaryText = smartWizardSummaryLines.value.join(' · ')
        || pathAutoTagSummary.value
        || t('media.adding.make_library_smart_done')
      smartWizardStatus.value = summaryText
      pathAutoTagSummary.value = summaryText
      tasksStore.updateTask(trayTaskId, {
        subtitle: summaryText,
        progress: 100,
        color: 'success',
        done: true,
        action: undefined,
      })
      setNotification({
        type: 'success',
        title: t('media.adding.make_library_smart'),
        text: summaryText,
        actions: [openProcessAction()],
      })
    } else {
      tasksStore.removeTask(trayTaskId)
    }
  } catch (error) {
    const isAbortError = error instanceof Error && error.name === 'AbortError'
    if (isAbortError) {
      tasksStore.removeTask(trayTaskId)
    } else {
      console.error('Smart library wizard failed:', error)
      tasksStore.updateTask(trayTaskId, {
        subtitle: t('media.adding.make_library_smart_failed'),
        color: 'error',
        done: true,
        action: undefined,
      })
      setNotification({
        type: 'error',
        title: t('media.adding.make_library_smart_failed'),
        text: getErrorMessage(error),
      })
    }
  } finally {
    if (smartWizardAbort === controller) smartWizardAbort = null
    if (smartWizardTaskId === trayTaskId) smartWizardTaskId = null
    smartWizardRunning.value = false
  }
}


// Lifecycle
const onSuggestedTagsReviewed = (payload: {
  names?: string[]
  mediaIds?: number[]
  assigned?: boolean
}) => {
  const reviewed = new Set(
    (payload.names || []).map((name) => String(name || '').trim().toLowerCase()).filter(Boolean),
  )
  if (!reviewed.size) return

  const remaining = (task.value.suggestedTags || []).filter(
    (name) => !reviewed.has(String(name || '').trim().toLowerCase()),
  )
  task.value.suggestedTags = remaining
}

onMounted(() => {
  syncStopButton()
  eventBus.on('tagsAdd:completed', onSuggestedTagsReviewed)
  if (task.value && !task.value.finished) {
    task.value.active = true
  }
})

onUnmounted(() => {
  eventBus.off('tagsAdd:completed', onSuggestedTagsReviewed)
})

// Watchers
watch(() => tasksStore.mediaAdding.dialogProcess, (open, wasOpen) => {
  if (wasOpen && !open) {
    stopBackgroundJobs()
    if (!task.value.active) {
      const notificationTaskId = task.value.notificationTaskId
      if (notificationTaskId) {
        tasksStore.removeTask(notificationTaskId)
        task.value.notificationTaskId = null
      }
    }
    if (shouldShowOnboarding(false)) {
      void saveOnboardingStep(ONBOARDING_STEP_COUNT - 1).then(() => {
        openOnboarding()
      })
    }
  }
})

watch(
  () => [task.value?.active, task.value?.finished, task.value?.stopped] as const,
  () => {
    syncStopButton()
  },
)

watch(() => task.value?.finished, (finished) => {
  if (finished) {
    clearStopButton()
    if (task.value) {
      task.value.progress = 100
    }
    const notificationTaskId = task.value?.notificationTaskId
    if (notificationTaskId) {
      tasksStore.updateTask(notificationTaskId, {
        done: true,
        action: undefined,
      })
    }
    if (
      task.value.added.length > 0 &&
      String(task.value.addedMediaType || '').toLowerCase() === 'video'
    ) {
      fetchClipModelStatus()
      fetchFaceModelStatus()
    }
  }
})

watch(canDetectFaces, (enabled) => {
  if (enabled) {
    fetchClipModelStatus()
    fetchFaceModelStatus()
  }
})
</script>

<style lang="scss" scoped>
.process-percents {
  background-color: rgba(255, 255, 255, 0.5);
  padding: 1px 4px 1px;
  border-radius: 10px;
  line-height: 1;
}

.selectable {
  user-select: text;
  cursor: text;
}

.virtual-scroller {
  :deep(.v-virtual-scroll__item) {
    &:hover {
      background-color: rgba(0, 0, 0, 0.05);
    }
  }
}

.duplicate-entry {
  display: flex;
  flex-direction: column;
  gap: 4px;
  justify-content: center;
  min-height: 40px;
}

.process-dialog-section {
  margin-bottom: 0;
  padding-bottom: 16px;
  margin-top: 16px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.process-dialog-section:first-child {
  margin-top: 0;
}

.process-dialog-section:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.process-dialog-section--panel {
  padding-top: 0;
}

.process-dialog-section--review {
  padding: 12px;
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.08);
  border-bottom: none;
}

.process-dialog-section--lists {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.process-list-item {
  min-width: 0;
}

.process-list-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-height: 32px;
}

.process-list-row__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.smart-wizard-advanced {
  margin-top: 4px;
}

.smart-wizard-advanced :deep(.v-expansion-panel-title) {
  min-height: 36px;
  padding-inline: 8px;
}

.smart-wizard-advanced :deep(.v-expansion-panel-text__wrapper) {
  padding: 0 4px 8px;
}

.smart-wizard-section {
  font-size: 0.875rem;
}

.smart-wizard-section__title {
  line-height: 1.3;
}

.smart-wizard-section__hint {
  line-height: 1.35;
  max-width: 36rem;
}

.smart-wizard-section__group {
  letter-spacing: 0.04em;
  font-size: 0.7rem;
}

.smart-wizard-option {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  margin-block: -2px;
}

.smart-wizard-option :deep(.v-checkbox) {
  flex: 1 1 auto;
  min-width: 0;
}

.smart-wizard-option :deep(.v-selection-control) {
  min-height: 32px;
}

.smart-wizard-option :deep(.v-label) {
  white-space: normal;
  font-size: 0.8125rem;
  line-height: 1.3;
}

.smart-wizard-nested {
  margin: 0 0 2px 12px;
  padding: 0 0 2px 10px;
  border-left: 2px solid rgba(var(--v-theme-primary), 0.28);
}

.smart-wizard-nested__hint {
  margin: -2px 0 4px 36px;
  line-height: 1.3;
  max-width: 36rem;
  font-size: 0.75rem;
}
</style>