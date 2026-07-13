ALTER TABLE `media` ADD COLUMN `oshash` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_media_type_id_oshash_idx` ON `media` (`mediaTypeId`, `oshash`);
