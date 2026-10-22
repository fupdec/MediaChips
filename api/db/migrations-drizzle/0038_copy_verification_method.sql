ALTER TABLE "verifiedMediaCopies" ADD COLUMN "oshash" text;
--> statement-breakpoint
ALTER TABLE "verifiedMediaCopies" ADD COLUMN "verificationMethod" text NOT NULL DEFAULT 'sha256';
