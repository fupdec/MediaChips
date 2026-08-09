import path from 'path-browserify'
import {typedApi} from '@/services/typedApi'
import {setNotification} from '@/services/notificationService'
import {openPath} from '@/services/shellService'
import {useTasksStore} from '@/stores/tasks'
import {getErrorResponseData} from '@/types/vue'
import {getElectronAPI, showElectronOpenDialog} from '@/services/electronBridge'

export type MarkClipsExportScope =
  | {markIds: number[]}
  | {tagId: number}

export type MarkClipsExportTranslate = (
  key: string,
  params?: Record<string, unknown>,
) => string

export type MarkClipsExportMode = 'concat' | 'folder'
export type MarkClipsExportSort = 'time' | 'shuffle' | 'selection'

const LAST_EXPORT_DIR_KEY = 'mediachips.lastMarkClipsExportDir'

function readLastExportDir(): string | null {
  try {
    const value = localStorage.getItem(LAST_EXPORT_DIR_KEY)
    return value?.trim() || null
  } catch {
    return null
  }
}

function rememberExportDir(filePath: string) {
  const dir = path.dirname(String(filePath || '').trim())
  if (!dir || dir === '.' || dir === '/') return
  try {
    localStorage.setItem(LAST_EXPORT_DIR_KEY, dir)
  } catch {
    // ignore quota / private mode
  }
}

function rememberExportFolder(folderPath: string) {
  const dir = String(folderPath || '').trim()
  if (!dir) return
  try {
    localStorage.setItem(LAST_EXPORT_DIR_KEY, dir)
  } catch {
    // ignore
  }
}

async function pickExportOutputPath(defaultName: string): Promise<string | undefined | null> {
  const api = getElectronAPI()
  if (!api?.invoke) return undefined

  const lastDir = readLastExportDir()
  const defaultPath = lastDir ? path.join(lastDir, defaultName) : defaultName

  try {
    const result = await api.invoke('dialog:saveFile', {
      defaultPath,
      write: false,
      filters: [{name: 'MP4', extensions: ['mp4']}],
    }) as {canceled?: boolean; filePath?: string}
    if (result?.canceled || !result?.filePath) return null
    rememberExportDir(result.filePath)
    return result.filePath
  } catch (error) {
    console.warn('Save dialog unavailable, using default downloads path', error)
    return undefined
  }
}

async function pickExportOutputFolder(): Promise<string | undefined | null> {
  try {
    const result = await showElectronOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    })
    if (!result || result.canceled || !result.filePaths?.length) return null
    const folder = result.filePaths[0]
    rememberExportFolder(folder)
    return folder
  } catch (error) {
    console.warn('Open directory dialog unavailable, using default downloads path', error)
    return undefined
  }
}

function revealExportedFile(filePath: string) {
  const pathValue = String(filePath || '').trim()
  if (!pathValue) return
  void openPath(pathValue, true)
}

/**
 * Pick save path → NDJSON export → tray progress → toast that reveals the file.
 * Returns false when the user cancels the save dialog or there is nothing to export.
 */
export async function runMarkClipsExport(options: {
  scope: MarkClipsExportScope
  sort?: MarkClipsExportSort
  mode?: MarkClipsExportMode
  countHint?: number
  t: MarkClipsExportTranslate
}): Promise<boolean> {
  const {scope, sort = 'time', mode = 'concat', t} = options
  const countHint = Math.max(1, Number(options.countHint) || 1)
  const tasksStore = useTasksStore()

  const picked = mode === 'folder'
    ? await pickExportOutputFolder()
    : await pickExportOutputPath(`mediachips-clips-${Date.now()}.mp4`)
  if (picked === null) return false
  const outputPath = picked || undefined

  let markIds: number[] = 'markIds' in scope ? [...scope.markIds] : []
  if ('tagId' in scope) {
    const clips = await typedApi.getMarkClips({
      tagId: scope.tagId,
      sort: sort === 'selection' ? 'time' : sort,
    })
    markIds = (clips.data?.items || [])
      .map((item) => Number(item.markId))
      .filter((id) => Number.isFinite(id) && id > 0)
    if (!markIds.length) {
      setNotification({
        type: 'warning',
        title: t('tags.play_clips_empty_title'),
        text: t('tags.play_clips_empty_text'),
      })
      return false
    }
  }

  if (!markIds.length) {
    setNotification({
      type: 'warning',
      title: t('tags.play_clips_empty_title'),
      text: t('tags.play_clips_empty_text'),
    })
    return false
  }

  const controller = new AbortController()
  const taskId = tasksStore.setTask({
    title: mode === 'folder'
      ? t('markers.export_selected_folder', {count: markIds.length || countHint})
      : t('markers.export_selected_clips', {count: markIds.length || countHint}),
    subtitle: t('markers.export_clips_progress', {
      processed: 0,
      total: markIds.length || countHint,
    }),
    icon: 'export',
    progress: 0,
    action: () => controller.abort(),
  })

  try {
    let finalPath = outputPath || ''
    await typedApi.exportMarkClips(
      {
        markIds,
        outputPath,
        sort,
        mode,
      },
      {signal: controller.signal},
      (event) => {
        if (event.type === 'progress') {
          const processed = Number(event.processed || 0)
          const total = Number(event.total || markIds.length || countHint || 1)
          if (typeof event.outputPath === 'string') finalPath = event.outputPath
          tasksStore.updateTask(taskId, {
            subtitle: t('markers.export_clips_progress', {processed, total}),
            progress: total ? Math.min((processed / total) * 100, 100) : 0,
          })
        }
        if (event.type === 'complete') {
          if (typeof event.outputPath === 'string') finalPath = event.outputPath
          if (finalPath) {
            if (mode === 'folder') rememberExportFolder(finalPath)
            else rememberExportDir(finalPath)
          }
          tasksStore.updateTask(taskId, {
            subtitle: finalPath,
            progress: 100,
            color: 'success',
            done: true,
            action: undefined,
            click: () => revealExportedFile(finalPath),
          })
        }
        if (event.type === 'error') {
          throw new Error(String(event.message || 'Export failed'))
        }
      },
    )

    if (finalPath) {
      if (mode === 'folder') rememberExportFolder(finalPath)
      else rememberExportDir(finalPath)
    }

    setNotification({
      type: 'success',
      title: mode === 'folder'
        ? t('markers.export_folder_done')
        : t('markers.export_clips_done'),
      text: t('markers.export_clips_done_text', {path: finalPath}),
      timeout: 12_000,
      revealPath: finalPath,
      click: () => revealExportedFile(finalPath),
      actions: [
        {
          id: 'reveal-clips',
          text: t('context_menu.open_files_folder'),
          icon: 'folder-open',
          action: () => revealExportedFile(finalPath),
        },
      ],
    })
    return true
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError'
    if (!isAbort) {
      tasksStore.updateTask(taskId, {
        subtitle: t('markers.export_clips_failed'),
        color: 'error',
        done: true,
        action: undefined,
      })
      setNotification({
        type: 'error',
        title: t('markers.export_clips_failed'),
        text: getErrorResponseData<{message?: string}>(error)?.message
          || (error instanceof Error ? error.message : String(error)),
      })
    } else {
      tasksStore.removeTask(taskId)
    }
    return false
  }
}
