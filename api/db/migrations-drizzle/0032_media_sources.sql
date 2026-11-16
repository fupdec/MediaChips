CREATE TABLE IF NOT EXISTS "sourceConnections" (
  "id" text PRIMARY KEY NOT NULL,
  "config" text NOT NULL,
  "credentialRef" text NOT NULL,
  "createdAt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mediaLocations" (
  "id" text PRIMARY KEY NOT NULL,
  "mediaId" integer NOT NULL REFERENCES "media"("id") ON DELETE CASCADE,
  "connectionId" text NOT NULL REFERENCES "sourceConnections"("id"),
  "resourceKey" text NOT NULL,
  "version" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "media_locations_resource_idx" ON "mediaLocations" ("connectionId", "resourceKey", "version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_locations_media_idx" ON "mediaLocations" ("mediaId");
