import {watch} from 'vue'
import {useDialogsStore} from '@/stores/dialogs'
import {useNotificationsStore} from '@/stores/notifications'
import {setNotification} from '@/services/notificationService'
import type {ModelDownloadProgress} from '@/services/streamModelDownload'

export type ModelDownloadKind = 'faceDetect' | 'faceEmbed' | 'clip'

export type PendingModelDownload = {
  kind: ModelDownloadKind
  /** Display name (already translated). */
  name: string
  sizeMb: number
  download: (onProgress?: (progress: ModelDownloadProgress) => void) => Promise<void>
}

export type EnsureModelsResult = 'ok' | 'cancelled' | 'error'

function isModelStatusReady(status: unknown): boolean {
  return ['downloaded', 'loaded', 'ready'].includes(String(status || ''))
}

export {isModelStatusReady}

/** Promise wrapper around the global confirm dialog. */
export function confirmWithDialog(
  text: string,
  options: {variant?: 'confirm' | 'delete'} = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    const dialogsStore = useDialogsStore()
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
    dialogsStore.confirm.variant = options.variant || 'confirm'
    dialogsStore.confirm.text = text
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

export function formatModelDownloadConfirmText(
  models: Array<{name: string; sizeMb: number}>,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (models.length === 1) {
    return t('ai.models.confirm_one', {
      name: models[0].name,
      size: models[0].sizeMb,
    })
  }
  const list = models
    .map((model) => t('ai.models.list_item', {name: model.name, size: model.sizeMb}))
    .join('<br>')
  return t('ai.models.confirm_many', {list})
}

export function formatModelDownloadProgressText(
  model: {name: string; sizeMb: number},
  progress: ModelDownloadProgress | null | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (!progress || !(progress.percent > 0)) {
    return t('ai.models.downloading', {
      name: model.name,
      size: model.sizeMb,
    })
  }
  if (progress.etaSeconds != null && progress.etaSeconds > 0) {
    return t('ai.models.downloading_progress_eta', {
      name: model.name,
      percent: progress.percent,
      eta: formatEtaLabel(progress.etaSeconds),
    })
  }
  return t('ai.models.downloading_progress', {
    name: model.name,
    percent: progress.percent,
  })
}

export function formatEtaLabel(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * If models need download and the user did not click Download explicitly:
 * confirm → notify progress → download → notify done.
 * Returns `cancelled` if the user declines (caller should abort the parent action).
 */
export async function ensureModelsDownloaded(options: {
  models: PendingModelDownload[]
  /** True when the user clicked an explicit Download button — skip confirm. */
  explicit?: boolean
  t: (key: string, params?: Record<string, string | number>) => string
  onProgress?: (message: string) => void
}): Promise<EnsureModelsResult> {
  const pending = options.models.filter(Boolean)
  if (!pending.length) return 'ok'

  if (!options.explicit) {
    const ok = await confirmWithDialog(
      formatModelDownloadConfirmText(pending, options.t),
      {variant: 'confirm'},
    )
    if (!ok) {
      setNotification({
        type: 'info',
        text: options.t('ai.models.cancelled'),
      })
      return 'cancelled'
    }
  }

  const notifications = useNotificationsStore()

  for (const model of pending) {
    const downloadingText = formatModelDownloadProgressText(model, null, options.t)
    options.onProgress?.(downloadingText)
    const notificationId = setNotification({
      type: 'info',
      title: options.t('ai.models.downloading_title'),
      text: downloadingText,
      timeout: 0,
      progressPercent: 0,
    })
    try {
      await model.download((progress) => {
        const text = formatModelDownloadProgressText(model, progress, options.t)
        options.onProgress?.(text)
        notifications.updateNotification(notificationId, {
          text,
          progressPercent: progress.percent,
        })
      })
      notifications.closeNotification(notificationId)
      setNotification({
        type: 'success',
        title: options.t('ai.models.downloaded_title'),
        text: options.t('ai.models.downloaded', {name: model.name}),
      })
    } catch (error) {
      console.error(`Model download failed (${model.kind}):`, error)
      notifications.closeNotification(notificationId)
      setNotification({
        type: 'error',
        title: options.t('ai.models.downloading_title'),
        text: error instanceof Error ? error.message : String(error),
      })
      return 'error'
    }
  }

  return 'ok'
}

/** Known approximate sizes for confirm copy. */
export const MODEL_DOWNLOAD_SIZES_MB: Record<ModelDownloadKind, number> = {
  faceDetect: 16,
  faceEmbed: 170,
  clip: 150,
}
