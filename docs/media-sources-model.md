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
