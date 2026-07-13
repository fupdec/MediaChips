export interface VideoBigPreviewOrigin {
  top: string
  left: string
  width: string
  height: string
}

export function captureVideoBigPreviewOrigin(element: HTMLElement): VideoBigPreviewOrigin {
  const rect = element.getBoundingClientRect()

  return {
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  }
}

export function applyVideoBigPreviewOrigin(
  element: HTMLElement,
  origin: VideoBigPreviewOrigin,
): void {
  element.style.setProperty('--preview-top', origin.top)
  element.style.setProperty('--preview-left', origin.left)
  element.style.setProperty('--preview-width', origin.width)
  element.style.setProperty('--preview-height', origin.height)
}

export function applyVideoBigPreviewStartFrame(
  element: HTMLElement,
  origin: VideoBigPreviewOrigin,
): void {
  applyVideoBigPreviewOrigin(element, origin)
  element.style.position = 'fixed'
  element.style.top = origin.top
  element.style.left = origin.left
  element.style.width = origin.width
  element.style.height = origin.height
  element.style.right = 'auto'
  element.style.bottom = 'auto'
}

export function clearVideoBigPreviewOrigin(element: HTMLElement): void {
  element.style.removeProperty('--preview-top')
  element.style.removeProperty('--preview-left')
  element.style.removeProperty('--preview-width')
  element.style.removeProperty('--preview-height')
}
