/** Pure UI reducers for face-detection NDJSON stream events. */

export type FaceDetectStatusUi = {
  notificationType: 'info' | 'success'
  i18nKey: string
  /** When true, task subtitle updates and progress resets to 0. */
  updateTask: boolean
}

const STATUS_UI: Record<string, FaceDetectStatusUi> = {
  downloading_detect: {
    notificationType: 'info',
    i18nKey: 'settings_labels.database.face_detect_model_downloading',
    updateTask: true,
  },
  detect_ready: {
    notificationType: 'success',
    i18nKey: 'settings_labels.database.face_detect_model_downloaded',
    updateTask: false,
  },
  downloading_gender: {
    notificationType: 'info',
    i18nKey: 'settings_labels.database.face_detect_gender_downloading',
    updateTask: true,
  },
  gender_ready: {
    notificationType: 'success',
    i18nKey: 'settings_labels.database.face_detect_gender_downloaded',
    updateTask: false,
  },
  downloading_align: {
    notificationType: 'info',
    i18nKey: 'settings_labels.database.face_match_align_downloading',
    updateTask: true,
  },
  downloading_embed: {
    notificationType: 'info',
    i18nKey: 'settings_labels.database.face_match_embed_downloading',
    updateTask: true,
  },
  embed_ready: {
    notificationType: 'success',
    i18nKey: 'settings_labels.database.face_match_embed_downloaded',
    updateTask: false,
  },
}

export function isFaceDetectModelReady(status: unknown): boolean {
  return ['downloaded', 'loaded'].includes(String(status || ''))
}

/** Single-item review dialog suggests tags; multi-item applies them during scan. */
export function resolveFaceDetectApplyTags(mediaCount: number): boolean {
  return mediaCount !== 1
}

export function resolveFaceDetectStatusUi(phase: unknown): FaceDetectStatusUi | null {
  if (phase == null) return null
  return STATUS_UI[String(phase)] || null
}

/**
 * Apply shared status-phase notifications/task updates.
 * Returns the phase string when handled, otherwise null.
 */
export function applyFaceDetectStatusEvent(
  event: {type?: unknown; phase?: unknown},
  handlers: {
    notify: (notification: {type: 'info' | 'success'; textKey: string}) => void
    updateTask?: (update: {subtitleKey: string; progress?: number}) => void
  },
): string | null {
  if (event.type !== 'status') return null
  const phase = event.phase == null ? '' : String(event.phase)
  const statusUi = resolveFaceDetectStatusUi(phase)
  if (!statusUi) return null

  if (statusUi.updateTask && handlers.updateTask) {
    handlers.updateTask({
      subtitleKey: statusUi.i18nKey,
      progress: typeof (event as {percent?: number}).percent === 'number'
        ? Number((event as {percent?: number}).percent)
        : 0,
    })
  }
  // Avoid toast spam while percent ticks during model download.
  const percent = (event as {percent?: number}).percent
  if (percent == null || percent <= 0 || !statusUi.updateTask) {
    handlers.notify({
      type: statusUi.notificationType,
      textKey: statusUi.i18nKey,
    })
  }
  return phase
}

export type FaceDetectStreamState = {
  faces: number
}

export type FaceDetectStreamEffect = {
  faces: number
  taskUpdate?: {
    subtitleKey: string
    subtitleParams?: Record<string, string | number>
    progress?: number
  }
  notification?: {
    type: 'info' | 'success'
    textKey: string
  }
  errorMessage?: string
}

export function reduceFaceDetectStreamEvent(
  event: {
    type?: unknown
    phase?: unknown
    faces?: unknown
    processed?: unknown
    total?: unknown
    message?: unknown
    percent?: unknown
  },
  state: FaceDetectStreamState,
  options: {defaultTotal: number},
): FaceDetectStreamEffect {
  let faces = state.faces

  if (event.type === 'progress') {
    faces = Number(event.faces || faces)
    const processed = Number(event.processed || 0)
    const total = Number(event.total || options.defaultTotal)
    return {
      faces,
      taskUpdate: {
        subtitleKey: 'media.adding.face_detection_progress',
        subtitleParams: {
          processed,
          total,
          remaining: Math.max(total - processed, 0),
        },
        progress: total ? Math.min((processed / total) * 100, 100) : 0,
      },
    }
  }

  if (event.type === 'status') {
    const statusUi = resolveFaceDetectStatusUi(event.phase)
    if (!statusUi) return {faces}
    const percent = typeof event.percent === 'number' ? event.percent : undefined
    const shouldNotify = percent == null || percent <= 0 || !statusUi.updateTask
    return {
      faces,
      notification: shouldNotify
        ? {
          type: statusUi.notificationType,
          textKey: statusUi.i18nKey,
        }
        : undefined,
      taskUpdate: statusUi.updateTask
        ? {
          subtitleKey: statusUi.i18nKey,
          progress: percent ?? 0,
        }
        : undefined,
    }
  }

  if (event.type === 'complete') {
    faces = Number(event.faces || faces)
    return {faces}
  }

  if (event.type === 'error') {
    return {
      faces,
      errorMessage: String(event.message || 'Face detection failed'),
    }
  }

  return {faces}
}
