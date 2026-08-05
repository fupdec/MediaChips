/** FFmpeg seek timestamp for mark thumbs: HH:MM:SS.mmm */
export function formatMarkTimestamp(time: number): string {
  return new Date(1000 * time).toISOString().substr(11, 12)
}
