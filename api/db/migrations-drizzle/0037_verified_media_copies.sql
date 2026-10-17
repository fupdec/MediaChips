CREATE TABLE IF NOT EXISTS "verifiedMediaCopies" (
  "id" text PRIMARY KEY NOT NULL,
  "mediaId" integer NOT NULL REFERENCES "media"("id") ON DELETE CASCADE,
  "path" text NOT NULL,
  "version" text NOT NULL,
  "sha256" text NOT NULL,
  "size" integer NOT NULL,
  "contentType" text NOT NULL,
  "availability" text NOT NULL DEFAULT 'unknown',
  "verifiedAt" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "verified_media_copies_path_idx" ON "verifiedMediaCopies" ("mediaId", "path");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mediaCopyPreferences" (
  "mediaId" integer PRIMARY KEY NOT NULL REFERENCES "media"("id") ON DELETE CASCADE,
  "copyId" text NOT NULL
);
