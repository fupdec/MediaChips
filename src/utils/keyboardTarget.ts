/**
 * True when keyboard input should go to a text field / editable control
 * instead of global hotkeys. Checks both the event target and activeElement
 * (Vuetify fields and dialogs can disagree briefly).
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const candidates: Element[] = []
  if (target instanceof Element) candidates.push(target)
  if (document.activeElement instanceof Element) {
    candidates.push(document.activeElement)
  }

  for (const el of candidates) {
    const tag = el.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    if ((el as HTMLElement).isContentEditable) return true
    if (el.closest(
      'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"]',
    )) {
      return true
    }
  }
  return false
}

/** True when a Vuetify dialog / menu / overlay is open and should block page hotkeys. */
export function isBlockingOverlayOpen(): boolean {
  return Boolean(document.querySelector('.v-overlay--active'))
}
