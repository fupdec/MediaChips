ALTER TABLE `marks` ADD COLUMN `deletedAt` text;
--> statement-breakpoint
ALTER TABLE `playlists` ADD COLUMN `deletedAt` text;
--> statement-breakpoint
ALTER TABLE `savedFilters` ADD COLUMN `deletedAt` text;
--> statement-breakpoint
ALTER TABLE `tags` ADD COLUMN `deletedAt` text;
--> statement-breakpoint
ALTER TABLE `tags` ADD COLUMN `trashOriginalName` text;
