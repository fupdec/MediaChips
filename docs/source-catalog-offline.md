# Catalog updates and offline originals

NAS (SFTP, FTP, FTPS, WebDAV) and Google Drive folders expose **Reconcile this folder** under Sources. The scan includes subfolders and all supported media formats. A successful scan adds new files, refreshes source versions and file sizes, and marks missing originals unavailable. The result lists new, changed and missing files. It never deletes cards or modifies user titles, chips, values, ratings, marks or playlists.

A scan stages its inventory in memory and commits it in one SQLite transaction only after every directory and continuation page succeeds. Cancellation, connection errors, invalid continuations, application exit or switching libraries leave the previous complete catalog intact. Scans stop rather than silently truncate above 500,000 entries; the displayed report includes the first 500 changes with complete counts.

NAS can compare existing imported paths on the first scan. Drive IDs do not encode parent folders, so the first successful scan establishes folder membership; later scans detect files missing from that inventory. A renamed NAS path appears as missing plus new. A Drive rename retains its resource ID and card.

Schedules are persisted per folder and library. The UI offers hourly, daily and weekly updates; the API also accepts intervals of at least 15 minutes. A server timer checks due roots every 30 seconds. Updates run while the MediaChips server is running, resume after restart, and retry failures at the configured interval. Jobs sharing a source run one at a time. Overdue roots wait for the source to become free.

**Save for offline** is a separate cancellable job in each remote media card. Originals are saved on the MediaChips server, not in the browser's storage. Each library has its own quota, initially 5 GiB; change it under Sources. Removing a copy only removes cached bytes. Reducing the quota below current usage is rejected. There is no automatic eviction of saved copies.

Downloads check the provider version before and after copying, count actual bytes, and publish by renaming a temporary file only after all checks pass. Quota calculations include temporary and old copies during replacement. Interrupted partial files and files orphaned by purged cards are reclaimed when the cache is accessed while idle. A copy matching the last verified catalog version supports local playback, images and HTTP Range requests even when the source is disconnected. A changed catalog version or a failed explicit version comparison makes the old copy stale. Checking a version requires a connection; offline playback uses the last verified observation.

Versions use existing adapter validators: NAS size, modification time and optional ETag; Drive size and modification time. They are provider observations, not cryptographic content hashes. Offline files are stored outside library directories and backups, under the server data directory's `offline-media/<library-path-hash>` folder. Copying a library to another path does not copy its offline originals.

Regression coverage lives in `api/services/mediaSources/catalogService.test.ts`, `api/services/mediaSources/offline.http.test.ts` and `e2e/source-catalog.spec.ts`.
