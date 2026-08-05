/** Thin HTML tag strip + whitespace collapse (marks / plain titles). */
export function stripHtmlTags(value: string): string {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
