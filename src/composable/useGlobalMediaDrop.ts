import {onBeforeUnmount, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute} from 'vue-router'
import {detectAppPlatform} from '@/composable/useAppPlatform'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useTasksStore} from '@/stores/tasks'
import {useEventBus} from '@/utils/eventBus'
import {
  collectDroppedPaths,
  containsDroppedFiles,
  startDroppedMediaAdding,
} from '@/utils/mediaDrop'
import {getDefaultMediaTypeId, inferMediaTypeFromPaths} from '@/utils/mediaType'
import {isStandalonePlayerRoute} from '@/utils/playerWindow'
import {setNotification} from '@/services/notificationService'

const EXCLUDED_DROP_SELECTORS = [
  'input',
  'textarea',
  '[contenteditable="true"]',
  '.home-dropzone',
  '.filepond--root',
  '.meta-assignment-board',
  '.media-type-preview-card__drop-slot',
]

function isExcludedDropTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return EXCLUDED_DROP_SELECTORS.some((selector) => target.closest(selector))
}

function requestMainWindowFocus() {
  window.electronAPI?.invoke?.('focusMainWindow').catch(() => {})
}

export function useGlobalMediaDrop() {
  const {t} = useI18n()
  const route = useRoute()
  const appStore = useAppStore()
  const itemsStore = useItemsStore()
  const tasksStore = useTasksStore()
  const eventBus = useEventBus()
  const isElectronApp = detectAppPlatform().isElectron

  const dropzoneActive = ref(false)
  let unsubscribeHover: (() => void) | undefined
  let usedFallbackListeners = false

  const resetDropzone = () => {
    dropzoneActive.value = false
    window.mediaDragAPI?.resetHover?.()
  }

  const showDropzone = () => {
    dropzoneActive.value = true
  }

  const resolveMediaTypeId = (paths: string[]) => {
    const inferredType = inferMediaTypeFromPaths(paths, appStore.mediaTypes)
    if (inferredType?.id) return inferredType.id

    const routeMediaTypeId = Number(route.query.mediaTypeId)
    if (Number.isFinite(routeMediaTypeId) && routeMediaTypeId > 0) {
      return routeMediaTypeId
    }

    const environmentMediaTypeId = itemsStore.environment?.media_type_id
    if (environmentMediaTypeId != null) return environmentMediaTypeId

    return getDefaultMediaTypeId(appStore.mediaTypes)
  }

  const handleHoverDragEnter = (event: DragEvent) => {
    if (!containsDroppedFiles(event)) return
    event.preventDefault()
    showDropzone()
    requestMainWindowFocus()
  }

  const handleHoverDragOver = (event: DragEvent) => {
    if (!containsDroppedFiles(event)) return
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'
    }
    showDropzone()
  }

  const handleDrop = (event: DragEvent) => {
    if (!isElectronApp || !containsDroppedFiles(event)) return
    if (isExcludedDropTarget(event.target)) return

    event.preventDefault()
    event.stopPropagation()
    resetDropzone()

    const paths = collectDroppedPaths(event)
    const mediaTypeId = resolveMediaTypeId(paths)

    if (!paths.length || mediaTypeId == null) {
      setNotification({
        type: 'warning',
        title: t('media.adding.files'),
        text: t('media.adding.no_matching_files'),
      })
      return
    }

    startDroppedMediaAdding({
      paths,
      mediaTypeId,
      mediaTypes: appStore.mediaTypes,
      tasksStore,
      eventBus,
    })
  }

  onMounted(() => {
    if (!isElectronApp || isStandalonePlayerRoute(route)) return

    if (window.mediaDragAPI?.onHoverChange) {
      unsubscribeHover = window.mediaDragAPI.onHoverChange((active) => {
        if (active) {
          showDropzone()
          requestMainWindowFocus()
        } else {
          resetDropzone()
        }
      })
    } else {
      usedFallbackListeners = true
      document.addEventListener('dragenter', handleHoverDragEnter, true)
      document.addEventListener('dragover', handleHoverDragOver, true)
    }

    document.addEventListener('drop', handleDrop, true)
    window.addEventListener('dragend', resetDropzone)
  })

  onBeforeUnmount(() => {
    unsubscribeHover?.()

    if (usedFallbackListeners) {
      document.removeEventListener('dragenter', handleHoverDragEnter, true)
      document.removeEventListener('dragover', handleHoverDragOver, true)
    }

    document.removeEventListener('drop', handleDrop, true)
    window.removeEventListener('dragend', resetDropzone)
  })

  return {
    dropzoneActive,
    resetDropzone,
  }
}
