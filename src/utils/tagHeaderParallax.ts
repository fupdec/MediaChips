/**
 * Extra image on each side of the header frame, as a fraction of the frame size.
 * The layer grows by this amount on every edge and stays centered, so scrolling
 * can shift it without opening a gap.
 */
export const TAG_HEADER_PARALLAX_OVERSCAN = 0.65

/** Share of scroll distance applied to the image. Matches the old performer-page drift. */
export const TAG_HEADER_PARALLAX_RATE = 0.65

export function tagHeaderParallaxOffset(scrollTop: number, headerHeight: number): number {
  if (!Number.isFinite(scrollTop) || !Number.isFinite(headerHeight)) return 0
  if (headerHeight <= 0 || scrollTop <= 0) return 0

  const maxOffset = headerHeight * TAG_HEADER_PARALLAX_OVERSCAN
  return Math.min(scrollTop * TAG_HEADER_PARALLAX_RATE, maxOffset)
}
