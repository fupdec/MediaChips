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
    return {
      faces,
      notification: {
        type: statusUi.notificationType,
        textKey: statusUi.i18nKey,
      },
      taskUpdate: statusUi.updateTask
        ? {
          subtitleKey: statusUi.i18nKey,
          progress: 0,
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
