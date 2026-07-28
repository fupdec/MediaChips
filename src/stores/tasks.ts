import { defineStore } from 'pinia'
import { getRandomId } from '@/services/formatUtils'
import type { TaskItem } from '@/types/stores'
import { scheduleDesktopChromeSync } from '@/services/desktopChrome'

export interface AddedMediaEntry {
  path: string
  mediaId: number
}

export interface MediaAddingDuplicate {
  path: string
  duplicate: unknown
}

export interface MediaAddingState {
  paths: string
  excluded: string
  dialogProcess: boolean
  active: boolean
  stopped: boolean
  finished: boolean
  status: string | null
  processed: string
  progress: number
  current: number
  total: number
  errors: string[]
  duplicates: MediaAddingDuplicate[]
  added: string[]
  addedMedia: AddedMediaEntry[]
  parsingTags: boolean
  suggestedTags: string[]
  videoSuggestedTags: unknown[]
  addedMediaTypeId: number | null
  addedMediaType: string | null
  recognizingObjects: boolean
  objectRecognitionProgress: number
  objectRecognitionProcessed: number
  objectRecognitionTotal: number
  objectRecognitionRemaining: number
  detectingFaces: boolean
  faceDetectionProgress: number
  faceDetectionProcessed: number
  faceDetectionTotal: number
  faceDetectionRemaining: number
  facesFound: number
  /** Task id in the notifications/tasks list for this add run. */
  notificationTaskId: string | null
  media_type_id: number | null
  is_parsing: boolean
  is_exclude: boolean
  is_check_duplicates: boolean
  skipFileScan: boolean
  directFiles: string[]
}

export const useTasksStore = defineStore('useTasksStore', {
  state: () => ({
    list: [] as TaskItem[],
    mediaAdding: {
      paths: '',
      excluded: '',
      dialogProcess: false,
      active: false,
      stopped: false,
      finished: false,
      status: '',
      processed: '',
      progress: 0,
      current: 0,
      total: 0,
      errors: [],
      duplicates: [],
      added: [],
      addedMedia: [],
      parsingTags: false,
      suggestedTags: [],
      videoSuggestedTags: [],
      addedMediaTypeId: null,
      addedMediaType: null,
      recognizingObjects: false,
      objectRecognitionProgress: 0,
      objectRecognitionProcessed: 0,
      objectRecognitionTotal: 0,
      objectRecognitionRemaining: 0,
      detectingFaces: false,
      faceDetectionProgress: 0,
      faceDetectionProcessed: 0,
      faceDetectionTotal: 0,
      faceDetectionRemaining: 0,
      facesFound: 0,
      notificationTaskId: null,
      media_type_id: null,
      is_parsing: true,
      is_exclude: false,
      is_check_duplicates: true,
      skipFileScan: false,
      directFiles: [],
    } as MediaAddingState,
  }),
  actions: {
    setTask({ title, subtitle, icon, click, action, progress }: Partial<TaskItem> = {}) {
      const id = `task_${getRandomId()}`
      this.list.push({ id, title, subtitle, icon, click, action, progress })
      scheduleDesktopChromeSync()
      return id
    },
    updateTask(id: string, data: Partial<TaskItem>) {
      const x = this.list.findIndex(i => i.id === id)
      if (x > -1) {
        for (const k in data) {
          this.list[x][k] = data[k]
        }
        scheduleDesktopChromeSync()
      }
    },
    removeTask(id: string) {
      const x = this.list.findIndex(i => i.id === id)
      if (x > -1) {
        this.list.splice(x, 1)
        scheduleDesktopChromeSync()
      }
    },
    /** Keep taskbar/dock progress in sync when media-adding updates progress outside updateTask. */
    syncDesktopChrome() {
      scheduleDesktopChromeSync()
    },
  },
})

export default useTasksStore
