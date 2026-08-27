/**
 * Hide overflowing chips in a clipboard-style bar and return the hidden count.
 * Expects a sibling "+N" chip matching `moreSelector`.
 */
export function recalcChipBarOverflow(
  el: HTMLElement | null | undefined,
  options: {
    chipSelector: string
    moreSelector: string
    gap?: number
  },
): number {
  if (!el) return 0

  const chips = Array.from(el.querySelectorAll<HTMLElement>(options.chipSelector))
  const overflowChip = el.querySelector<HTMLElement>(options.moreSelector)

  if (!chips.length) return 0

  for (const chip of chips) {
    chip.classList.remove('chip-bar-entry--overflow-hidden')
  }

  const containerWidth = el.clientWidth
  const gap = options.gap ?? 4

  let usedAll = 0
  for (let i = 0; i < chips.length; i++) {
    if (i > 0) usedAll += gap
    usedAll += chips[i].offsetWidth
  }

  if (usedAll <= containerWidth) return 0

  let overflowWidth = 40 + gap
  if (overflowChip) {
    overflowChip.classList.add('chip-bar-entry--more-measure')
    overflowWidth = overflowChip.offsetWidth + gap
    overflowChip.classList.remove('chip-bar-entry--more-measure')
  }

  const limit = Math.max(0, containerWidth - overflowWidth)
  let used = 0
  let visible = 0
  for (const chip of chips) {
    if (visible > 0) used += gap
    if (used + chip.offsetWidth > limit) break
    used += chip.offsetWidth
    visible++
  }

  for (let i = 0; i < chips.length; i++) {
    chips[i].classList.toggle('chip-bar-entry--overflow-hidden', i >= visible)
  }
  return chips.length - visible
}
