# Media cards, connections and original locations

`media.id` identifies a library card. Chips, values, ratings and timeline marks
continue to reference that ID. A connection or credential change does not recreate
the card. Existing `media.path` values remain compatibility addresses, including
local paths, `nas://` URIs with or without a revision, and `gdrive://` URIs.

`sourceConnections` stores a provider (`nas` or `gdrive`), non-secret configuration
and a credential reference. Existing NAS rows default to `nas`. NAS references
address the existing host-local encrypted vault. The single existing Drive
connection uses `google-drive` and the logical reference `google-drive:default`,
which resolves to the existing process-level OAuth configuration and token store.
Tokens and NAS passwords never enter the catalog. Multiple Drive accounts remain
outside this model's current implementation.

`mediaLocations` links a card to a connection and a provider resource key. NAS
keys are paths relative to the configured root; Drive keys are provider file IDs.
Version validators identify the observed content (size/mtime for NAS, size and
modifiedTime for Drive), rather than claiming to be content hashes. Availability
and the last successful verification timestamp describe the latest observation;
they are not continuous network monitoring.

`resolveMediaLocation` reads the original from stored locations without accessing
credentials or the network. The compatibility URI selects the original when a
merged card has several locations; a single stored location is authoritative even
if its resource key changed. Local paths keep the existing filesystem workflow.

## Reading and supported actions

`SourceReadAdapter` defines paginated listing, stat, byte-range reading and
AbortSignal cancellation. NAS and Drive import and streaming use implementations
of this contract. NAS pagination returns continuation offsets over a sorted fresh
listing; it is not a server snapshot. Drive forwards the provider's page token.
Callers own cancellation signals; `close()` releases the NAS session.

Adapters and connection responses expose `view`, `seek`, `download`, `move` and
`delete`. Both current adapters implement the first three; move and delete are
false because original-file writes are not implemented. These capabilities
describe implemented operations. Network availability, authentication and the
account's read permissions are still checked on each request.

## Migration and compatibility

Migration `0033_source_providers` adds columns to the existing tables. The
idempotent `migrateMediaLocations` backfill runs after Drizzle migration and after
schema repair, without network requests or opening the credential vault. It
preserves all existing card and location IDs, paths and metadata associations,
including cards in Trash. Local files are not copied into remote tables.

Old Drive cards gain a location with an unknown version. Existing NAS locations
remain intact. Legacy NAS URIs without a location are linked only when their
connection still exists; an encoded revision is retained until a successful stat
can validate it. Missing connections do not cause card deletion. Once any location
exists for a card, backfill never recreates a stale compatibility address.

Changing a NAS password validates the new credentials, keeps the connection ID
and credential reference, and invalidates old playback sessions. Opening the same
card creates a fresh session using the new password. Drive OAuth replacement
similarly preserves the card, connection and location identities.

Regression tests upgrade a copy of a pre-provider fixture and compare cards,
chips, values and marks before/after; they also cover repeated migration,
legacy NAS playback, deduplication, credential replacement and common adapter
range/cancellation behavior. Real NAS and Drive interoperability is not asserted
by these fixture and transport tests.

## Metadata and catalog filters

Remote cards use the existing chips, tag/value links, ratings, favorites and
bookmark editor. The same bulk edit accepts local, NAS and Drive card IDs together;
metadata writes do not require credentials, a readable original or a writable
source. Name, bookmark and tag search continues to query the MediaChips database.
Custom chip values use the existing typed filters.

The media filter picker includes Source (local files, NAS, Drive, web links and
individual saved connections) and Availability. Both participate in saved filters,
AND/OR combinations, pagination, select-all IDs and dynamic playlist summaries.
Connection labels come from catalog configuration without opening the vault or
listing remote directories. Retained locations take precedence over compatibility
URIs; legacy cards without a location remain searchable by their URI's source.
Merged cards match any retained connection, and a local original retains its local
source classification.

Availability is the latest stored observation, never a live connection probe.
A card is available if any location was recorded available, unknown if it has an
unverified alternative or local original, and unavailable otherwise. Local and
legacy cards without observations are unknown. Explicit NAS disconnect or Drive
logout marks that connection's locations unavailable without removing cards,
chips or marks. Successful verification can make them available again. Changes
to these observations invalidate filtered totals and grouping caches.

`mediaCatalogSources.test.ts` exercises offline mixed bulk edits, individual
edits, catalog search, typed chip filters, saved rows, pagination, ID selection,
summaries, merged locations and the legacy filter worker against a migrated test
database. `remote-metadata.spec.ts` covers the editor and filter controls with
disconnected-source responses in the browser.

## Verified copies of one file

Migration `0037_verified_media_copies` adds `verifiedMediaCopies` and
`mediaCopyPreferences`. A card owns all chips, values and marks; a copy stores an
address, a full SHA-256, byte count, provider validator and last verification time.
Local files remain ordinary filesystem paths. NAS and Drive use the existing
connections and credential stores. Copy rows contain no credentials.

The card editor's **File copies** panel lists locations, selects a preferred copy,
adds an existing local file after comparison, and unlinks a copy without deleting
its file. The last copy cannot be unlinked. Unlinking the compatibility original
promotes a retained address. Import NAS/Drive copies as cards and select **Merge**
to consolidate them. An already cataloged local path must use the same merge flow
so its chips are retained.

Merging now reads every selected file and retained copy completely through the
source adapters, checks the byte count and stat before/after reading, and compares
full SHA-256 hashes. Sampled content fingerprints, oshash, filenames, size and
visual similarity never authorize this operation. No cards, chips or locations
change if a source is unreadable, its version changes, the active library changes,
or content differs. Identical bytes can have different names and timestamps.
Different edits and different encodings remain separate cards. The old option to
delete losing files is rejected: copy consolidation preserves every file.

Playback uses the preference first, then local copies, then other verified copies.
A source connection/stat attempt has a 30-second deadline before fallback. A changed
validator requires full hash verification again; a different montage cannot silently
inherit the original timeline. Stream URLs pin a copy ID and version, so range
requests cannot silently switch files. Images use the same source selection.
The existing offline cache can be used when its source version matches a retained
verified copy. Availability remains a last recorded observation, and catalog
source/availability filters include retained local, NAS and Drive copies.

Existing locations are not automatically declared identical by migration. Legacy
cards retain their original playback behavior; unverified alternatives cannot be
selected as preferred sources until content has been compared. There is no
background replication or synchronization: adding a copy links an existing file.
Full verification transfers all bytes from remote storage and may take time.
Copy playback currently streams the original format directly; the local live-transcode
workflow is not integrated with this selector. Browser codec support still applies.

`mediaSources/copies.test.ts` covers atomic mismatch rejection, shared chips,
repeated merges, local attachment/detachment, preference and fallback, changed
content, mixed NAS/Drive adapters, cancellation, stale snapshots, and pinned byte
ranges. The mixed-source tests use adapters rather than real NAS or Drive accounts.
`media-copies.spec.ts` exercises the editor's preference and mismatch controls.
