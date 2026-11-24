/**
 * `transition` for card thumbnails (`<v-img>`).
 *
 * Vuetify's `:transition="false"` still renders a Vue <Transition name="">, which adds and
 * removes enter classes and reads getComputedStyle on every image that mounts — a forced
 * style recalculation per thumbnail while a grid scrolls. `css: false` makes the
 * Transition inert, so images simply appear.
 */
export const IMG_NO_TRANSITION = {css: false} as const
