# Change history and undo

Open **History** in the top toolbar or **Settings → Database → Change history and undo**. Card and tag editors also open history filtered to that item; save or discard any pending edits first.

Each operation shows its time, server source, affected items and fields. Expand it to compare previous and new values. **Undo operation** restores every remaining field in that operation, including fields on other cards when opening history from one card. **Restore field** restores only the selected item's field. Restoration is itself recorded and can be undone.

The journal covers card/tag editable properties, preset and custom ratings, chip values, direct tag assignments, and marker creation, changes and deletion. It preserves the difference between a missing value, a null value, zero and an empty string. Existing libraries start recording changes after updating; there is no reconstruction of earlier edits. History is stored in the library SQLite database and survives restarts and database backups.

Restoration compares the current field with the operation's result. If a field has changed again, a required item is missing/deleted, or an old value violates a current constraint, the whole restoration rolls back. Restore unaffected fields individually or undo newer operations first. Restoring metadata does not recreate missing originals, deleted card/tag records, chip definitions or generated preview files. Existing Trash and backup tools cover those cases.

## Implementation

`changeHistory` stores field deltas. Connection-local SQLite triggers record them in the same transaction as the original writes. The API supplies an async operation context containing a generated ID and the request method/path; background writes outside a context use source `system`. Temporary triggers are installed on each writable application connection, so external database tools can still open the library without custom SQL functions. Writes made outside application connections are not journaled.

Mass metadata edits run in one transaction. Delete/insert replacements are collapsed into one field change when read; net-zero changes are omitted. Undo runs in an immediate transaction and marks original fields restored only after their inverses succeed. History endpoints paginate operations and fields; undo reads the complete operation regardless of the current page.

API: `GET /api/change-history?limit=50&offset=0&entityType=media&entityId=1`, `GET /api/change-history/:operationId?limit=100&offset=0`, `POST /api/change-history/:operationId/restore` with `{}` for the whole operation or `{ "fieldId": 123 }` for one field. Conflicts return HTTP 409.
