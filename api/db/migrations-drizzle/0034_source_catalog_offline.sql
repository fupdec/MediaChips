CREATE TABLE IF NOT EXISTS "sourceCatalogRoots" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL DEFAULT '',
  "connectionId" text NOT NULL REFERENCES "sourceConnections"("id"),
  "rootKey" text NOT NULL,
  "intervalMinutes" integer NOT NULL DEFAULT 0,
  "nextRunAt" integer,
  "lastCompletedAt" text,
  "lastResult" text,
  "lastError" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "source_catalog_root_idx" ON "sourceCatalogRoots" ("connectionId", "rootKey");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sourceCatalogEntries" (
  "rootId" text NOT NULL REFERENCES "sourceCatalogRoots"("id") ON DELETE CASCADE,
  "resourceKey" text NOT NULL,
  "version" text NOT NULL,
  "name" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "source_catalog_entry_idx" ON "sourceCatalogEntries" ("rootId", "resourceKey");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "offlineCopies" (
  "locationId" text PRIMARY KEY NOT NULL REFERENCES "mediaLocations"("id") ON DELETE CASCADE,
  "version" text NOT NULL,
  "size" integer NOT NULL,
  "fileName" text NOT NULL,
  "invalidated" integer NOT NULL DEFAULT 0,
  "contentType" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sourceCacheSettings" (
  "id" integer PRIMARY KEY NOT NULL,
  "limitBytes" integer NOT NULL DEFAULT 5368709120
);
