CREATE TABLE IF NOT EXISTS copyDiscoveryJobs (
  id TEXT PRIMARY KEY NOT NULL, state TEXT NOT NULL, method TEXT NOT NULL,
  roots TEXT NOT NULL, mediaId INTEGER, listingComplete INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, error TEXT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS copyDiscoveryItems (
  id TEXT PRIMARY KEY NOT NULL, jobId TEXT NOT NULL REFERENCES copyDiscoveryJobs(id) ON DELETE CASCADE,
  path TEXT NOT NULL, name TEXT NOT NULL, size INTEGER NOT NULL, version TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'candidate', candidateIds TEXT NOT NULL DEFAULT '[]',
  mediaId INTEGER, copyId TEXT, error TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS copy_discovery_item_path_idx ON copyDiscoveryItems(jobId, path);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS copy_discovery_pending_idx ON copyDiscoveryItems(jobId, state);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS copyDiscoveryIgnored (
  path TEXT NOT NULL, version TEXT NOT NULL, mediaId INTEGER NOT NULL,
  PRIMARY KEY(path, version, mediaId)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS media_filesize_copy_discovery_idx ON media(filesize);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS verified_media_copies_size_idx ON verifiedMediaCopies(size);
