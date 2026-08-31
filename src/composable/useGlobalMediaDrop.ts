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
import {
  isOutboundMediaDragActive,
  onOutboundMediaDragChange,
} from '@/utils/mediaDragOut'
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
  let unsubscribeOutbound: (() => void) | undefined
  let usedFallbackListeners = false
  /** dragover stops when the cursor leaves the window; clear stuck overlay. */
  let hideIfStaleTimer: ReturnType<typeof setTimeout> | null = null

  const clearHideIfStaleTimer = () => {
    if (hideIfStaleTimer) {
      clearTimeout(hideIfStaleTimer)
      hideIfStaleTimer = null
    }
  }

  const scheduleHideIfStale = () => {
    clearHideIfStaleTimer()
    hideIfStaleTimer = setTimeout(() => {
      hideIfStaleTimer = null
      resetDropzone()
    }, 200)
  }

  const resetDropzone = () => {
    clearHideIfStaleTimer()
    dropzoneActive.value = false
    window.mediaDragAPI?.resetHover?.()
  }

  const showDropzone = () => {
    if (isOutboundMediaDragActive()) {
      resetDropzone()
      return
    }
    dropzoneActive.value = true
    scheduleHideIfStale()
  }

  const isLeavingWindow = (event: DragEvent) => {
    const next = event.relatedTarget
    if (next instanceof Node && document.documentElement.contains(next)) {
      return false
    }
    const {clientX, clientY} = event
    return (
      clientX <= 0
      || clientY <= 0
      || clientX >= window.innerWidth
      || clientY >= window.innerHeight
    )
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
    if (isOutboundMediaDragActive()) {
      event.preventDefault()
      resetDropzone()
      return
    }
    if (!containsDroppedFiles(event)) return
    event.preventDefault()
    showDropzone()
    requestMainWindowFocus()
  }

  const handleHoverDragOver = (event: DragEvent) => {
    if (isOutboundMediaDragActive()) {
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'
      resetDropzone()
      return
    }
    if (!containsDroppedFiles(event)) return
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'
    }
    showDropzone()
  }

  const handleHoverDragLeave = (event: DragEvent) => {
    if (isOutboundMediaDragActive()) {
      resetDropzone()
      return
    }
    if (!containsDroppedFiles(event)) return
    if (isLeavingWindow(event)) {
      resetDropzone()
    }
  }

  const handleDrop = (event: DragEvent) => {
    if (isOutboundMediaDragActive()) {
      resetDropzone()
      return
    }
    if (!isElectronApp || !containsDroppedFiles(event)) return
    if (isExcludedDropTarget(event.target)) return

    event.preventDefault()
    event.stopPropagation()
    resetDropzone()

    const paths = collectDroppedPaths(event)
    const mediaTypeId = resolveMediaTypeId(paths)
    const hasFilePayload = Boolean(
      event.dataTransfer?.files?.length
      || Array.from(event.dataTransfer?.items || []).some((item) => item.kind === 'file'),
    )

    // Internal UI drags (chips, lists) can look like empty file drags — ignore silently.
    if (!paths.length && !hasFilePayload) return

    if (!paths.length || mediaTypeId == null) {
      setNotification({
        type: 'warning',
        title: t('media.adding.files'),
        text: t('media.adding.no_matching_files'),
      })
      return
    }

    void startDroppedMediaAdding({
      paths,
      mediaTypeId,
      mediaTypes: appStore.mediaTypes,
      tasksStore,
      eventBus,
    })
  }

  onMounted(() => {
    if (!isElectronApp || isStandalonePlayerRoute(route)) return

    unsubscribeOutbound = onOutboundMediaDragChange((active) => {
      if (active) resetDropzone()
    })

    if (window.mediaDragAPI?.onHoverChange) {
      unsubscribeHover = window.mediaDragAPI.onHoverChange((active) => {
        if (active) {
          showDropzone()
          if (!isOutboundMediaDragActive()) requestMainWindowFocus()
        } else {
          resetDropzone()
        }
      })
    }

    // Always listen in renderer too — preload hover can race on macOS re-entry.
    usedFallbackListeners = true
    document.addEventListener('dragenter', handleHoverDragEnter, true)
    document.addEventListener('dragover', handleHoverDragOver, true)
    document.addEventListener('dragleave', handleHoverDragLeave, true)

    document.addEventListener('drop', handleDrop, true)
    window.addEventListener('dragend', resetDropzone)
  })

  onBeforeUnmount(() => {
    unsubscribeHover?.()
    unsubscribeOutbound?.()
    clearHideIfStaleTimer()

    if (usedFallbackListeners) {
      document.removeEventListener('dragenter', handleHoverDragEnter, true)
      document.removeEventListener('dragover', handleHoverDragOver, true)
      document.removeEventListener('dragleave', handleHoverDragLeave, true)
    }

    document.removeEventListener('drop', handleDrop, true)
    window.removeEventListener('dragend', resetDropzone)
  })

  return {
    dropzoneActive,
    resetDropzone,
  }
}
