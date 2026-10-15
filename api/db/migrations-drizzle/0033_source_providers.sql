ALTER TABLE "sourceConnections" ADD COLUMN "provider" text NOT NULL DEFAULT 'nas';
--> statement-breakpoint
ALTER TABLE "mediaLocations" ADD COLUMN "availability" text NOT NULL DEFAULT 'unknown';
--> statement-breakpoint
ALTER TABLE "mediaLocations" ADD COLUMN "lastVerifiedAt" text;
