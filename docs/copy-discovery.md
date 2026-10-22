# Background discovery of existing copies

Open **Settings → Database & maintenance → Find duplicates → Find and link file
copies**, or expand **File copies** in a media card. Enter one server folder or
file path per line and start the background search. A card-level search targets
that card. The settings search considers every active card, across media types.

Local paths refer to the MediaChips server, including disks mounted there. Remote
folders/files can be entered as `nas://<connection-id>/<relative-path>` or
`gdrive://<folder-or-file-id>`. Discovery reads selected search scopes. Automatic
triggers use the same queue, verification methods and attachment rules.

## Automatic launches

The three switches under **Find duplicates** are enabled by default and can be
changed independently:

- **Find copies when a known source returns** checks selected local search roots
  and watched folders on the server every five seconds. An unavailable path becoming
  available, or a changed device/inode at the same path, queues discovery. The stored
  baseline survives restarts. An initial manual check already covering a root is
  not duplicated. NAS credential replacement and successful Drive OAuth reconnection
  also notify discovery for that connection's selected roots.
- **Find copies after import** receives successful local single/bulk imports and
  NAS/Drive imports. New references also request a check of known search scopes.
  Explicitly imported folders are remembered; individual file notifications are
  transient and do not expand a selection to its parent directory.
- **Find copies when folders are updated** receives completed source reconciliation,
  successful first-page NAS/Drive browser refreshes, local watcher full scans and
  settled create/change events. The discovery worker performs its own complete
  inventory before attachment. A failed/cancelled reconciliation does not notify it.

Known scopes come from manual discovery selections, selected bulk-import folders,
currently enabled watched folders and saved source-catalog roots. Reconnecting one
scope can recheck other known scopes whose previous reference was offline. Unrelated
volumes are not traversed. Local exclusions and literal bulk-import exclusion
fragments are carried into the queued scan. Stopping watch for a folder removes its
watch-only scope; scopes explicitly selected for search/import remain known.

Callbacks only journal metadata notifications; they do not hash or download originals.
Notifications debounce for two seconds, with a ten-second maximum delay for a continuous
burst. A request received during a running job keeps a newer generation and creates
one follow-up after that job finishes. Pending notifications survive restart. Work
for different connections is split into separate jobs so an unavailable NAS does not
invalidate a local inventory. Known disconnected local roots wait for availability;
permission failures and probe timeouts preserve the previous observation. Failed or
stopped jobs do not retry endlessly without another event or explicit retry.

Each job displays why it started: import, folder update or source availability.
Disabling a switch prevents new launches of that kind, including notifications still
waiting for debounce; jobs already submitted retain their usual Stop action. Automatic
reconnect detection runs while the server is up, independently of a browser connection.
Live local file changes use the existing folder watcher lifecycle. Scheduled remote
reconciliation continues to use the existing server-side catalog schedule.

This version recognizes returns at known paths. Volume UUID discovery and automatic
remapping to a different drive letter or mount point are not implemented. Existing
cards remain separate; these triggers do not add automatic metadata-card merges.
Schema migrations `0040_copy_discovery_triggers` and `0041_copy_discovery_automation`
preserve old manual jobs and add the persistent notification/observation state.

## Verification and recovery

The server first lists metadata and exposes candidates of the same exact byte
size, independently of their names. It indexes both primary originals and retained
copies. It then reads and compares candidates in the background. Missing stored
fingerprints are computed from a readable reference; an offline primary does not
prevent using another retained copy of that card. Unsupported files, temporary
`.mediachips-*` / `.part` files and local symbolic links are skipped.

The library's existing full-verification setting is captured when a job is created.
The default compares size and oshash, reading the first and last 64 KiB of large
files. Files of at most eight bytes use SHA-256. Strict mode compares full SHA-256
and reads all bytes of each required file. Sampled matches retain their explicit
oshash method; they do not inherit full verification from a reference. Existing
SHA-256 evidence is preserved for the same observed version, and strict comparison
must agree with the card's retained full-hash evidence, even if those files are
currently offline. Unchanged reference reads are reused within the running job.

An unowned file matching one card is automatically added to that card's copies.
The reference and new copy are checked again for version changes before commit.
Unavailable possible reference cards prevent an assumption of uniqueness. Multiple
possible cards appear with their names and paths; selecting one queues a fresh
comparison against that card. Files already owned by a card are reported as already
cataloged. Existing cards are never automatically merged. No original bytes, titles,
chips, marks, ratings or playback preferences are removed or rewritten by discovery.

**Stop** aborts active reads and leaves completed attachments in place. **Continue /
retry** rechecks the inventory and retries pending/failed files. Closing the dialog
or refreshing the browser does not stop work. Jobs, item states and comparison
methods are saved in the library database by migration `0039_copy_discovery`.
After a server restart, unfinished jobs resume and completed attachments are not
repeated. A changed file fails its old attempt and is observed again on retry.
Incomplete directory listings never proceed to automatic attachment.

**Unlink and ignore this match** removes the registered copy without deleting its
file. The rejected `(path, observed version, card)` association is remembered so a
later discovery does not recreate it. A changed source version may be proposed
again. The last retained copy remains protected by the existing unlink operation.

One discovery job runs at a time. It shares source locks with managed original
operations and catalog updates, so a move or transfer cannot race attachment.
Library/connection changes and stale catalog snapshots prevent late publication.
The current limit is 32 input roots and 100,000 discovered media files/directories.
The UI shows the latest 20 jobs and up to 200 results per job, prioritizing conflicts
and errors; counts include all items. Remote validation uses adapter fixtures, not
live NAS/Drive interoperability tests.

## API

- `POST /api/copy-discovery/jobs` accepts `{roots: [{key, connectionId?}], mediaId?}`
  and returns HTTP 202. Local keys must be absolute. Remote keys follow the source's
  existing format; connection IDs resolve through the existing credential store.
- `GET /api/copy-discovery/jobs` lists recent jobs; `GET .../jobs/:id` reads one job.
  Responses include method, phase, automatic `triggers`, per-state counts and bounded item results.
- `POST .../jobs/:id/cancel` stops a job; `POST .../jobs/:id/retry` retries it.
- `POST .../jobs/:id/items/:itemId/choose` accepts `{mediaId}` for an ambiguous item
  and queues revalidation. It only accepts one of that item's reported candidates.
- `POST .../jobs/:id/items/:itemId/undo` unlinks a successful automatic attachment
  and remembers the rejected association.

Coverage: `mediaSources/copyDiscovery.test.ts` exercises discovery, ambiguity,
verification provenance, cancellation, restart, incomplete scans, library changes,
source locks, remote ranged reads and HTTP operations. The scan-folder tests cover
single renamed candidates without a media-type selection. `copy-discovery.spec.ts`
checks the settings flow, persisted results after reload and undo in the browser.

Automation coverage: `copyDiscoveryAutomation.test.ts` exercises debounce, restart,
follow-up generations, reconnection, settings, exclusions, disconnected-root fairness
and source removal. `migrateCopyDiscoveryAutomation.test.ts` covers old queues and
schema-repaired migration recovery. Watcher tests preserve create events during
ongoing writes. `copy-discovery-auto.spec.ts` verifies saved switches and a real
bulk import that automatically attaches a copy from a previous search scope.
