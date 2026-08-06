/** Drop MDI eot/ttf urls so Vite never emits those ~2.4MB font assets. */
export function stripMdiLegacyFontUrls(css) {
  return css
    .replace(/\s*src:\s*url\([^)]+\.eot[^)]*\);\s*/g, '\n  ')
    .replace(/url\([^)]+\.eot[^)]*\)\s*format\(["']embedded-opentype["']\),\s*/g, '')
    .replace(/,\s*url\([^)]+\.ttf[^)]*\)\s*format\(["']truetype["']\)/g, '')
}
