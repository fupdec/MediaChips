import {onBeforeUnmount, onMounted, ref, type Ref} from 'vue'
import {useI18n} from 'vue-i18n'

/** Header button shape accepted by DialogHeader. */
export interface EditDialogHeaderButton {
  icon?: string
  text?: string
  title?: string
  color?: string
  outlined?: boolean
  /** Legacy field kept by the tag dialog's original buttons; DialogHeader ignores it. */
  variant?: string
  disabled?: boolean
  loading?: boolean
  order?: number
  action?: () => void | Promise<void>
}

export interface EditDialogFetchAction {
  icon: string
  text: string
  action: () => void | Promise<void>
}

interface EditComponentLike {
  save?: () => Promise<boolean>
  isDirty?: () => boolean
}

/**
 * Shared header actions for every edit dialog (tag, media, …) so they look and
 * order the same: Delete (low emphasis) → data fetchers → Save (primary).
 */
export function useEditDialogButtons() {
  const {t} = useI18n()

  function build(opts: {
    onDelete?: () => void | Promise<void>
    fetchers?: EditDialogFetchAction[]
    onSave: () => void | Promise<void>
  }): EditDialogHeaderButton[] {
    const list: EditDialogHeaderButton[] = []
    if (opts.onDelete) {
      list.push({icon: 'delete', text: t('common.delete'), color: 'error', outlined: true, order: 0, action: opts.onDelete})
    }
    ;(opts.fetchers ?? []).forEach((f, i) => {
      list.push({icon: f.icon, text: f.text, color: 'info', outlined: true, order: 10 + i, action: f.action})
    })
    list.push({icon: 'content-save', text: t('common.save'), color: 'success', outlined: false, order: 100, action: opts.onSave})
    return list
  }

  return {build}
}

/**
 * Shared close / unsaved-changes / Ctrl+S behaviour for edit dialogs.
 */
export function useEditDialogGuard(opts: {
  isOpen: () => boolean
  setOpen: (show: boolean) => void
  editingComponent: Ref<EditComponentLike | null>
  save: () => void | Promise<void>
}) {
  const formDirty = ref(false)
  const unsavedConfirm = ref(false)

  function forceClose() {
    unsavedConfirm.value = false
    formDirty.value = false
    opts.setOpen(false)
  }

  function requestClose() {
    if (formDirty.value || opts.editingComponent.value?.isDirty?.()) {
      unsavedConfirm.value = true
      return
    }
    forceClose()
  }

  function onVisibilityChange(show: boolean) {
    if (show) {
      opts.setOpen(true)
      return
    }
    requestClose()
  }

  function onSaveHotkey(event: KeyboardEvent) {
    if (!opts.isOpen()) return
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return
    event.preventDefault()
    void opts.save()
  }

  onMounted(() => window.addEventListener('keydown', onSaveHotkey))
  onBeforeUnmount(() => window.removeEventListener('keydown', onSaveHotkey))

  return {formDirty, unsavedConfirm, forceClose, requestClose, onVisibilityChange}
}
