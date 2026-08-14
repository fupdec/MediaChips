import {ref, computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {setNotification} from '@/services/notificationService'
import {
  ensureModelsDownloaded,
  MODEL_DOWNLOAD_SIZES_MB,
} from '@/services/modelDownloadConsent'
import {getErrorResponseData} from '@/types/vue'

function getErrorMessage(error: unknown) {
  return getErrorResponseData<{ message?: string }>(error)?.message
    || (error instanceof Error ? error.message : String(error))
}

/** CLIP + face-detect model readiness/download status for the media-adding dialog. */
export function useMediaAddingModelStatus() {
  const {t} = useI18n()

  const clipModelStatus = ref('unknown')
  const clipModelDownloading = ref(false)
  const faceModelStatus = ref('unknown')
  const faceModelDownloading = ref(false)

  const clipModelReady = computed(() => ['downloaded', 'loaded'].includes(clipModelStatus.value))
  const clipModelNeedsDownload = computed(() => (
    !clipModelReady.value && !['loading'].includes(clipModelStatus.value)
  ))
  const faceModelReady = computed(() => ['downloaded', 'loaded'].includes(faceModelStatus.value))
  const faceModelNeedsDownload = computed(() => (
    !faceModelReady.value && !['loading'].includes(faceModelStatus.value)
  ))

  const fetchClipModelStatus = async () => {
    try {
      const response = await typedApi.getClipModelStatus()
      clipModelStatus.value = response.data?.status || 'unknown'
    } catch (error) {
      console.error('Error checking CLIP model status:', error)
      clipModelStatus.value = 'error'
    }
  }

  const downloadClipModel = async () => {
    clipModelDownloading.value = true
    clipModelStatus.value = 'loading'

    try {
      const consent = await ensureModelsDownloaded({
        models: [{
          kind: 'clip',
          name: t('ai.models.clip'),
          sizeMb: MODEL_DOWNLOAD_SIZES_MB.clip,
          download: async (onProgress) => {
            const response = await typedApi.downloadClipModel({}, onProgress)
            clipModelStatus.value = response.data?.status || 'downloaded'
          },
        }],
        explicit: true,
        t,
      })
      if (consent !== 'ok') {
        clipModelStatus.value = 'error'
        return
      }
    } catch (error) {
      console.error('Error downloading CLIP model:', error)
      clipModelStatus.value = 'error'
      setNotification({
        type: 'error',
        title: t('media.adding.download_video_recognition_model'),
        text: getErrorMessage(error),
      })
    } finally {
      clipModelDownloading.value = false
    }
  }

  const fetchFaceModelStatus = async () => {
    try {
      const response = await typedApi.getFaceModelStatus()
      faceModelStatus.value = response.data?.status || 'unknown'
    } catch (error) {
      console.error('Error checking face model status:', error)
      faceModelStatus.value = 'error'
    }
  }

  const downloadFaceModel = async () => {
    faceModelDownloading.value = true
    faceModelStatus.value = 'loading'

    try {
      const consent = await ensureModelsDownloaded({
        models: [{
          kind: 'faceDetect',
          name: t('ai.models.face_detect'),
          sizeMb: MODEL_DOWNLOAD_SIZES_MB.faceDetect,
          download: async (onProgress) => {
            const response = await typedApi.downloadFaceModel({}, onProgress)
            faceModelStatus.value = response.data?.status || 'downloaded'
          },
        }],
        explicit: true,
        t,
      })
      if (consent !== 'ok') {
        faceModelStatus.value = 'error'
        return
      }
    } catch (error) {
      console.error('Error downloading face model:', error)
      faceModelStatus.value = 'error'
      setNotification({
        type: 'error',
        title: t('media.adding.download_face_model'),
        text: getErrorMessage(error),
      })
    } finally {
      faceModelDownloading.value = false
    }
  }

  return {
    clipModelStatus,
    clipModelDownloading,
    faceModelStatus,
    faceModelDownloading,
    clipModelReady,
    clipModelNeedsDownload,
    faceModelReady,
    faceModelNeedsDownload,
    fetchClipModelStatus,
    downloadClipModel,
    fetchFaceModelStatus,
    downloadFaceModel,
  }
}
