type RemountFn = () => void
type RefreshFn = () => void | Promise<void>

let remount: RemountFn | null = null
let refresh: RefreshFn | null = null

export function registerPageTagLayoutRemount(fn: RemountFn) {
  remount = fn
  return () => {
    if (remount === fn) remount = null
  }
}

export function remountPageTagLayoutItems() {
  remount?.()
}

export function registerPageTagRefresh(fn: RefreshFn) {
  refresh = fn
  return () => {
    if (refresh === fn) refresh = null
  }
}

export function refreshPageTag() {
  return refresh?.()
}
