import {describe, expect, it, vi} from 'vitest'
import {
  applyFaceDetectStatusEvent,
  isFaceDetectModelReady,
  reduceFaceDetectStreamEvent,
  resolveFaceDetectApplyTags,
  resolveFaceDetectStatusUi,
} from './faceDetectStreamUi'

describe('faceDetectStreamUi', () => {
  it('recognizes ready model statuses', () => {
    expect(isFaceDetectModelReady('downloaded')).toBe(true)
    expect(isFaceDetectModelReady('loaded')).toBe(true)
    expect(isFaceDetectModelReady('missing')).toBe(false)
  })

  it('applies tags only for multi-item runs', () => {
    expect(resolveFaceDetectApplyTags(1)).toBe(false)
    expect(resolveFaceDetectApplyTags(3)).toBe(true)
  })

  it('maps download status phases to notification + optional task updates', () => {
    expect(resolveFaceDetectStatusUi('downloading_detect')).toEqual({
      notificationType: 'info',
      i18nKey: 'settings_labels.database.face_detect_model_downloading',
      updateTask: true,
    })
    expect(resolveFaceDetectStatusUi('embed_ready')).toEqual({
      notificationType: 'success',
      i18nKey: 'settings_labels.database.face_match_embed_downloaded',
      updateTask: false,
    })
    expect(resolveFaceDetectStatusUi('unknown')).toBeNull()
  })

  it('reduces progress events into task subtitle params', () => {
    const effect = reduceFaceDetectStreamEvent(
      {type: 'progress', processed: 2, total: 5, faces: 7},
      {faces: 1},
      {defaultTotal: 5},
    )
    expect(effect).toEqual({
      faces: 7,
      taskUpdate: {
        subtitleKey: 'media.adding.face_detection_progress',
        subtitleParams: {processed: 2, total: 5, remaining: 3},
        progress: 40,
      },
    })
  })

  it('reduces status events into notification effects', () => {
    const effect = reduceFaceDetectStreamEvent(
      {type: 'status', phase: 'downloading_embed'},
      {faces: 0},
      {defaultTotal: 1},
    )
    expect(effect.notification).toEqual({
      type: 'info',
      textKey: 'settings_labels.database.face_match_embed_downloading',
    })
    expect(effect.taskUpdate).toEqual({
      subtitleKey: 'settings_labels.database.face_match_embed_downloading',
      progress: 0,
    })
  })

  it('surfaces stream errors', () => {
    expect(reduceFaceDetectStreamEvent(
      {type: 'error', message: 'boom'},
      {faces: 0},
      {defaultTotal: 1},
    ).errorMessage).toBe('boom')
  })

  it('skips toast spam for mid-download percent updates', () => {
    const effect = reduceFaceDetectStreamEvent(
      {type: 'status', phase: 'downloading_detect', percent: 37},
      {faces: 0},
      {defaultTotal: 1},
    )
    expect(effect.notification).toBeUndefined()
    expect(effect.taskUpdate?.progress).toBe(37)

    const notify = vi.fn()
    applyFaceDetectStatusEvent(
      {type: 'status', phase: 'downloading_detect', percent: 37},
      {notify, updateTask: vi.fn()},
    )
    expect(notify).not.toHaveBeenCalled()
  })
})
