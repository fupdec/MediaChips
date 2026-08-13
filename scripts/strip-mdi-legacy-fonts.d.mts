/** Drop MDI eot/ttf/woff urls; keep woff2 for Chromium/Electron. */
export function stripMdiLegacyFontUrls(css: string): string
