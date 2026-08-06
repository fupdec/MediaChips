/**
 * Drop MDI eot/ttf/woff urls so Vite only emits woff2 (~394KB) for Chromium/Electron.
 */
export function stripMdiLegacyFontUrls(css) {
  return css
    .replace(/\s*src:\s*url\([^)]+\.eot[^)]*\);\s*/g, '\n  ')
    .replace(/url\([^)]+\.eot[^)]*\)\s*format\(["']embedded-opentype["']\),\s*/g, '')
    .replace(/,\s*url\([^)]+\.woff(?!2)[^)]*\)\s*format\(["']woff["']\)/g, '')
    .replace(/,\s*url\([^)]+\.ttf[^)]*\)\s*format\(["']truetype["']\)/g, '')
}
