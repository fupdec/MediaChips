/** Auto-enable lite bulk import when the scanned file list exceeds this count. */
export const FAST_IMPORT_AUTO_THRESHOLD = 999

/** Paths per `POST /addMediaBulk` request (client chunking of explicit file lists). */
export const MEDIA_BULK_LITE_HTTP_CHUNK = 2000

/** Rows per SQLite transaction inside one bulk request. */
export const MEDIA_BULK_LITE_TX_CHUNK = 2000

/** Parallel `stat` workers when building thin rows. */
export const MEDIA_BULK_LITE_STAT_CONCURRENCY = 64

/**
 * Cap `added[]` in the HTTP response so huge imports do not serialize
 * hundreds of thousands of path strings back to the client.
 */
export const MEDIA_BULK_LITE_ADDED_CAP = 5000
