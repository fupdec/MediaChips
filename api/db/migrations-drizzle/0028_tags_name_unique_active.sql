DROP INDEX IF EXISTS `tags_name_normalized_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_normalized_unique` ON `tags` (lower(trim(`name`))) WHERE `deletedAt` IS NULL OR `deletedAt` = '';
