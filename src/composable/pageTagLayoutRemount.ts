type RemountFn = () => void

let remount: RemountFn | null = null

export function registerPageTagLayoutRemount(fn: RemountFn) {
  remount = fn
  return () => {
    if (remount === fn) remount = null
  }
}

export function remountPageTagLayoutItems() {
  remount?.()
}
