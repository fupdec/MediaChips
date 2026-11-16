CREATE TABLE IF NOT EXISTS copyDiscoveryAutoRoots (
  id TEXT PRIMARY KEY NOT NULL, connectionId TEXT, key TEXT NOT NULL,
  excluded TEXT NOT NULL DEFAULT '[]', origin TEXT NOT NULL, monitor INTEGER NOT NULL DEFAULT 1,
  available INTEGER, identity TEXT, observedAt INTEGER
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS copyDiscoveryAutoRequests (
  rootId TEXT PRIMARY KEY NOT NULL REFERENCES copyDiscoveryAutoRoots(id) ON DELETE CASCADE,
  reasons TEXT NOT NULL, generation INTEGER NOT NULL DEFAULT 1,
  firstAt INTEGER NOT NULL, dueAt INTEGER NOT NULL, expanded INTEGER NOT NULL DEFAULT 0,
  jobId TEXT, submittedGeneration INTEGER
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS copy_discovery_auto_due_idx ON copyDiscoveryAutoRequests(jobId, dueAt);
