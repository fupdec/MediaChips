# Sources

Settings → Sources & import and Add media → Sources use the same provider panel and folder
browser for Google Drive and NAS (SFTP, FTP and FTPS). The existing
`/settings?tab=connections` link remains valid. Each provider keeps its import
selection when switching tabs. The active import tab and provider tab are remembered
in local storage across reopening and application restarts. Explicit local-file
imports still open the Files tab; unavailable tabs fall back to Files. Actions support adding a connection, checking
access, replacing credentials, disconnecting and reconnecting; disconnecting keeps
library cards and the NAS connection identity.

A connection check reads the source root. When browsing is open, a successful
check also refreshes the current folder. A successful folder listing updates the
internal last checked time. The check action sits beside the connection selector;
healthy and unverified sources do not show a separate status row. Saved credentials alone do not imply availability; availability
is the last observation, not background monitoring. Network failures, denied read
permissions and rejected/expired authentication have separate messages and recovery
actions. Forbidden Drive folders remain visible as errors; only a missing remembered
folder falls back to the root. Ambiguous server failures remain generic. HTTP 401
from Drive is exposed as an `auth_required` HTTP 409 so a remote account failure
does not lock the main MediaChips session.

The shared browser sorts by name, size and modification time, marks existing
library files and prevents selecting them for import. Favorites store folder paths
and readable Drive breadcrumb names in local storage, scoped by library, server
and connection. They contain no credentials. Favorites can be opened or removed
even if a folder is no longer accessible. Clearing browser storage removes them.

Validation uses provider transport fixtures and intercepted browser requests; it
does not assert live Google or NAS interoperability.

## Batch import

Drive and NAS use `remoteImportSelection.ts` for recursive discovery and
`remoteImportQueue.ts` for bounded requests. Discovery consumes every metadata
page, including folders beyond the browser's 5000-entry display limit. A missing
continuation or repeated page token is an error, and the affected folder stays
selected for retry. Overlapping selections are deduplicated. Exclusions match
literal path fragments, one per line, and prune matching folders before listing
them. Drive matches both browser paths and readable folder/file names. Hidden
entries follow the browser's Show hidden setting.

The shared progress view separates scanning from importing and reports files
found, cards added, existing media and skipped paths. Skipped paths include
unsupported entries and excluded files/folders; an excluded folder counts once,
without reading or counting its descendants. Existing cards found by the scan
are skipped before import. Explicit paths remain retryable even after an import
has created their cards, so tag assignment can be attempted again.

Stop cancels scanning or prevents the next import request. An active import
request finishes, including tag assignment, and its result is accounted for.
Successful paths leave the selection; failed paths, failed tag assignments and
unprocessed files stay selected. Retry remaining processes that selection. A
failed/incomplete request leaves its whole chunk selected because some writes
may already have committed; it does not automatically replay the request and
does not block later chunks. Retrying uses the server's idempotent remote
identity lookup. Library changes abort the old work and ignore late results.

Import reads directory entries and file metadata only. It creates cards and
source locations without requesting original contents. Tag parsing uses readable
paths through the same parser as local imports. Playback, previews and further
analysis remain separate operations.
