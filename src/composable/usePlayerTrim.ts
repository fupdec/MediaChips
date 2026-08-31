import {computed, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {usePlayerStore} from '@/stores/player'
import {useDialogsStore} from '@/stores/dialogs'
import {typedApi} from '@/services/typedApi'
import {setNotification} from '@/services/notificationService'
import {useNotificationsStore} from '@/stores/notifications'
import {openPath} from '@/services/shellService'
import {useItemsListSync} from '@/composable/itemsListSync'
import {canApplyTrim, clampTrimValue, normalizeTrimRange} from '@shared/playerTrim'
import {isVirtualZipPath} from '@shared/zipPath'
import {getApiErrorMessage} from '@/types/vue'
import {invalidateVideoThumbCaches} from '@/utils/thumbDisplayCache'
import {invalidateFileExistsCache} from '@/services/fileService'
import type {PlayerSessionContext} from '@/composable/usePlayerSession'
import type {TrimVideoJobResponse} from '@shared/api/payloads'

const POLL_MS = 700

export function usePlayerTrim(session: PlayerSessionContext | null) {
  const playerStore = usePlayerStore()
  const dialogsStore = useDialogsStore()
  const notifications = useNotificationsStore()
  const listSync = useItemsListSync()
  const {t} = useI18n()

  const video = computed(() => playerStore.playlist[playerStore.nowPlaying])
  const trimDuration = computed(() => Math.max(0, playerStore.trimEnd - playerStore.trimStart))
  const canTrim = computed(() => canApplyTrim(playerStore.trimStart, playerStore.trimEnd, playerStore.duration))
  const canOpenTrim = computed(() => (
    !playerStore.isAudioMode
    && playerStore.is_file_exists
    && Boolean(video.value?.path)
    && !isVirtualZipPath(String(video.value?.path || ''))
  ))

  let pollTimer: ReturnType<typeof setInterval> | null = null
  let progressNotificationId: number | null = null
  let activeJobId: string | null = null

  const stopPoll = () => {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  const closeProgressNotification = () => {
    if (progressNotificationId != null) {
      notifications.closeNotification(progressNotificationId)
      progressNotificationId = null
    }
  }

  const resetTrimRange = () => {
    playerStore.trimStart = 0
    playerStore.trimEnd = Math.max(0, playerStore.duration)
  }

  const exitTrimMode = () => {
    playerStore.trimMode = false
  }

  const toggleTrimMode = () => {
    if (playerStore.trimMode) {
      exitTrimMode()
      return
    }
    if (!canOpenTrim.value) return
    if (playerStore.studioMode) {
      playerStore.studioMode = false
    }
    resetTrimRange()
    playerStore.trimMode = true
    playerStore.isControlsVisible = true
  }

  const setTrimPoint = (which: 'start' | 'end', time = playerStore.currentTime) => {
    const duration = playerStore.duration
    const value = clampTrimValue(time, 0, duration)
    if (which === 'start') {
      playerStore.trimStart = Math.min(value, Math.max(0, playerStore.trimEnd - 0.25))
      return
    }
    playerStore.trimEnd = Math.max(value, Math.min(duration, playerStore.trimStart + 0.25))
  }

  const setTrimRange = (start: number, end: number) => {
    const range = normalizeTrimRange(start, end, playerStore.duration)
    playerStore.trimStart = range.start
    playerStore.trimEnd = range.end
  }

  const revealInFolder = (filePath: string) => {
    if (!filePath) return
    void openPath(filePath, true)
  }

  const exitPlayerFullscreenIfNeeded = () => {
    if (!document.fullscreenElement) return
    void document.exitFullscreen().catch(() => {})
    playerStore.fullscreen = false
  }

  const applyDeletedOriginal = async (result: {
    id: number
    path: string
    basename: string
    name: string
    ext: string
    duration?: number
  }) => {
    for (const item of playerStore.playlist) {
      if (Number(item.id) !== Number(result.id)) continue
      item.path = result.path
      item.basename = result.basename
      item.name = result.name
      item.ext = result.ext
      if (result.duration != null) item.duration = result.duration
    }
    const current = playerStore.playlist[playerStore.nowPlaying]
    invalidateFileExistsCache(result.path)
    invalidateVideoThumbCaches(result.id)
    listSync.getItemsFromDb({ids: [result.id], type: 'media'})
    if (session?.playVideoObject && current && Number(current.id) === Number(result.id)) {
      await session.playVideoObject({n: current, o: undefined})
    }
  }

  const unloadCurrentFile = () => {
    const el = playerStore.player
    if (!el) return
    el.pause()
    el.removeAttribute('src')
    el.load()
  }

  const deleteOriginal = async (
    job: Pick<TrimVideoJobResponse, 'mediaId' | 'originalPath' | 'outputPath'>,
    notificationId?: number,
  ) => {
    if (!job.outputPath) return
    try {
      unloadCurrentFile()
      const result = await typedApi.trimDeleteOriginal({
        id: job.mediaId,
        originalPath: job.originalPath,
        trimmedPath: job.outputPath,
      })
      await applyDeletedOriginal(result.data)
      if (notificationId != null) {
        notifications.closeNotification(notificationId)
      }
      setNotification({
        type: 'success',
        title: t('player.trim.deleted_title'),
        text: t('player.trim.deleted_text'),
        timeout: 6000,
      })
    } catch (error) {
      setNotification({
        type: 'error',
        title: t('player.trim.delete_failed'),
        text: getApiErrorMessage(error, t('player.trim.delete_failed')),
      })
    }
  }

  const confirmDeleteOriginal = (job: TrimVideoJobResponse, notificationId: number) => {
    exitPlayerFullscreenIfNeeded()
    dialogsStore.confirm.variant = 'delete'
    dialogsStore.confirm.checkBox = false
    dialogsStore.confirm.checkBox2 = false
    dialogsStore.confirm.checkBox2RequiresPrimary = false
    dialogsStore.confirm.checkBoxText = ''
    dialogsStore.confirm.checkBox2Text = ''
    dialogsStore.confirm.text = t('player.trim.delete_original_confirm')
    dialogsStore.confirm.action = () => {
      void deleteOriginal(job, notificationId)
    }
    dialogsStore.confirm.show = true
  }

  const showDoneNotification = (job: TrimVideoJobResponse) => {
    const originalPath = job.originalPath
    const outputPath = job.outputPath || ''
    const revealClip = outputPath || originalPath
    let notificationId = 0
    notificationId = setNotification({
      type: 'success',
      icon: 'content-cut',
      title: t('player.trim.done_title'),
      text: t('player.trim.done_text'),
      timeout: 0,
      revealPath: revealClip,
      click: () => revealInFolder(revealClip),
      actions: [
        {
          id: 'trim-show-clip',
          text: t('player.trim.show_clip'),
          icon: 'folder-open',
          action: () => revealInFolder(outputPath),
        },
        {
          id: 'trim-show-original',
          text: t('player.trim.show_original'),
          icon: 'file-video-outline',
          action: () => revealInFolder(originalPath),
        },
        {
          id: 'trim-delete-original',
          text: t('player.trim.delete_original'),
          icon: 'delete-outline',
          color: 'error',
          action: () => confirmDeleteOriginal(job, notificationId),
        },
      ],
    })
    if (outputPath) {
      invalidateFileExistsCache(outputPath)
    }
  }

  const pollJob = async (jobId: string) => {
    try {
      const response = await typedApi.getTrimJob(jobId)
      const job = response.data
      if (!job) return
      if (progressNotificationId != null) {
        notifications.updateNotification(progressNotificationId, {
          progressPercent: job.progress,
        })
      }
      if (job.status === 'running' || job.status === 'queued') return

      stopPoll()
      closeProgressNotification()
      playerStore.trimBusy = false
      activeJobId = null

      if (job.status === 'done' && job.outputPath) {
        showDoneNotification(job)
        return
      }
      if (job.status === 'cancelled') {
        setNotification({
          type: 'warning',
          title: t('player.trim.cancelled'),
        })
        return
      }
      setNotification({
        type: 'error',
        title: t('player.trim.failed'),
        text: job.error || t('player.trim.failed'),
      })
    } catch (error) {
      stopPoll()
      closeProgressNotification()
      playerStore.trimBusy = false
      activeJobId = null
      setNotification({
        type: 'error',
        title: t('player.trim.failed'),
        text: getApiErrorMessage(error, t('player.trim.failed')),
      })
    }
  }

  const applyTrim = async () => {
    const item = video.value
    if (!item?.path || playerStore.trimBusy || !canTrim.value) return

    const startSeconds = playerStore.trimStart
    const endSeconds = playerStore.trimEnd
    playerStore.trimBusy = true
    exitTrimMode()
    try {
      const response = await typedApi.trimVideo({
        id: Number(item.id),
        path: String(item.path),
        startSeconds,
        endSeconds,
      })
      const job = response.data
      activeJobId = job.id
      progressNotificationId = setNotification({
        type: 'info',
        icon: 'content-cut',
        title: t('player.trim.running'),
        timeout: 0,
        progressPercent: job.progress || 0,
        actions: [
          {
            id: 'trim-cancel',
            text: t('player.trim.cancel'),
            close: true,
            action: () => {
              if (activeJobId) void typedApi.cancelTrim(activeJobId)
            },
          },
        ],
      })
      pollTimer = setInterval(() => {
        if (activeJobId) void pollJob(activeJobId)
      }, POLL_MS)
      void pollJob(job.id)
    } catch (error) {
      playerStore.trimBusy = false
      setNotification({
        type: 'error',
        title: t('player.trim.failed'),
        text: getApiErrorMessage(error, t('player.trim.failed')),
      })
    }
  }

  watch(() => [playerStore.nowPlaying, video.value?.id, video.value?.path], () => {
    if (playerStore.trimMode) exitTrimMode()
  })

  watch(() => playerStore.duration, (duration, previous) => {
    if (!playerStore.trimMode) return
    if (playerStore.trimEnd >= (Number(previous) || 0) - 0.05) {
      playerStore.trimEnd = duration
    }
  })

  watch(() => playerStore.studioMode, (active) => {
    if (active && playerStore.trimMode) exitTrimMode()
  })

  watch(() => dialogsStore.markAdding.show, (show) => {
    if (show && playerStore.trimMode) exitTrimMode()
  })

  return {
    video,
    trimDuration,
    canTrim,
    canOpenTrim,
    toggleTrimMode,
    exitTrimMode,
    setTrimPoint,
    setTrimRange,
    applyTrim,
    resetTrimRange,
  }
}
