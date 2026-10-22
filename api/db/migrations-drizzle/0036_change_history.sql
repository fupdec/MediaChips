CREATE TABLE IF NOT EXISTS "changeHistory" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "operationId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "occurredAt" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" INTEGER NOT NULL,
  "field" TEXT NOT NULL,
  "beforeValue" TEXT NOT NULL,
  "afterValue" TEXT NOT NULL,
  "restoredAt" TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_history_operation_idx" ON "changeHistory" ("operationId", "id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_history_entity_idx" ON "changeHistory" ("entityType", "entityId", "id");
