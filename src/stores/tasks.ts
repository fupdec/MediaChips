import { defineStore } from 'pinia'
import { getRandomId } from '@/services/formatUtils'
import type { TaskItem } from '@/types/stores'
import { scheduleDesktopChromeSync } from '@/services/desktopChrome'
import { normalizeMdiIconName } from '@/utils/mdiIcon'

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
  addedMediaTypeId: number | null
  addedMediaType: string | null
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
  /** When true, successful adds are queued into the media Inbox pending-review list. */
  fromInbox: boolean
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
      addedMediaTypeId: null,
      addedMediaType: null,
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
      fromInbox: false,
    } as MediaAddingState,
  }),
  actions: {
    setTask(data: Partial<TaskItem> = {}) {
      const id = `task_${getRandomId()}`
      const {icon, ...rest} = data
      this.list.push({
        ...rest,
        id,
        icon: icon != null ? normalizeMdiIconName(String(icon), 'cog') : icon,
      })
      scheduleDesktopChromeSync()
      return id
    },
    updateTask(id: string, data: Partial<TaskItem>) {
      const x = this.list.findIndex(i => i.id === id)
      if (x > -1) {
        const patch = {...data}
        if (typeof patch.icon === 'string') {
          patch.icon = normalizeMdiIconName(patch.icon, 'cog')
        }
        for (const k in patch) {
          this.list[x][k] = patch[k]
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
